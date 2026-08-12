import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads/writes `estimate_emails` (supabase/migrations/
 * 20260811160000_estimate_email_tracking.sql). Deliberately NOT a
 * full Layer 2 service — this has exactly three call sites (the send
 * path, the webhook, and one UI read), so the extra ceremony of a
 * ServicesProvider-wired service isn't earning its keep yet. Revisit
 * if a fourth caller shows up.
 */

export type EstimateEmailStatus = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed";

export interface EstimateEmailRecord {
  id: string;
  estimateId: string;
  resendEmailId: string;
  toAddress: string;
  subject: string;
  status: EstimateEmailStatus;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
}

function rowToRecord(row: any): EstimateEmailRecord {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    resendEmailId: row.resend_email_id,
    toAddress: row.to_address,
    subject: row.subject,
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    clickedAt: row.clicked_at,
    bouncedAt: row.bounced_at,
    complainedAt: row.complained_at,
  };
}

/** Called immediately after Resend accepts a send — under the STAFF
 * session's own cookie client, so RLS's insert policy (company_id
 * must match the caller's own company) applies normally. */
export async function recordEmailSent(
  supabase: SupabaseClient,
  input: { companyId: string; estimateId: string; resendEmailId: string; toAddress: string; subject: string; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase.from("estimate_emails").insert({
    company_id: input.companyId,
    estimate_id: input.estimateId,
    resend_email_id: input.resendEmailId,
    to_address: input.toAddress,
    subject: input.subject,
    status: "sent",
    created_by: input.createdBy,
  });
  // Never block the user-facing "email sent" success on this — the
  // email genuinely was sent by this point; a tracking-row failure
  // should surface in logs, not turn a successful send into a
  // reported failure.
  if (error) console.error("Failed to record estimate_emails row (email itself was sent successfully):", error);
}

/** Read path for the UI — RLS-scoped to the caller's own company via
 * the normal select policy, no service-role involved. */
export async function listEmailsForEstimate(supabase: SupabaseClient, estimateId: string): Promise<EstimateEmailRecord[]> {
  const { data, error } = await supabase
    .from("estimate_emails")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("sent_at", { ascending: false });
  if (error) {
    console.error("Failed to load estimate_emails:", error);
    return [];
  }
  return (data || []).map(rowToRecord);
}

/** Status precedence — a webhook event only moves status FORWARD.
 * Guards against a late-arriving 'delivered' event overwriting an
 * already-recorded 'opened' (Resend does not guarantee event
 * ordering). 'clicked' ranks above 'opened' — clicking the proposal
 * link is a strictly more engaged signal than just opening the email.
 * 'bounced'/'complained'/'failed' are terminal and always win once
 * reached. */
const STATUS_RANK: Record<EstimateEmailStatus, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  bounced: 4,
  complained: 4,
  failed: 4,
};

/** Called from the webhook route with a SERVICE-ROLE client (no user
 * session exists for an inbound webhook) — this bypasses RLS by
 * design; the webhook route's own Svix signature check is what stands
 * in for authorization here. Matches by resend_email_id, the one
 * identifier every Resend webhook event payload carries. */
export async function applyResendEvent(
  supabaseServiceRole: SupabaseClient,
  input: { resendEmailId: string; status: EstimateEmailStatus; occurredAt: string }
): Promise<void> {
  const { data: existing, error: fetchError } = await supabaseServiceRole
    .from("estimate_emails")
    .select("id, status")
    .eq("resend_email_id", input.resendEmailId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to look up estimate_emails row for webhook event:", fetchError);
    return;
  }
  if (!existing) {
    // A webhook event for a send this table never recorded (e.g. sent
    // before this migration existed, or the insert failed silently
    // above) — nothing to update. Not an error condition.
    return;
  }
  if (STATUS_RANK[input.status as EstimateEmailStatus] < STATUS_RANK[existing.status as EstimateEmailStatus]) {
    return; // out-of-order event; existing status is already further along
  }

  const timestampColumn: Partial<Record<EstimateEmailStatus, string>> = {
    delivered: "delivered_at",
    opened: "opened_at",
    clicked: "clicked_at",
    bounced: "bounced_at",
    complained: "complained_at",
  };
  const patch: Record<string, unknown> = { status: input.status, last_event_at: input.occurredAt };
  const column = timestampColumn[input.status];
  if (column) patch[column] = input.occurredAt;

  const { error: updateError } = await supabaseServiceRole.from("estimate_emails").update(patch).eq("id", existing.id);
  if (updateError) console.error("Failed to update estimate_emails row from webhook event:", updateError);
}
