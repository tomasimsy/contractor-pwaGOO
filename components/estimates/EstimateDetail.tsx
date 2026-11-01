"use client";

/**
 * Estimate detail content — shared by both /estimates/[id] (V1) and
 * /estimates-roof/[id] (V2) routes. Extracted so Estimate Roof V2 does
 * not duplicate this ~400-line page: both routes render the exact same
 * component against the exact same `estimates` row (an estimate is just
 * an estimate — V2 only differs in which per-area editor its Edit link
 * points to and, when estimate_type is "roofing", an added Roof Areas
 * summary section).
 *
 * Nothing here recomputes a total independently — estimate.total/
 * subtotal come straight from EstimateService, revised total from the
 * shared calculateRevisedEstimateTotal(), same as before extraction.
 */
import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, GitPullRequest, Receipt, Wallet,
  FolderOpen, Camera, History, User, Download, Share2, Home, CheckCircle2, Mail, MessageSquare, RotateCcw,
} from "lucide-react";
import { EmailCustomerModal } from "@/components/estimates/EmailCustomerModal";
import { EmailHistoryPanel } from "@/components/estimates/EmailHistoryPanel";
import {
  listEmailsForEstimate,
  getBestEmailStatus,
  EMAIL_STATUS_DOT_COLOR,
  EMAIL_STATUS_DOT_LABEL,
  type EstimateEmailStatus,
} from "@/lib/email/emailTracking";
import { supabase } from "@/lib/supabase/client";
import { resolvePortalOrigin, DEFAULT_ORIGIN } from "@/lib/portalDomain";
import { getCompanyProfileById } from "@/lib/company";
import { EstimateNotesPanel } from "@/components/estimates/EstimateNotesPanel";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/Button";
import { DocPill, CompletedBanner, DOC_BUTTON, DOC_BUTTON_PRIMARY, DOC_BUTTON_TEAL, DOC_BUTTON_DANGER } from "@/components/ui/DocKit";
import { useServices } from "@/components/providers/ServicesProvider";
import { SignaturePad } from "@/components/estimates/SignaturePad";
import { SharePortalPanel, normalizePhone, buildSmsHref } from "@/components/portal/SharePortalPanel";
import {
  ProjectExpensesPanel,
  type ProjectExpensesPanelRef,
} from "@/components/expenses/ProjectExpensesPanel";
import { InvoicePaymentsPanel, type InvoicePaymentsPanelRef } from "@/components/payments/InvoicePaymentsPanel";
import { EstimateProfitSummaryCard } from "@/components/shared/EstimateProfitSummaryCard";
import { RoofAreaSummaryCard, ROOF_AREA_ROW_GRID } from "@/components/estimates/RoofAreaSummaryCard";
import { SubAgentTabsPanel, type SubAgentTabsPanelRef } from "@/components/estimates/SubAgentTabsPanel";
import { usePermission } from "@/lib/hooks/usePermission";
import type { CompanySettings } from "@/lib/services/companyService";
import { sumApprovedChangeOrderRevenue, calculateRevisedEstimateTotal, calculateChangeOrderRevenue, calculateSubtotal, calculateLineItemTotal } from "@/lib/services/financialCalculations";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";
import { formatPropertyAddress, type Property } from "@/lib/services/propertyService";
import { laborBreakdownByEmployee, type LaborLine } from "@/lib/services/laborBreakdown";
import type { Client } from "@/lib/services/clientService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import { isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";
import type { RoofingArea } from "@/lib/services/roofingAreaService";
import type { EstimatePhoto } from "@/lib/services/estimatePhotoService";
import { ROOFING_LINE_ITEMS_ENABLED } from "@/lib/featureFlags";
import type { EstimateAreaLineItem } from "@/lib/services/estimateAreaLineItemService";
import type { AuditLogEntry, EstimateStatus, ChangeOrderStatus, EstimateFinancials } from "@/lib/services";
import type { ScopeLine } from "@/lib/services/estimateService";

const STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const CHANGE_ORDER_STATUS_TONE: Record<ChangeOrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  invoiced: "success",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function EstimateDetail({ estimateId, editBasePath = "/estimates" }: { estimateId: string; editBasePath?: string }) {
  const router = useRouter();
  const { estimateService, projectService, clientService, propertyService, changeOrderService, auditService, financialEngine, roofingAreaService, estimatePhotoService, estimateAreaLineItemService, invoiceService, paymentService, estimateWorkflow, companyService, expenseService, timeEntryService, employeeService } = useServices();
  const { profile, user } = useAuth();
  const canEditExpenses = usePermission("expense", "create");
  const canEditPayments = usePermission("payment", "create");

  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
const [changeOrdersOpen, setChangeOrdersOpen] = useState(true);
const [activeTab, setActiveTab] = useState<'customer' | 'email'>('customer');
  /** Which panel of the Money card is showing. Panels stay mounted (hidden, not unmounted) so their refs keep working. */
  const [moneyTab, setMoneyTab] = useState<'invoice' | 'expenses' | 'jobcost'>('invoice');

  const expensesPanelRef = useRef<ProjectExpensesPanelRef>(null);
  const paymentsPanelRef = useRef<InvoicePaymentsPanelRef>(null);
  const subAgentTabsRef = useRef<SubAgentTabsPanelRef>(null);
  const [estimate, setEstimate] = useState<(Estimate & { lineItems: EstimateLineItem[] }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<EstimateFinancials | null>(null);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);
  const [roofingAreas, setRoofingAreas] = useState<RoofingArea[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailHistoryRefreshKey, setEmailHistoryRefreshKey] = useState(0);
  /** Furthest-along status across every email sent for this estimate —
   * drives the color-coded dot on the header's Email button. Null
   * means nothing sent yet (no dot). See getBestEmailStatus. */
  const [emailStatus, setEmailStatus] = useState<EstimateEmailStatus | null>(null);
  /** For resolving this company's own override of the estimate's
   * Terms & Conditions template (lib/estimateTerms.ts). Null until
   * loaded; the Terms section falls back to the built-in default in
   * the meantime (getEstimateTermsTemplate handles a missing override
   * the same way either way). */
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  /** This estimate's resolved customer-facing domain (its profile's
   * portal_domain, read live from the database — see
   * lib/portalDomain.ts) — defaults to DEFAULT_ORIGIN until loaded, so
   * a share action taken before this resolves still gets a safe,
   * correct-shape link rather than an empty string. */
  const [portalOrigin, setPortalOrigin] = useState(DEFAULT_ORIGIN);
  /** This estimate's resolved profile's "Email Customer" default
   * message override, if any — see lib/company.ts's CompanyProfile.
   * Null until loaded or when the profile has none set. */
  const [emailMessageTemplate, setEmailMessageTemplate] = useState<string | null>(null);
  /** The estimate's scope, normalized by EstimateService — items for a
   * standard estimate, roof-area scope for a roofing one. Rendering
   * `estimate.lineItems` directly showed a roofing estimate's dead
   * estimate_items rows: a "$9" line under a $24 total. */
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [areaLineItems, setAreaLineItems] = useState<Record<string, EstimateAreaLineItem[]>>({});
  const [estimatePhotos, setEstimatePhotos] = useState<{ before: EstimatePhoto[]; after: EstimatePhoto[] }>({ before: [], after: [] });

  // Every photo on the estimate: estimate-level photos plus each roof area's
  // photos, each with the area it came from. Photos are served by the same
  // download route the editors use.
  const photoUrl = (storagePath: string) => `/api/estimate-photos/download?path=${encodeURIComponent(storagePath)}`;
  const photoItems = [
    ...estimatePhotos.before.map((p) => ({ key: p.id, photoType: "before" as const, url: photoUrl(p.storagePath), label: "Estimate" })),
    ...estimatePhotos.after.map((p) => ({ key: p.id, photoType: "after" as const, url: photoUrl(p.storagePath), label: "Estimate" })),
    ...roofingAreas.flatMap((area) => [
      ...(area.beforePhotos ?? []).map((p) => ({ key: p.id, photoType: "before" as const, url: photoUrl(p.storagePath), label: area.areaName })),
      ...(area.afterPhotos ?? []).map((p) => ({ key: p.id, photoType: "after" as const, url: photoUrl(p.storagePath), label: area.areaName })),
    ]),
  ];
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, CustomerPayment[]>>({});
  const [paidTotalByInvoice, setPaidTotalByInvoice] = useState<Record<string, number>>({});
  /** True only until the ESTIMATE itself resolves — the header, status
   * and totals need nothing else. Previously one `loading` flag covered
   * the whole load() chain, so the page rendered "Loading estimate
   * details..." until audit logs, photos, invoices and payments had ALL
   * returned: measured at 5,223ms, when the estimate itself was in hand
   * at 1,479ms. Nearly 4 seconds of blank page waiting for panels the
   * header does not depend on. */
  const [loading, setLoading] = useState(true);
  /** True until the secondary panels' data has arrived. Drives
   * skeletons, never a full-page block. */
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  /** "Mark Project Complete" — confirm-then-call-changeStatus, same
   * shape as the Archive action on the Project detail page. Never
   * fires automatically from a signature or invoice event; the whole
   * point is that completion is a separate, deliberate, human call
   * about the JOB, not a side effect of estimate paperwork. */
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  /** "Undo Complete" — the reverse of Mark Complete, for a job marked
   * done by mistake or reopened for more work. Same confirm-then-call-
   * changeStatus shape, its own state so the two confirmations never
   * fight over one busy/error pair. */
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  /** Signature-specific feedback, rendered INSIDE the signature card.
   * The page-level `error` banner sits at the very top of a long page:
   * refusing to remove a signature put its explanation ~2,600px above
   * the user's viewport, so clicking "Remove signature" looked like it
   * silently did nothing. Measured live, not guessed. */
  const [signatureNotice, setSignatureNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);

  /** Delete confirmation — replaces window.prompt, which some browsers
   * (e.g. inside an embedded/PWA webview) refuse to render at all
   * ("prompt() is not supported"), silently breaking the button. Also
   * lets softDelete's "cannot delete: has an invoice/change order/
   * expenses" refusal show inline in the modal instead of only as a
   * page-level banner far from the button the user just pressed. */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasExpenses, setHasExpenses] = useState(false);

  const loadFinancials = useCallback(async () => {
    if (!estimateId) return;
    try {
      setFinancials(await financialEngine.getEstimateFinancials(estimateId));
    } catch {
      setFinancials(null);
    }
    // Who the labor cost is for: approved hours on this estimate, with names
    // (former employees included, so their hours keep a name).
    const companyId = estimate?.companyId;
    if (!companyId) return;
    try {
      const [entries, people, jobPays] = await Promise.all([
        timeEntryService.listForCompany({ companyId }),
        employeeService.list({ companyId, includeDeleted: true }),
        employeeService.listJobPays(companyId),
      ]);
      setLaborLines(
        laborBreakdownByEmployee({
          entries,
          nameById: new Map(people.map((p) => [p.id, p.name])),
          estimateIds: new Set([estimateId]),
          jobPays,
          completedEstimateIds: project?.status === "completed" ? new Set([estimateId]) : new Set(),
        })
      );
    } catch {
      setLaborLines([]);
    }
  }, [financialEngine, timeEntryService, employeeService, estimateId, estimate?.companyId, project?.status]);

  useEffect(() => {
    loadFinancials();
  }, [loadFinancials]);

  useEffect(() => {
    let cancelled = false;
    listEmailsForEstimate(supabase, estimateId).then((rows) => {
      if (!cancelled) setEmailStatus(getBestEmailStatus(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [estimateId, emailHistoryRefreshKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setPanelsLoading(true);
    setError(null);
    try {
      const e = await estimateService.getById(estimateId);
      setEstimate(e);
      // Header/totals can paint NOW. Everything below streams in.
      setLoading(false);

      if (e) {
        // PARALLEL. These six reads have no dependency on one another,
        // but were awaited one after the next: page latency was their
        // SUM (~300-700ms each) instead of their max. Nothing about
        // the data changed — only the scheduling.
        //
        // includeDeleted: true on project/client — this estimate's own
        // context must never disappear just because either was later
        // deleted; financial history is permanent.
        const [p, c, cos, scope, history, projectInvoices, companySettingsResult, estimateExpenses, estimatePhotoResult] = await Promise.all([
          projectService.getById(e.projectId, true),
          e.clientId ? clientService.getById(e.clientId, true) : Promise.resolve(null),
          changeOrderService.listForEstimate(e.id),
          estimateService.getScopeLines(e.id, e.estimateType),
          auditService.getHistory(e.companyId, "estimates", e.id),
          invoiceService.listForProject(e.projectId),
          // profileId so this matches the SAME identity the PDF/email
          // send will actually use — not just the company's bare
          // default — see the "Email Customer" modal below.
          companyService.getByCompanyId(e.companyId, e.profileId),
          expenseService.listForEstimate(e.id),
          // Photos are additive: if they fail to load, the rest of the page still shows.
          estimatePhotoService.getForEstimate(e.id).catch(() => ({ before: [], after: [] })),
        ]);
        setEstimatePhotos(estimatePhotoResult);
        setProject(p);
        // Properties are additive: a failed lookup just hides the property line.
        if (p?.propertyId) {
          propertyService.getById(p.propertyId, true).then(setProperty).catch(() => setProperty(null));
        } else {
          setProperty(null);
        }
        if (c) setClient(c);
        setChangeOrders(cos);
        setScopeLines(scope);
        setActivity(history);
        setCompanySettings(companySettingsResult);
        // Drives the Delete button's disabled state below — mirrors
        // EstimateService.softDelete's own assertNoFinancialActivity
        // check (invoice/change order/expenses), so the button is
        // disabled BEFORE the click instead of only failing after.
        setHasExpenses(estimateExpenses.length > 0);

        if (e.estimateType === "roofing") {
          const areas = await roofingAreaService.listForEstimate(e.id, true);
          setRoofingAreas(areas);
          // Was an await INSIDE a for-loop: one round-trip per roof
          // area, in series. Same queries, issued together.
          const perArea = await Promise.all(
            areas.map(async (area) => [area.id, await estimateAreaLineItemService.listForArea(area.id)] as const)
          );
          setAreaLineItems(Object.fromEntries(perArea));
        } else {
          setRoofingAreas([]);
          setAreaLineItems({});
        }

        const estimateInvoices = projectInvoices.filter((inv) => inv.estimateId === e.id);
        setInvoices(estimateInvoices);
        // Both per-invoice reads in ONE parallel pass rather than two
        // sequential ones. totalPaid still comes from
        // PaymentService.getSummaryForInvoice — the same call
        // FinancialEngine uses — never from reducing the raw payments
        // array, so this can't silently disagree with the Dashboard.
        // Summaries in ONE batched call rather than two round-trips per
        // invoice; the per-invoice payment LISTS are still needed
        // individually because the panel renders each payment row.
        // BOTH batched: one query for every invoice's payment rows, one
        // for every summary — instead of two per invoice in a loop.
        const [perInvoicePayments, summaries] = await Promise.all([
          paymentService.listForInvoices(estimateInvoices.map((inv) => inv.id)),
          paymentService.getSummariesForInvoices(estimateInvoices.map((inv) => ({ id: inv.id, total: inv.total }))),
        ]);
        setPaymentsByInvoice(perInvoicePayments);
        // totalPaid still comes from PaymentService's own summary — the
        // same figure FinancialEngine uses — never from reducing the
        // raw payments array, so this can't silently disagree.
        setPaidTotalByInvoice(
          Object.fromEntries(estimateInvoices.map((inv) => [inv.id, summaries[inv.id]?.totalPaid ?? 0]))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimate.");
    } finally {
      // `loading` was already released above once the estimate arrived;
      // clearing it here too covers the error path, where it never was.
      setLoading(false);
      setPanelsLoading(false);
    }
  }, [estimateService, projectService, clientService, changeOrderService, auditService, roofingAreaService, estimatePhotoService, estimateAreaLineItemService, invoiceService, paymentService, estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    resolvePortalOrigin(supabase, estimate?.profileId ?? null).then((origin) => {
      if (!cancelled) setPortalOrigin(origin);
    });
    return () => {
      cancelled = true;
    };
  }, [estimate?.profileId]);

  useEffect(() => {
    let cancelled = false;
    getCompanyProfileById(supabase, estimate?.profileId ?? null).then((profile) => {
      if (!cancelled) setEmailMessageTemplate(profile?.emailMessageTemplate ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [estimate?.profileId]);

  function openDeleteConfirm() {
    setDeleteReason("");
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (!estimate) return;
    if (!deleteReason.trim()) {
      setDeleteError("A reason is required.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await estimateService.softDelete(estimate.id, deleteReason.trim());
      router.push(editBasePath);
    } catch (err) {
      // softDelete refuses (and throws) when this estimate has an
      // invoice, change order, or expenses attached — surfaced here,
      // inline in the modal, rather than the page-level banner.
      setDeleteError(err instanceof Error ? err.message : "Failed to delete estimate.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleSignature(signature: NonNullable<Estimate["signature"]>): Promise<{ ok: boolean; message?: string }> {
    if (!estimate) return { ok: false, message: "Estimate not loaded." };
    setError(null);
    setNotice(null);
    try {
      const result = await estimateWorkflow.signEstimate(estimate.id, signature);
      if (!result.ok || !result.estimate) {
        const message = result.message ?? "Failed to save signature.";
        setError(message);
        return { ok: false, message };
      }
      if (result.message) setNotice(result.message);
      setEstimate({ ...estimate, ...result.estimate });
      await load();
      await loadFinancials();
      setShowSignatureModal(false);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save signature.";
      setError(message);
      return { ok: false, message };
    }
  }

  async function handleRemoveSignature() {
    if (!estimate) return;
    setError(null);
    setNotice(null);
    setSignatureNotice(null);
    setSignatureBusy(true);
    try {
      const result = await estimateWorkflow.unsignEstimate(estimate.id);
      if (!result.ok) {
        // Reported in the signature card, not the page-level banner —
        // a refusal here is almost always the payment guard, and the
        // user needs to read WHY next to the button they just pressed.
        setSignatureNotice({ tone: "error", message: result.message ?? "Failed to remove signature." });
        return;
      }
      if (result.estimate) setEstimate({ ...estimate, ...result.estimate });
      await load();
      await loadFinancials();
      // The card stays OPEN on success, showing the confirmation and
      // the now-empty signature pad ready to re-sign. Closing it looked
      // identical to nothing having happened.
      setSignatureNotice({ tone: "success", message: "Signature removed. This estimate is back to draft and can be signed again." });
    } catch (err) {
      setSignatureNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to remove signature." });
    } finally {
      setSignatureBusy(false);
    }
  }

  /** A job cannot be marked complete while money is still owed on it —
   * "complete" with an unpaid/never-invoiced balance previously slipped
   * through silently. Reuses the exact same isOutstandingInvoiceStatus
   * the Invoices list's red "Unpaid" badges and the Dashboard's
   * Outstanding Invoices tile already use, so this gate can never
   * disagree with what those surfaces call unpaid. Requires at least
   * one PAID invoice too — a project with zero invoices has by
   * definition not had payment collected either. */
  const unpaidInvoices = invoices.filter((inv) => isOutstandingInvoiceStatus(inv.status));
  const hasPaidInvoice = invoices.some((inv) => inv.status === "paid");
  const completeBlockedReason =
    unpaidInvoices.length > 0
      ? `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} still unpaid — collect payment before marking this job complete.`
      : !hasPaidInvoice
      ? "No invoice has been paid for this job yet — collect payment before marking it complete."
      : null;
  const canMarkComplete = !completeBlockedReason;

  async function handleMarkProjectComplete() {
    if (!project) return;
    if (completeBlockedReason) {
      setCompleteError(completeBlockedReason);
      return;
    }
    setCompleteBusy(true);
    setCompleteError(null);
    try {
      const result = await projectService.changeStatus(project.id, "completed");
      if (!result.valid) {
        setCompleteError(result.issues.map((i) => i.message).join("; "));
        return;
      }
      if (result.project) setProject(result.project);
      setShowCompleteConfirm(false);
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Could not mark this project complete.");
    } finally {
      setCompleteBusy(false);
    }
  }

  async function handleUndoComplete() {
    if (!project) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      const result = await projectService.changeStatus(project.id, "in_progress");
      if (!result.valid) {
        setUndoError(result.issues.map((i) => i.message).join("; "));
        return;
      }
      if (result.project) setProject(result.project);
      setShowUndoConfirm(false);
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Could not undo completion for this project.");
    } finally {
      setUndoBusy(false);
    }
  }

  // window.open is called synchronously (before any `await`) so the
  // browser still credits it to the click that triggered this handler
  // — calling it after an await loses that "real click" signal and
  // gets silently popup-blocked. The tab starts blank, then we point
  // it at the real URL once the access token is fetched.
  //
  // Absolute + bearer token (not the relative/cookie link this used to
  // be): the estimate's own brand can live on a different domain than
  // whatever domain staff happen to be browsing admin from (portalOrigin,
  // resolved from the estimate's company_profiles.portal_domain, same
  // as the portal/share links below) — a cookie is scoped to the domain
  // that set it, so a relative link silently opened the WRONG brand's
  // PDF whenever those two domains differed. The route's existing
  // `token` bearer-auth mode (see app/api/estimates/[id]/pdf/route.ts)
  // authenticates the same as the cookie does, just cross-domain-safe.
  async function handleDownloadPdf() {
    if (!estimate) return;
    const win = window.open("", "_blank");
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    const url = accessToken
      ? `${portalOrigin}/api/estimates/${estimate.id}/pdf?token=${encodeURIComponent(accessToken)}`
      : `/api/estimates/${estimate.id}/pdf`;
    if (win) win.location.href = url;
    else window.open(url, "_blank");
  }

  if (loading) return <PageContainer><div className="py-16 text-center text-sm font-medium text-muted-foreground animate-pulse">Loading estimate details...</div></PageContainer>;
  if (error && !estimate) return <PageContainer><div className="rounded-xl bg-danger/10 p-4 text-sm font-medium text-danger">{error}</div></PageContainer>;
  if (!estimate) return <PageContainer><EmptyState title="Estimate not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hasApprovedChangeOrders = changeOrders.some((c) => c.status === "approved");
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(changeOrders);
  const revisedTotal = calculateRevisedEstimateTotal(estimate.total, changeOrders);
  // Mirrors EstimateService.softDelete's own assertNoFinancialActivity
  // check — disables the Delete button (with a tooltip explaining why)
  // instead of letting the user click it and only then see a refusal.
  const deleteBlockedReason =
    invoices.length > 0
      ? "Cannot delete: this estimate has an invoice (and possibly payments). Delete the invoice first."
      : changeOrders.length > 0
      ? "Cannot delete: this estimate has a change order attached. Delete the change order first."
      : hasExpenses
      ? "Cannot delete: this estimate has recorded expenses attached."
      : null;

  // Project grouping (the estimate form's "+ Add Project") — same
  // derivation the customer portal and PDF use: named groups first (in
  // first-appearance order), then any ungrouped lines flat exactly as
  // this page always rendered them. Every pre-existing scope line has
  // no groupName and falls straight into ungroupedScopeLines.
  const scopeGroupOrder: string[] = [];
  for (const line of scopeLines) {
    if (line.groupName && !scopeGroupOrder.includes(line.groupName)) scopeGroupOrder.push(line.groupName);
  }
  const scopeGroups = scopeGroupOrder.map((name) => {
    const lines = scopeLines.filter((l) => l.groupName === name);
    return { name, lines, subtotal: calculateSubtotal(lines.map((l) => ({ total: l.total }))) };
  });
  const ungroupedScopeLines = scopeGroupOrder.length > 0 ? scopeLines.filter((l) => !l.groupName) : scopeLines;

  // Totals for the Line Items block. Shown on their own for roofing estimates
  // while the line item list is turned off (see lib/featureFlags.ts).
  const totalsBlock = (
        <div className="mt-3 ml-auto w-full max-w-[300px] space-y-1.5 text-[13px]">
          {/* <div className="flex justify-between text-[#1B2430]">
            <span>Subtotal</span>
            <span className="text-[#1B2430]">{formatMoney(estimate.subtotal)}</span>
          </div> */}
          {estimate.markup !== 0 && (
            <div className="flex justify-between text-[#1B2430]">
              <span>Markup</span>
              <span className="text-[#1B2430]">{formatMoney(estimate.markup)}</span>
            </div>
          )}
          {estimate.discount !== 0 && (
            <div className="flex justify-between text-[#1B2430]">
              <span>Discount</span>
              <span className="text-[#1B2430]">-{formatMoney(estimate.discount)}</span>
            </div>
          )}
          {estimate.taxRate !== 0 && (
            <div className="flex justify-between text-[#1B2430]">
              <span>Tax ({estimate.taxRate}%)</span>
            </div>
          )}
          <div className="flex justify-between bg-[#1B2430] px-2.5 py-2 font-semibold text-sm text-white">
            <span>Total</span>
            <span>{formatMoney(estimate.total)}</span>
          </div>
          {estimate.depositAmount > 0 && (
            <div className="flex justify-between text-[#1B2430]  pt-1">
              <span>Requested deposit</span>
              <span className="text-[#1B2430]">{formatMoney(estimate.depositAmount)}</span>
            </div>
          )}
          {hasApprovedChangeOrders && (
            <>
              <div className="flex justify-between text-[#1B2430]  pt-1">
                <span>Approved change orders</span>
                <span className="text-[#1B2430]">{formatMoney(approvedChangeOrderRevenue)}</span>
              </div>
              <div className="flex justify-between border-t border-[#E2E5E0]  pt-2 font-bold text-[#5B6675]  text-sm">
                <span>Revised total</span>
                <span className="text-[#1B2430]">{formatMoney(revisedTotal)}</span>
              </div>
            </>
          )}
        </div>
  );

  return (
    <PageContainer className="font-[family-name:var(--font-doc-body)] sm:px-0 sm:py-0 lg:px-0">
      {/* Top Toolbar / Header — wraps to a second row on narrow screens
          instead of squeezing six icon buttons into one, which is what
 "quick-access buttons aligned cleanly" actually requires on a
          phone; `justify-between` alone only worked down to tablet
          width. */}
<div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5E0] bg-white px-0 py-2 sm:mb-4 sm:gap-3 sm:rounded-2xl sm:border sm:px-4 sm:py-3">
        <div className="min-w-0 flex items-center gap-3">
          <Link href={editBasePath} className="shrink-0 text-xs font-medium text-[#5B6675] hover:text-[#1B2430]">
            ← Estimates
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-[#E2E5E0] sm:block" />
          <h1 className="hidden truncate font-[family-name:var(--font-doc-display)] text-base font-semibold tracking-tight text-[#1B2430] capitalize sm:block sm:text-lg">{estimate.title || "Untitled Estimate"}</h1>
          <Badge tone={STATUS_TONE[estimate.status]} className="shrink-0">{estimate.status === "converted_to_invoice" ? "Signed & Converted to Invoice" : estimate.status.replace(/_/g, " ")}</Badge>
          {/* Project lifecycle status — a separate fact from the
              estimate status badge above (see EstimateService.listPage's
              doc comment: signed/invoiced describe the DOCUMENT,
              completed/archived describe the JOB). Only shown once the
              project has actually reached one of those two, so it
              doesn't duplicate/clutter the common draft/active states. */}
          {project?.status === "completed" && <DocPill tone="done" className="shrink-0">✓ Completed</DocPill>}
          {project?.status === "archived" && <DocPill tone="neutral" className="shrink-0">Archived</DocPill>}
          <span className="hidden md:inline text-xs text-muted-foreground truncate">· {project?.name} {estimate.estimateNumber ?? estimate.id.slice(0, 8)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              // The panel lives in the Expenses tab; show it so the dialog is visible.
              setMoneyTab("expenses");
              expensesPanelRef.current?.openNewExpense();
            }}
            className={DOC_BUTTON}
            title="Expense"
          >
            <Receipt className="size-3.5" />
            <span className="hidden sm:inline">Expense</span>
          </button>
          <button
            type="button"
            onClick={() => paymentsPanelRef.current?.openNewPayment()}
            disabled={invoices.length === 0 || !canEditPayments}
            title={invoices.length === 0 ? "Sign estimate to generate invoice." : "Payment"}
            className={DOC_BUTTON}
          >
            <Wallet className="size-3.5" />
            <span className="hidden sm:inline">Payment</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
             
            className={DOC_BUTTON}
            title="PDF"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            className={`relative ${DOC_BUTTON}`}
            title={
              emailStatus
                ? `Email Customer — last send ${EMAIL_STATUS_DOT_LABEL[emailStatus]}`
                : "Email Customer"
            }
          >
            <span className="relative">
              <Mail className="size-3.5" />
              {emailStatus && (
                <span
                  className={`absolute -right-0.5 -top-0.5 size-1.5 rounded-full ring-1 ring-card ${EMAIL_STATUS_DOT_COLOR[emailStatus]}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="hidden sm:inline">Email</span>
          </button>
          {/* Same sms: URI approach as SharePortalPanel (see its header
              comment for why: no SMS provider/credentials needed, opens
              the staff member's own messaging app with the customer's
              number and the portal link pre-filled, they hit send). Not
              a duplicate implementation — normalizePhone/buildSmsHref
              are imported from that same component. */}
          {(() => {
            const smsPhone = normalizePhone(client?.phone ?? null);
            if (!estimate.customerToken || !smsPhone) {
              return (
                <span
                  className={`${DOC_BUTTON} cursor-not-allowed opacity-50`}
                  title={!estimate.customerToken ? "No portal link yet — re-save this estimate to generate one." : "This client has no phone number on file."}
                >
                  <MessageSquare className="size-3.5" />
                  <span className="hidden sm:inline">SMS</span>
                </span>
              );
            }
            // Brand-resolved, not window.location.origin — see
            // lib/portalDomain.ts's header. `origin` is only the
            // fallback for a null/unrecognized profile.
            const portalUrl = `${portalOrigin}/portal/${estimate.customerToken}`;
            const greeting = client?.name ? `Hi ${client.name.split(" ")[0]}, ` : "Hi, ";
            const from = companySettings?.company_name ? ` from ${companySettings.company_name}` : "";
            const smsBody = `${greeting}here's your estimate${from}. You can review, approve, and download it here: ${portalUrl}`;
            return (
              <a
                href={buildSmsHref(smsPhone, smsBody)}
                className={DOC_BUTTON}
                title="Text the estimate link to the customer"
              >
                <MessageSquare className="size-3.5" />
                <span className="hidden sm:inline">SMS</span>
              </a>
            );
          })()}
                    <Link href={`${editBasePath}/${estimate.id}/edit`} className={DOC_BUTTON} title="Edit">
            <Pencil className="size-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </Link>
          {/* Only the ONE legal direct transition (see
              ValidationService's PROJECT_TRANSITIONS: in_progress ->
              completed) shows this button — a project in draft/active/
              on_hold has to move through in_progress first (normally
              automatic now — see signEstimate's advanceProjectTowardInProgress).
              Sits with Edit/Delete since it's a page-level action on the
              job, not something scoped to one card. */}
          {project?.status === "in_progress" && (
            <button
              type="button"
              onClick={() => { setCompleteError(null); setShowCompleteConfirm(true); }}
              disabled={!canMarkComplete}
              className={DOC_BUTTON_TEAL}
              title={completeBlockedReason ?? "Mark Project Complete"}
            >
              <CheckCircle2 className="size-3.5" />
              <span className="hidden sm:inline">Mark Complete</span>
            </button>
          )}

          {/* Undo Complete — the one reverse transition off "completed"
              besides archiving (see PROJECT_TRANSITIONS), for a job
              marked done by mistake or reopened for more work. No
              payment gate here — going BACK to in_progress is always
              safe regardless of invoice status. */}
          {project?.status === "completed" && (
            <button
              type="button"
              onClick={() => { setUndoError(null); setShowUndoConfirm(true); }}
              className={DOC_BUTTON}
              title="Undo Complete — move this job back to In Progress"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Undo Complete</span>
            </button>
          )}

          <button
            type="button"
            onClick={openDeleteConfirm}
            disabled={!!deleteBlockedReason}
            className={DOC_BUTTON_DANGER}
            title={deleteBlockedReason ?? "Delete this estimate (requires a reason)"}
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {notice && <div className="mb-4 rounded-xl bg-warning/15 px-4 py-3 text-sm font-medium text-warning-foreground">{notice}</div>}

      {/* Main Grid Content — flattened (no left/right wrapper divs) so
          every top-level section can carry its own `order` + explicit
 `lg:col-start`. On mobile (no lg: prefix) `order` alone
          controls stacking, since grid-cols-1 has one column anyway.
          On lg:+ each section's `lg:col-start`/`lg:col-span` pins it to
          the left (1-8) or right (9-12) column regardless of order, and
 `lg:order` restores each column's original top-to-bottom
          sequence — the standard "explicit column, ordered row"
          CSS Grid technique. Only the Job Costing card has a mobile
          order different from its desktop one (pushed to the very end
          on mobile, since it's reference detail rather than a daily
          action) — the Estimate/Project Details card stays FIRST at
          every width; it's the main point of this page and must never
          require scrolling past Invoices/Expenses to reach. Everything
          else keeps the same relative order at every width. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-6 lg:gap-y-8">
          <div className="contents lg:flex lg:flex-col lg:gap-6 lg:col-start-1 lg:row-start-1 lg:self-start">
          {/* Consolidated Section Card: Project Info, Line Items, and Change Orders */}
<section className="order-first lg:order-1 lg:col-start-1 space-y-4 rounded-xl border border-[#E2E5E0] bg-white p-3 text-[#1B2430] shadow-md sm:space-y-6 sm:rounded-2xl sm:p-6 sm:shadow-sm">
            
            {/* Quick Info Bar / Project Details — Compact mobile layout with clear hierarchy */}
            <div className="sm:-mx-6 sm:-mt-6 sm:rounded-t-2xl border-b border-[#E2E5E0] bg-white px-0 py-2 sm:px-6 sm:py-4">
  {/* Title row: estimate title on the left, number and date on the right */}
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#E2E5E0] pb-3">
    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
      <div className="min-w-0 font-[family-name:var(--font-doc-display)] text-sm font-semibold leading-tight text-[#1B2430] sm:text-xl sm:text-[22px] break-words capitalize">
        {estimate.title || "Untitled Estimate"}
      </div>
      <DocPill tone="neutral" className="capitalize">{estimate.estimateType || "Standard"}</DocPill>
    </div>
    <div className="text-[10px] text-[#5B6675] sm:text-xs">
      {estimate.estimateNumber ?? estimate.id.slice(0, 8)} · {new Date(estimate.createdAt).toLocaleDateString()}
    </div>
  </div>

  {project?.status === "completed" && (
    <div className="mt-3">
      <CompletedBanner text={`Completed${project.endDate ? ` on ${project.endDate}` : ""}. Use Undo Complete to reopen this job.`} />
    </div>
  )}

{/* Project + Client */}
<div className="mt-3 min-w-0">

{/* Info grid: client, estimate, project and type in four boxes, as in
    the estimate design. Same values and links as the old text lines. */}
<div className="grid grid-cols-1 gap-x-3 text-[11px] sm:grid-cols-2 sm:gap-3 sm:text-[13px]">
  <div className="min-w-0 py-2 sm:rounded-lg sm:border sm:border-[#E2E5E0] sm:p-3">
    <div className="text-[11px] text-[#5B6675]">Client</div>
    {client ? (
      <>
        <Link href={`/clients/${client.id}`} className="font-semibold text-[#1B2430] hover:underline">
          {client.name}
        </Link>
        {client.phone && (
          <div>
            <a href={`tel:${client.phone}`} className="text-[#5B6675] hover:underline">
              {client.phone}
            </a>
          </div>
        )}
        {client.address && (
          <div className="text-[#5B6675]">{client.address.replace(/\s*\n\s*/g, ", ")}</div>
        )}
        {property && (
          <div className="text-[#5B6675]">Property: {formatPropertyAddress(property)}</div>
        )}
      </>
    ) : (
      <div className="text-[#5B6675]">No client</div>
    )}
  </div>
  {/* On phones the estimate number and project are two more cells in the
      same row (contents); on sm+ they stay together in one box. */}
  <div className="hidden sm:block sm:min-w-0 sm:rounded-lg sm:border sm:border-[#E2E5E0] sm:p-3">
    <div className="min-w-0 py-2 sm:py-0">
      <div className="text-[11px] text-[#5B6675]">Estimate no.</div>
      <div className="font-semibold text-[#1B2430]">
        {estimate.estimateNumber ?? estimate.id.slice(0, 8)} · {new Date(estimate.createdAt).toLocaleDateString()}
      </div>
    </div>
    <div className="min-w-0 py-2 sm:mt-2 sm:py-0">
      <div className="text-[11px] text-[#5B6675]">Project</div>
      {project ? (
        <Link href={`/projects/${project.id}`} className="font-semibold text-[#1B2430] hover:underline">
          {project.name}
        </Link>
      ) : (
        <div className="text-[#5B6675]">No project</div>
      )}
    </div>
  </div>
</div>


</div>

 

  {/* Compact description */}
{estimate.description && (
  <div className="mt-2 border-t border-[#E2E5E0] pt-2">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5B6675]">
      Description
    </div>

    <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-[#1B2430]  break-words">
      {estimate.description}
    </div>
  </div>
)}
</div>

            {/* Roof Areas (If applicable): one table, each row expands to its detail */}
            {estimate.estimateType === "roofing" && roofingAreas.length > 0 && (
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-[family-name:var(--font-doc-display)] text-base font-semibold text-[#1B2430]">
                    Roof areas <span className="ml-1 font-sans text-xs font-normal text-[#8A93A0]">{roofingAreas.length}</span>
                  </h3>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#E2E5E0]">
                  <div className={`${ROOF_AREA_ROW_GRID} bg-[#F8F9F7] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#5B6675]`}>
                    <span>No.</span>
                    <span>Description</span>
                    <span className="hidden text-right sm:block">Qty</span>
                    <span className="text-right">Amount</span>
                    <span aria-hidden="true" />
                  </div>
                  {roofingAreas.map((area, idx) => {
                    const items = areaLineItems[area.id] ?? [];
                    const areaSubtotal = calculateSubtotal(items.map((li) => ({ total: calculateLineItemTotal(li) })));
                    return <RoofAreaSummaryCard key={area.id} area={area} index={idx} areaSubtotal={areaSubtotal} />;
                  })}
                </div>
              </div>
            )}

            {/* Line Items & Totals — was a card nested inside another
                card (an outer "scope & pricing group" wrapper around
                this AND Change Orders, each with their own background/
                border/padding on top of that) — reported as visually
                heavy and wasting space. Flattened to a plain divided
                section, matching how Roof Areas above it already just
                uses a top border, not its own box. */}
  {estimate.estimateType === "roofing" && !ROOFING_LINE_ITEMS_ENABLED ? (
    <div className="pt-2 border-t border-[#E2E5E0]">
    </div>
  ) : (
  <div className="pt-2 border-t border-[#E2E5E0]">
  {/* Header with toggle */}
  <div
    className="flex items-center justify-between cursor-pointer select-none"
    onClick={() => setIsLineItemsOpen(!isLineItemsOpen)}
  >
    <h2 className="text-xs font-bold uppercase tracking-wider text-[#1B2430]  flex items-center gap-2">
      Line Items
      <span className="text-[10px] font-normal text-[#5B6675]">
        ({scopeLines.length})
      </span>
    </h2>
    <button
      type="button"
      className="text-[#5B6675]  hover:text-[#1B2430]  transition-transform"
      aria-label={isLineItemsOpen ? "Collapse" : "Expand"}
    >
      <svg
        className={`w-4 h-4 transition-transform duration-200 ${isLineItemsOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </div>

  {/* Collapsible content */}
  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      isLineItemsOpen ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
    }`}
  >
    {panelsLoading && scopeLines.length === 0 ? (
      <SkeletonLines rows={3} className="py-2" />
    ) : scopeLines.length === 0 ? (
      <EmptyState title="No line items" description="Edit this estimate to add items." />
    ) : (
      <>
        {/* ---------- MOBILE: one row per line item ----------
            Five columns squeezed into a phone left the Item column so
            narrow that names broke mid-word ("Area 1Corner area -
            Estimated Repair Cost" stacked one word per line), and the
            description was capped at an arbitrary `max-w-[180px]`.
            Below `sm` each line gets the full width instead: name and
            description on their own lines, then qty/unit/price on one
            line with the total right-aligned. Read-only either way —
            same values, same formatting, same palette. */}
        <div className="divide-y divide-[#E2E5E0] rounded-lg border border-[#E2E5E0] bg-white    sm:hidden">
          {scopeGroups.map((group) => (
            <div key={group.name}>
              <div className="flex items-center justify-between bg-[#F8F9F7]  px-2.5 py-1.5">
                <span className="text-[11px] font-bold text-[#1B2430]">{group.name}</span>
                <span className="text-[11px] font-semibold text-[#1B2430]">{formatMoney(group.subtotal)}</span>
              </div>
              {group.lines.map((item) => (
                <div key={item.id} className="px-2.5 py-2 pl-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#1B2430]">{item.name}<span className="rounded-full bg-[#EEF0EC] px-1.5 py-px text-[10px] font-medium capitalize text-[#5B6675]">{item.category}</span></div>
                      {item.description && (
                        <div className="mt-0.5 text-[11px] text-[#5B6675]">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs font-semibold text-[#1B2430]">
                      {formatMoney(item.total)}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-[#1B2430]">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""} × {formatMoney(item.unitPrice)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {ungroupedScopeLines.map((item) => (
            <div key={item.id} className="px-2.5 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#1B2430]">{item.name}<span className="rounded-full bg-[#EEF0EC] px-1.5 py-px text-[10px] font-medium capitalize text-[#5B6675]">{item.category}</span></div>
                  {item.description && (
                    <div className="mt-0.5 text-[11px] text-[#5B6675]">
                      {item.description}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-[#1B2430]">
                  {formatMoney(item.total)}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-[#1B2430]">
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""} × {formatMoney(item.unitPrice)}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-[#E2E5E0]  bg-white  sm:block">
          <table className="w-full text-xs text-[#1B2430]">
            <thead className="bg-[#F8F9F7]  text-[#1B2430]  border-b border-[#E2E5E0]">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider">Item</th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wider">Qty</th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wider">Unit</th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider">Price</th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5E0]">
              {scopeGroups.map((group) => (
                <Fragment key={group.name}>
                  <tr className="bg-[#F8F9F7]">
                    <td colSpan={4} className="px-2 py-1.5 text-[11px] font-bold text-[#1B2430]">{group.name}</td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-semibold text-[#1B2430]">{formatMoney(group.subtotal)}</td>
                  </tr>
                  {group.lines.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8F9F7]  transition-colors">
                      <td className="px-2 py-1.5 pl-4">
                        <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#1B2430]">{item.name}<span className="rounded-full bg-[#EEF0EC] px-1.5 py-px text-[10px] font-medium capitalize text-[#5B6675]">{item.category}</span></div>
                        {item.description && (
                          <div
                            className="text-[11px] text-[#5B6675]  truncate max-w-[180px]"
                            title={item.description}
                          >
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[#1B2430]">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-center text-[#1B2430]">{item.unit ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right text-[#1B2430]">{formatMoney(item.unitPrice)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-[#1B2430]">{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {ungroupedScopeLines.map((item) => (
                <tr key={item.id} className="hover:bg-[#F8F9F7]  transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#1B2430]">{item.name}<span className="rounded-full bg-[#EEF0EC] px-1.5 py-px text-[10px] font-medium capitalize text-[#5B6675]">{item.category}</span></div>
                    {item.description && (
                      <div
                        className="text-[11px] text-[#5B6675]  truncate max-w-[180px]"
                        title={item.description}
                      >
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[#1B2430]">{item.quantity}</td>
                  <td className="px-2 py-1.5 text-center text-[#1B2430]">{item.unit ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-[#1B2430]">{formatMoney(item.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-[#1B2430]">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </>
    )}
  </div>
</div>
  )}

            {/* Change Orders — same flattened treatment as Line Items above. */}
<div className="pt-2 sm:border-t border-[#E2E5E0]">
  {/* Header – always visible, clickable toggle */}
  <div
    className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none"
    onClick={() => setChangeOrdersOpen(!changeOrdersOpen)}
  >
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1B2430]">
      <GitPullRequest className="size-4 text-[#5B6675]" />
      Change Orders ({changeOrders.length})
    </h2>
    <div className="flex items-center gap-2">
      <Link
        href={`/change-orders/new?projectId=${estimate.projectId}&estimateId=${estimate.id}`}
        className="text-xs font-semibold text-[#5B6675]  hover:text-[#1B2430] hover:underline"
        onClick={(e) => e.stopPropagation()} // Prevent toggle when clicking the link
      >
        + New change order
      </Link>
      <button
        type="button"
        className="text-[#5B6675]  hover:text-[#1B2430]  transition-transform"
        aria-label={changeOrdersOpen ? "Collapse" : "Expand"}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${changeOrdersOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  </div>

  {/* Collapsible content – the list or empty state */}
  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      changeOrdersOpen ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
    }`}
  >
    {panelsLoading && changeOrders.length === 0 ? (
      <SkeletonLines rows={2} className="py-1" />
    ) : changeOrders.length === 0 ? (
      <p className="text-xs text-[#5B6675]  italic py-1">No change orders recorded yet.</p>
    ) : (
      <ul className="divide-y divide-[#E2E5E0]  rounded-lg border border-[#E2E5E0]  bg-white  px-3">
        {changeOrders.map((co) => (
          <li key={co.id}>
            <Link
              href={`/change-orders/${co.id}`}
              className="flex items-center justify-between gap-2 py-2.5 hover:text-[#5B6675]  transition-colors"
            >
              <div>
                <div className="text-xs font-semibold text-[#1B2430]">
                  {co.changeOrderNumber} - {co.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#1B2430]">
                  {formatMoney(calculateChangeOrderRevenue(co.totalAmount, co.tax))}
                </span>
                <Badge tone={CHANGE_ORDER_STATUS_TONE[co.status]}>{co.status}</Badge>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
</div>

          {/* Totals sit below Change Orders, the last item of the contract. */}
          {totalsBlock}
          </section>
          {/* Attachments (Docs & Photos) — secondary, compact */}
          <div className="order-3 lg:order-3 lg:col-start-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-[#E2E5E0] bg-white p-4">
              <h3 className="mb-2 font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]">Documents</h3>
              <p className="text-xs text-[#8A93A0]">No attached documents.</p>
            </section>
            <section className="rounded-2xl border border-[#E2E5E0] bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]">Photos</h3>
                <Link href={`${editBasePath}/${estimate.id}/edit`} className={buttonClass("secondary", "h-7 px-2.5 text-xs")}>
                  Add photos
                </Link>
              </div>
              {photoItems.length === 0 ? (
                <p className="text-xs text-[#8A93A0]">No attached photos.</p>
              ) : (
                <div className="space-y-3">
                  {(["before", "after"] as const).map((type) => {
                    const items = photoItems.filter((item) => item.photoType === type);
                    if (items.length === 0) return null;
                    return (
                      <div key={type}>
                        <div className="mb-1.5 text-[11px] font-medium text-[#5B6675]">
                          {type === "before" ? "Before" : "After"} <span className="text-[#8A93A0]">{items.length}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {items.map((item) => (
                            <a key={item.key} href={item.url} target="_blank" rel="noreferrer" className="block min-w-0" title={`${item.label}, ${type}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.url}
                                alt={`${type} photo, ${item.label}`}
                                loading="lazy"
                                className="aspect-square w-full rounded-lg border border-[#E2E5E0] object-cover"
                              />
                              <span className="mt-1 block truncate text-[11px] text-[#8A93A0]">{item.label}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          </div>



          {/* Side-by-Side Compact Cards for Invoices/Payments and Expenses — secondary, compact */}
          


          {/* Right column (desktop): one sticky stack in the order of the new
              estimate view: customer, subs/agents, invoices and expenses, job
              costing, notes, activity. Same panels as before, grouped. */}
          <aside className="order-2 lg:col-start-2 lg:sticky lg:top-6 lg:self-start flex flex-col gap-4">
<hr className="border-t-2 border-[#E2E5E0] lg:hidden" />
<section className="rounded-2xl border border-[#E2E5E0] bg-white p-4 shadow-sm">
    {/* Tab Navigation */}
    <div className="flex gap-1 border-b border-[#E2E5E0] pb-1.5">
      <button
        type="button"
        onClick={() => setActiveTab('customer')}
        className={`flex-1 rounded-t-md px-2 py-1 text-[11px] font-medium transition-all ${
          activeTab === 'customer'
            ? 'bg-[#0B5F5E] text-white shadow-sm'
            : 'bg-[#F8F9F7] text-[#5B6675] hover:bg-[#F8F9F7]'
        }`}
      >
        <span className="flex items-center justify-center gap-1">
          <Share2 className="size-3" /> Customer
        </span>
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('email')}
        className={`flex-1 rounded-t-md px-2 py-1 text-[11px] font-medium transition-all ${
          activeTab === 'email'
            ? 'bg-[#0B5F5E] text-white shadow-sm'
            : 'bg-[#F8F9F7] text-[#5B6675] hover:bg-[#F8F9F7]'
        }`}
      >
        <span className="flex items-center justify-center gap-1">
          <Mail className="size-3" /> Email History
        </span>
      </button>
    </div>

    {/* Tab Content */}
    <div className="pt-2">
      {/* Tab 1: Customer Portal + Signature */}
      {activeTab === 'customer' && (
        <div className="space-y-2">
          {/* Header with Send Email button */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1 text-[11px] font-semibold text-[#1B2430]">
              <Share2 className="size-3 text-[#5B6675]" /> Share Portal
            </h2>
            <button
              type="button"
              onClick={() => setEmailModalOpen(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-[#0B5F5E] px-2 text-[11px] font-medium text-white hover:bg-[#0B5F5E]"
            >
              <Mail className="size-3" /> Send Email
            </button>
          </div>

          {estimate.customerToken ? (
            <SharePortalPanel
              portalUrl={`${portalOrigin}/portal/${estimate.customerToken}`}
              clientName={client?.name ?? null}
              clientPhone={client?.phone ?? null}
              clientEmail={client?.email ?? null}
              documentLabel="estimate"
            />
          ) : (
            <p className="text-[11px] text-[#5B6675] italic">
              No portal link yet — re-save or migrate tokens to enable client view.
            </p>
          )}

          {/* Client + signature — full name always visible */}
          <div className="flex items-center justify-between gap-2 rounded bg-[#F8F9F7] px-2 py-1.5">
            <div className="min-w-0 flex-1">
              {client ? (
                <div className="text-[11px] font-medium text-[#1B2430] whitespace-nowrap">
                  {client.name}
                </div>
              ) : (
                <div className="text-[11px] text-[#5B6675] italic">No client attached</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CheckCircle2 className={`size-3.5 ${estimate.signature ? "text-[#5B6675]" : "text-[#8A93A0]"}`} />
              <span className={`text-[11px] font-medium ${estimate.signature ? "text-[#5B6675]" : "text-[#8A93A0]"}`}>
                {estimate.signature ? "Signed" : "Unsigned"}
              </span>
              <button
                type="button"
                onClick={() => { setSignatureNotice(null); setShowSignatureModal(!showSignatureModal); }}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#5B6675] hover:bg-[#F8F9F7] hover:text-[#5B6675]"
              >
                {showSignatureModal ? "Close" : "Manage"}
              </button>
            </div>
          </div>

          {/* Signature modal */}
          {showSignatureModal && (
            <div className="border-t border-[#E2E5E0] pt-2">
              {signatureNotice && (
                <div
                  role="status"
                  className={`mb-1.5 rounded px-2 py-1 text-[11px] ${
                    signatureNotice.tone === "error"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-[#F8F9F7] text-[#5B6675] border border-[#E2E5E0]"
                  }`}
                >
                  {signatureNotice.message}
                </div>
              )}
              <div className={signatureBusy ? "pointer-events-none opacity-60" : ""}>
                <SignaturePad
                  existingSignature={estimate.signature}
                  onSave={handleSignature}
                  onRemove={handleRemoveSignature}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Email History */}
      {activeTab === 'email' && (
        <div>
          <h3 className="flex items-center gap-1 text-[11px] font-semibold text-[#1B2430] mb-2">
            <Mail className="size-3 text-[#5B6675]" /> Email History
          </h3>
          <div className="max-h-56 overflow-y-auto pr-1">
            <EmailHistoryPanel key={emailHistoryRefreshKey} estimateId={estimate.id} />
          </div>
        </div>
      )}
    </div>
  </section>

<div>
            {estimate.projectId && (
              <SubAgentTabsPanel
                ref={subAgentTabsRef}
                companyId={estimate.companyId}
                projectId={estimate.projectId}
                // So a payment recorded here is tagged with THIS job and
                // shows up in its expenses, like every other cost on it.
                estimateId={estimate.id}
                onChanged={async () => {
                  await loadFinancials();
                  await expensesPanelRef.current?.refresh();
                }}
              />
            )}
          </div>

{/* Money card: invoices & payments, expenses and job costing as tabs (design: Money). */}
<div className="rounded-2xl border border-[#c9e3d3] bg-[#edf7f1] p-4 [&_.bg-gray-50]:bg-white [&_.bg-gray-100]:bg-white [&_.bg-emerald-50]:bg-white">
            <div role="tablist" aria-label="Money" className="mb-3 flex gap-1 border-b border-[#E2E5E0] pb-2">
              {([
                ["invoice", "Invoice & payments"],
                ["expenses", "Expenses"],
                ["jobcost", "Job cost"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={moneyTab === key}
                  onClick={() => setMoneyTab(key)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    moneyTab === key ? "bg-[#16794f] text-white" : "bg-white text-[#5B6675] hover:text-[#16794f]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={moneyTab === "invoice" ? "" : "hidden"}>
            {/* Invoice & Payments Feed Card */}
            <section className="flex flex-col justify-between">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Receipt className="size-4 text-[#0B5F5E]" /> Invoice & Payments
                </h2>
                {panelsLoading && invoices.length === 0 ? (
                  <SkeletonLines rows={2} className="py-1" />
                ) : invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1">Signing this estimate will automatically generate an invoice.</p>
                ) : (
                  <div className="space-y-3">
                    <ul className="divide-y divide-border/60">
                      {invoices.map((inv) => (
                        <li key={inv.id}>
                          <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-2 py-1.5 text-xs hover:text-[#0B5F5E] transition-colors">
                            <div>
                              <span className="font-semibold text-foreground">{inv.invoiceNumber}</span>
                              <span className="ml-1.5 text-muted-foreground capitalize">({inv.status.replace(/_/g, " ")})</span>
                            </div>
                            <span className="font-semibold text-foreground">{formatMoney(inv.total)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {invoices.map((inv, idx) => (
                      <InvoicePaymentsPanel
                        key={inv.id}
                        ref={idx === 0 ? paymentsPanelRef : undefined}
                        invoiceId={inv.id}
                        companyId={estimate.companyId}
                        invoiceTotal={inv.total}
                        totalPaid={paidTotalByInvoice[inv.id] ?? 0}
                        payments={paymentsByInvoice[inv.id] ?? []}
                        canEdit={canEditPayments}
                        compact
                        onChanged={async () => {
                          await load();
                          await loadFinancials();
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            </div>

            <div className={moneyTab === "expenses" ? "" : "hidden"}>
            {/* Expenses Card */}
            <section className="flex flex-col justify-between">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Receipt className="size-4 text-[#0B5F5E]" /> Expenses
                </h2>
                {estimate.projectId && (
                  <ProjectExpensesPanel
                    ref={expensesPanelRef}
                    companyId={estimate.companyId}
                    projectId={estimate.projectId}
                    estimateId={estimate.id}
                    canEdit={canEditExpenses}
                    compact
                    onChanged={async () => {
                      // An expense recorded/edited/deleted/marked
                      // reimbursed here can change an agent's
                      // reimbursement balance (paidByType: "agent") —
                      // refresh the Agent panel immediately, not just
                      // this page's own financial summary.
                      await loadFinancials();
                      await subAgentTabsRef.current?.refreshAgents();
                    }}
                  />
                )}
              </div>
            </section>
            </div>

            <div className={moneyTab === "jobcost" ? "" : "hidden"}>
              <EstimateProfitSummaryCard financials={financials} laborLines={laborLines} />
            </div>
          </div>

<div>
            <EstimateNotesPanel
              companyId={estimate.companyId}
              estimateId={estimate.id}
              currentUserId={profile?.userId ?? null}
              currentUserLabel={profile?.fullName || user?.email || null}
            />
          </div>

<details className="group rounded-2xl border border-[#E2E5E0] bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <History className="size-4 text-[#0B5F5E]" /> Activity Timeline
                {activity.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold normal-case text-foreground">{activity.length}</span>
                )}
              </span>
              <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-3">
              {panelsLoading && activity.length === 0 ? (
                <SkeletonLines rows={3} />
              ) : activity.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No recent activity.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto pr-1">
                  <ol className="space-y-3 border-l-2 border-border/80 pl-3.5">
                    {activity.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span className="absolute -left-[19px] top-1 size-2.5 rounded-full bg-[#0E7C7B] ring-4 ring-card" />
                        <div className="text-xs font-semibold capitalize text-foreground">
                          {entry.action.replace(/_/g, " ")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(entry.occurredAt).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </details>
          </aside>


             
          

          {/* Right Sidebar (Sub/Agent, Portal, Client & Signature, Activity Timeline) */}
          {/* Kept at the top of the sidebar (not the bottom of the left
              column) so assigning/paying a subcontractor or agent never
              requires scrolling past Roof Areas/Line Items/Financial
              Summary first — same panels, just tabbed instead of
              stacked (see SubAgentTabsPanel). */}
          {/* Subcontractor/agent payments are their own domain models,
              but they DO appear in the unified Costs list above (via
              FinancialEngine.getEstimateCostEntries) — so refresh that
              list too, not just the profit figures, whenever one is
              recorded. */}
          

          {/* Combined card — Customer Portal + Client Details &
              Signature merged into one flat block (no sub-headers/tabs)
              per request: the previous tabbed version still spent a
              full header + divider on each of two closely related
              things. Email History moved to a collapsed <details> at
              the bottom — present, but not taking space by default. */}



          

          
      </div>

      <EmailCustomerModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onSent={() => setEmailHistoryRefreshKey((k) => k + 1)}
        estimateId={estimate.id}
        estimateNumber={estimate.estimateNumber ?? estimate.id.slice(0, 8)}
        clientName={client?.name ?? ""}
        clientEmail={client?.email ?? null}
        companyName={companySettings?.company_name ?? "Your Company"}
        fromEmail={companySettings?.company_email ?? null}
        hasPortalLink={!!estimate.customerToken}
        messageTemplate={emailMessageTemplate}
      />

      <Modal open={showCompleteConfirm} onClose={() => { if (!completeBusy) setShowCompleteConfirm(false); }} title="Mark Project Complete?">
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            This marks <span className="font-semibold">{project?.name}</span> as completed and moves it out of the
            active workflow (Drafts/Sent/Signed/Invoiced). This does not delete anything, and the project can still
            be reviewed later.
          </p>
          {completeBlockedReason && (
            <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{completeBlockedReason}</div>
          )}
          {completeError && (
            <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{completeError}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCompleteConfirm(false)}
              disabled={completeBusy}
              className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMarkProjectComplete}
              disabled={completeBusy || !canMarkComplete}
              className="rounded-lg bg-[#0B5F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5F5E] disabled:opacity-60"
            >
              {completeBusy ? "Marking Complete…" : "Mark Complete"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showUndoConfirm} onClose={() => { if (!undoBusy) setShowUndoConfirm(false); }} title="Undo Complete?">
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            This moves <span className="font-semibold">{project?.name}</span> back to In Progress. Use this if the
            job was marked complete by mistake, or needs more work before it's really done.
          </p>
          {undoError && (
            <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{undoError}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowUndoConfirm(false)}
              disabled={undoBusy}
              className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUndoComplete}
              disabled={undoBusy}
              className="rounded-lg bg-[#0B5F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5F5E] disabled:opacity-60"
            >
              {undoBusy ? "Undoing…" : "Undo Complete"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showDeleteConfirm} onClose={() => { if (!deleteBusy) setShowDeleteConfirm(false); }} title="Delete this estimate?">
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            Deleting <span className="font-semibold">{estimate.estimateNumber ?? estimate.id.slice(0, 8)}</span> is a soft
            delete — it disappears from lists but can be restored later. This is blocked if it already has an invoice,
            change order, or recorded expenses attached; delete those first if you really need to remove it.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason (required)
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              autoFocus
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal normal-case text-foreground focus:border-primary focus:outline-none"
              placeholder="e.g. duplicate, created in error…"
            />
          </label>
          {deleteError && (
            <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{deleteError}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteBusy}
              className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteBusy || !deleteReason.trim()}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
            >
              {deleteBusy ? "Deleting…" : "Delete Estimate"}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}