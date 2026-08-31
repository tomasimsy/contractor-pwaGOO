import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createServerAppServices } from "@/lib/services/server";
import { sendPushToCompany } from "@/lib/push/sendPush";
import { getResendClient, getFromAddress } from "@/lib/email/resendClient";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import { formatCurrency } from "@/lib/pdf/pdfLayout";
import { recordEmailSent } from "@/lib/email/emailTracking";
import { isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";
import {
  AUTOMATION_BACKFILL_CUTOFF,
  AUTOMATION_META,
  AUTOMATION_RUNTIME,
  computeDueDate,
  isDue,
  type AutomationKey,
} from "@/lib/services/emailAutomationRegistry";
import { getEffectiveAutomationSettings } from "@/lib/emailAutomationSettings";

/**
 * Single daily cron entry point — this app's first scheduled job.
 * Registered in vercel.json at 12:00 UTC (~8am Eastern; Vercel cron
 * has no timezone concept, so this drifts an hour across DST, which
 * is fine for "daily, in the morning" automations). Runs three
 * independent, best-effort checks per company:
 *
 *   1. The full registry-driven automation loop — every AUTOMATION_META
 *      entry except payment_receipt (which is event-triggered from
 *      InvoicePaymentsPanel.tsx, not polled here). For each automation,
 *      resolves effective settings, finds candidates, computes due
 *      dates, and sends for every candidate that's due, not already
 *      logged, and still eligible. Dedup is checked BEFORE stillEligible
 *      and send — that ordering is what actually prevents duplicate
 *      sends across repeated cron runs.
 *   2. Weekly owner digest push — Mondays only.
 *   3. "Unstaffed job starting soon" push — 3 days before a project's
 *      startDate if it still has no assignedUserId.
 *
 * Each company, and each check within a company, is wrapped so one
 * failure never blocks another — same discipline as the payment
 * receipt route this reuses (a scheduled job that dies partway
 * through and silently never retries the rest would be worse than
 * one skipped notification).
 *
 * SECURITY: the second (of two, alongside app/api/portal/sign) route
 * permitted to construct a service-role Supabase client — there is no
 * user session in a cron invocation, so this route's own check (the
 * CRON_SECRET bearer token below) is the only thing standing between
 * an anonymous request and every company's data. See portal/sign's
 * own header for the full trust-shape rationale this mirrors.
 */

const UNSTAFFED_ALERT_DAYS_BEFORE = 3;

function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET is not set — daily automations cannot run.");
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — daily automations cannot run.");
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id")
    .is("deleted_at", null);
  if (companiesError) {
    console.error("Daily automations: failed to list companies:", companiesError.message);
    return NextResponse.json({ ok: false, error: companiesError.message }, { status: 500 });
  }

  const isMonday = new Date().getUTCDay() === 1;
  const results = { automations: 0, digests: 0, unstaffedAlerts: 0, errors: 0 };

  const services = createServerAppServices(supabase);

  for (const company of companies ?? []) {
    const companyId = company.id as string;
    for (const meta of AUTOMATION_META) {
      if (meta.key === "payment_receipt") continue; // event-triggered, see Task 8
      try {
        results.automations += await runAutomation(supabase, services, companyId, meta.key);
      } catch (err) {
        results.errors++;
        console.error(`Daily automations: ${meta.key} failed for company ${companyId}:`, err);
      }
    }

    try {
      if (isMonday) {
        const sent = await sendWeeklyDigest(services, companyId);
        if (sent) results.digests++;
      }
    } catch (err) {
      results.errors++;
      console.error(`Daily automations: weekly digest failed for company ${companyId}:`, err);
    }

    try {
      results.unstaffedAlerts += await sendUnstaffedJobAlerts(services, companyId);
    } catch (err) {
      results.errors++;
      console.error(`Daily automations: unstaffed alert failed for company ${companyId}:`, err);
    }
  }

  return NextResponse.json({ ok: true, ...results, companiesChecked: (companies ?? []).length });
}

/**
 * Runs one registry automation for one company: resolves effective
 * settings, finds candidates, computes due dates, and sends for every
 * candidate that's due, not already logged, and still eligible.
 * Dedup happens BEFORE stillEligible/send — see this file's header for
 * why that ordering is what actually prevents duplicate sends on a
 * repeated cron run.
 */
async function runAutomation(
  supabase: SupabaseClient,
  services: ReturnType<typeof createServerAppServices>,
  companyId: string,
  key: AutomationKey
): Promise<number> {
  const meta = AUTOMATION_META.find((a) => a.key === key)!;
  const runtime = AUTOMATION_RUNTIME[key];
  // Known scope limitation: this cron path resolves settings at the company level only
  // (no profileId), so an entity belonging to a Business Profile with its own automation
  // override still uses the company default here. Fully resolving per-profile settings for
  // all 10 cron-polled automations would require reshaping runAutomation/findCandidates to
  // carry a profileId per candidate, which is out of scope for this fix round — the one
  // event-triggered automation, payment_receipt, already resolves profile settings correctly
  // elsewhere and is unaffected.
  const settings = await getEffectiveAutomationSettings(supabase, companyId, key);
  if (!settings.enabled) return 0;

  const candidates = await runtime.findCandidates(supabase, services, companyId);
  const now = new Date();
  let sent = 0;

  // The ONE subject value for this run: used for the dedup lookup below
  // AND handed to sendAutomationEmail, so the subject we check against
  // `estimate_emails.subject` is provably the exact string that gets
  // sent and recorded. (Previously the dedup check fell back to
  // `meta.label` while the send fell back to `renderDefault().subject` —
  // they never matched, so estimate follow-ups re-sent every day.)
  // Safe to resolve `renderDefault("")` here without the real company
  // name: no automation's `subject` interpolates companyName (only
  // bodies do), so the subject is company-name-independent.
  const defaultSubject = runtime.renderDefault("").subject;
  const subject = settings.subjectTemplate?.trim() || defaultSubject;

  for (const candidate of candidates) {
    // Backfill floor — never act on anything anchored before ship time.
    if (candidate.anchorAt < AUTOMATION_BACKFILL_CUTOFF) continue;

    const dueDate = computeDueDate(candidate.anchorAt, settings.delayValue, settings.delayUnit, meta.delayDirection);
    if (!isDue(dueDate, now)) continue;

    // A "before the trigger" reminder (invoice_due_reminder) stops
    // being correct once the anchor date itself has passed — from that
    // point on invoice_overdue_reminder is the right automation.
    if (meta.delayDirection === "before" && now > new Date(candidate.anchorAt)) continue;

    const alreadySent =
      meta.entityTable === "estimates"
        ? await estimateEmailAlreadySent(supabase, candidate.entityId, subject)
        : await projectOrInvoiceLogAlreadySent(supabase, key, candidate.entityId);
    if (alreadySent) continue;

    if (!(await runtime.stillEligible(services, candidate.entityId))) continue;

    const okToSend = await sendAutomationEmail(supabase, services, companyId, key, meta, candidate.entityId, settings, subject);
    if (okToSend) sent++;
  }

  return sent;
}

async function projectOrInvoiceLogAlreadySent(supabase: SupabaseClient, key: AutomationKey, entityId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("automation_email_log")
    .select("id")
    .eq("automation_key", key)
    .eq("entity_id", entityId)
    .limit(1);
  if (error) {
    console.error(`Failed to check automation_email_log for ${key}/${entityId} — treating as already sent to avoid a duplicate:`, error);
    return true;
  }
  return !!data && data.length > 0;
}

async function estimateEmailAlreadySent(supabase: SupabaseClient, estimateId: string, subject: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("estimate_emails")
    .select("id")
    .eq("estimate_id", estimateId)
    .eq("subject", subject)
    .limit(1);
  if (error) {
    console.error(`Failed to check estimate_emails for estimate ${estimateId} — treating as already sent to avoid a duplicate:`, error);
    return true;
  }
  return !!data && data.length > 0;
}

/**
 * Resolves the recipient, renders subject/body (settings template
 * override → runtime.renderDefault(companyName), with
 * {clientName}/{companyName} substituted), sends via the same
 * from/bcc pattern the rest of this file already uses, and on success
 * records the send — automation_email_log for project/invoice
 * automations, recordEmailSent for estimate automations.
 *
 * The `subject` is resolved by the CALLER (runAutomation) and passed
 * in, never recomputed here — that single value is what the dedup
 * check queried, what Resend sends, and what gets recorded, so the
 * three can't drift apart.
 */
async function sendAutomationEmail(
  supabase: SupabaseClient,
  services: ReturnType<typeof createServerAppServices>,
  companyId: string,
  key: AutomationKey,
  meta: (typeof AUTOMATION_META)[number],
  entityId: string,
  settings: Awaited<ReturnType<typeof getEffectiveAutomationSettings>>,
  subject: string
): Promise<boolean> {
  let clientId: string | null = null;
  let profileId: string | null = null;
  if (meta.entityTable === "projects") {
    const project = await services.projectService.getById(entityId);
    clientId = project?.clientId ?? null;
  } else if (meta.entityTable === "estimates") {
    const estimate = await services.estimateService.getById(entityId);
    clientId = estimate?.clientId ?? null;
    profileId = estimate?.profileId ?? null;
  } else {
    const invoice = await services.invoiceService.getById(entityId);
    clientId = invoice?.clientId ?? null;
    profileId = invoice?.profileId ?? null;
  }
  if (!clientId) return false;

  const { data: client } = await supabase.from("clients").select("name, email").eq("id", clientId).maybeSingle();
  const clientEmail = (client as { email?: string } | null)?.email?.trim();
  if (!clientEmail) return false;

  const company = await getCompanySettingsByCompanyId(supabase, companyId, profileId);

  // A review request with no link in it is worse than no email at all.
  // An unset review_link is the normal "not configured yet" state, so
  // skip silently rather than logging an error every single day.
  if (key === "google_review" && !company.review_link) return false;

  const unlessPlaceholder = (value: string | null | undefined) => (value && !value.startsWith("Add your") ? value : null);
  const fromEmail = getFromAddress(unlessPlaceholder(company.company_email));
  const fromAddress = `${company.company_name} <${fromEmail}>`;
  const bccAddresses = [fromEmail, company.bcc_email].filter((a): a is string => !!a);

  // renderDefault is consulted for the BODY only — `subject` came from
  // the caller and is deliberately not re-derived here.
  const rendered = AUTOMATION_RUNTIME[key].renderDefault(company.company_name);
  const body = (settings.bodyTemplate?.trim() || rendered.body)
    .replaceAll("{clientName}", (client as { name?: string } | null)?.name ?? "")
    .replaceAll("{companyName}", company.company_name)
    .replaceAll("{reviewLink}", company.review_link ?? "");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:0; background:#f4f5f6; font-family: Helvetica, Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 32px;">
          <div style="font-size: 13px; font-weight: 700; color: #111827; letter-spacing: 0.02em; margin-bottom: 24px;">
            ${company.company_name}
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #1f2429; white-space: pre-wrap;">${body}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: fromAddress,
      replyTo: fromEmail,
      ...(bccAddresses.length > 0 ? { bcc: bccAddresses } : {}),
      to: clientEmail,
      subject,
      html: emailHtml,
    });
    if (result.error) {
      console.error(`Resend rejected the ${key} email:`, result.error);
      return false;
    }
    const resendEmailId = result.data?.id;
    if (meta.entityTable === "estimates") {
      if (resendEmailId) {
        await recordEmailSent(supabase, { companyId, estimateId: entityId, resendEmailId, toAddress: clientEmail, subject, createdBy: null });
      } else {
        // recordEmailSent requires a non-null resendEmailId (estimate_emails.resend_email_id
        // is `not null unique`), so there's no safe row to write here. This gap means the
        // next cron run's estimateEmailAlreadySent check won't see this send and may re-send.
        console.error(`${key} sent via Resend for estimate ${entityId} but no resendEmailId was returned — dedup tracking may be incomplete for this send.`);
      }
    } else {
      const { error: logError } = await supabase.from("automation_email_log").insert({
        company_id: companyId,
        automation_key: key,
        entity_table: meta.entityTable,
        entity_id: entityId,
        resend_email_id: resendEmailId ?? null,
      });
      if (logError) {
        console.error(`Failed to insert automation_email_log row for ${key}/${entityId} (email itself was sent successfully):`, logError);
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to send ${key} email:`, err);
    return false;
  }
}

/**
 * Monday-only push notification summarizing the week — same
 * isOutstandingInvoiceStatus population as the Dashboard's Outstanding
 * Invoices tile and the Invoices list's red "Unpaid" labels, and the
 * same "sum of payments recorded this week" figure FinancialEngine
 * uses for cash-basis revenue, computed directly here (no
 * FinancialEngine construction needed for two numbers).
 */
async function sendWeeklyDigest(services: ReturnType<typeof createServerAppServices>, companyId: string): Promise<boolean> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const [invoices, payments] = await Promise.all([
    services.invoiceService.listForCompany({ companyId }),
    services.paymentService.listForCompany({ companyId, dateRange: { start: weekStart, end: now } }),
  ]);

  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const unpaid = invoices.filter((i) => isOutstandingInvoiceStatus(i.status));
  const unpaidTotal = unpaid.reduce((sum, i) => sum + i.total, 0);

  await sendPushToCompany(services.pushSubscriptionService, companyId, {
    title: "Weekly summary",
    body: `${formatCurrency(revenue)} collected this week · ${unpaid.length} invoice${unpaid.length === 1 ? "" : "s"} unpaid (${formatCurrency(unpaidTotal)})`,
    url: "/dashboard",
  });
  return true;
}

/**
 * Push per project whose startDate is exactly UNSTAFFED_ALERT_DAYS_BEFORE
 * days out and still has no assignedUserId. Fires once per project —
 * the target date is a single day, so it can't repeat for the same
 * project on a later run.
 */
async function sendUnstaffedJobAlerts(services: ReturnType<typeof createServerAppServices>, companyId: string): Promise<number> {
  const targetDate = daysFromNow(UNSTAFFED_ALERT_DAYS_BEFORE);
  const projects = await services.projectService.list({ companyId });
  const unstaffed = projects.filter((p) => p.startDate?.slice(0, 10) === targetDate && !p.assignedUserId);

  for (const project of unstaffed) {
    await sendPushToCompany(services.pushSubscriptionService, companyId, {
      title: "Unstaffed job starting soon",
      body: `"${project.name}" starts ${targetDate} and has no one assigned yet.`,
      url: `/projects/${project.id}`,
    });
  }
  return unstaffed.length;
}
