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
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, FileText, GitPullRequest, Receipt, Wallet,
  FolderOpen, Camera, History, User, Download, Share2, Home, CheckCircle2, Mail,
} from "lucide-react";
import { EmailCustomerModal } from "@/components/estimates/EmailCustomerModal";
import { EmailHistoryPanel } from "@/components/estimates/EmailHistoryPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { useServices } from "@/components/providers/ServicesProvider";
import { SignaturePad } from "@/components/estimates/SignaturePad";
import { SharePortalPanel } from "@/components/portal/SharePortalPanel";
import {
  ProjectExpensesPanel,
  type ProjectExpensesPanelRef,
} from "@/components/expenses/ProjectExpensesPanel";
import { InvoicePaymentsPanel, type InvoicePaymentsPanelRef } from "@/components/payments/InvoicePaymentsPanel";
import { EstimateProfitSummaryCard } from "@/components/shared/EstimateProfitSummaryCard";
import { RoofAreaSummaryCard } from "@/components/estimates/RoofAreaSummaryCard";
import { SubAgentTabsPanel, type SubAgentTabsPanelRef } from "@/components/estimates/SubAgentTabsPanel";
import { TeamMembersPanel, type TeamMembersPanelRef } from "@/components/estimates/TeamMembersPanel";
import { usePermission } from "@/lib/hooks/usePermission";
import { getEstimateTermsTemplate, overrideForTemplateKey } from "@/lib/estimateTerms";
import { TermsBody } from "@/components/shared/TermsBody";
import type { CompanySettings } from "@/lib/services/companyService";
import { sumApprovedChangeOrderRevenue, calculateRevisedEstimateTotal, calculateChangeOrderRevenue, calculateSubtotal, calculateLineItemTotal } from "@/lib/services/financialCalculations";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { RoofingArea } from "@/lib/services/roofingAreaService";
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
  const { estimateService, projectService, clientService, changeOrderService, auditService, financialEngine, roofingAreaService, estimateAreaLineItemService, invoiceService, paymentService, estimateWorkflow, companyService } = useServices();
  const canEditExpenses = usePermission("expense", "create");
  const canEditPayments = usePermission("payment", "create");

  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
const [changeOrdersOpen, setChangeOrdersOpen] = useState(true);

  const expensesPanelRef = useRef<ProjectExpensesPanelRef>(null);
  const paymentsPanelRef = useRef<InvoicePaymentsPanelRef>(null);
  const subAgentTabsRef = useRef<SubAgentTabsPanelRef>(null);
  const teamMembersRef = useRef<TeamMembersPanelRef>(null);
  const [estimate, setEstimate] = useState<(Estimate & { lineItems: EstimateLineItem[] }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<EstimateFinancials | null>(null);
  const [roofingAreas, setRoofingAreas] = useState<RoofingArea[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailHistoryRefreshKey, setEmailHistoryRefreshKey] = useState(0);
  /** For resolving this company's own override of the estimate's
   * Terms & Conditions template (lib/estimateTerms.ts). Null until
   * loaded; the Terms section falls back to the built-in default in
   * the meantime (getEstimateTermsTemplate handles a missing override
   * the same way either way). */
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  /** The estimate's scope, normalized by EstimateService — items for a
   * standard estimate, roof-area scope for a roofing one. Rendering
   * `estimate.lineItems` directly showed a roofing estimate's dead
   * estimate_items rows: a "$9" line under a $24 total. */
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [areaLineItems, setAreaLineItems] = useState<Record<string, EstimateAreaLineItem[]>>({});
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
  /** Signature-specific feedback, rendered INSIDE the signature card.
   * The page-level `error` banner sits at the very top of a long page:
   * refusing to remove a signature put its explanation ~2,600px above
   * the user's viewport, so clicking "Remove signature" looked like it
   * silently did nothing. Measured live, not guessed. */
  const [signatureNotice, setSignatureNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);

  const loadFinancials = useCallback(async () => {
    if (!estimateId) return;
    try {
      setFinancials(await financialEngine.getEstimateFinancials(estimateId));
    } catch {
      setFinancials(null);
    }
  }, [financialEngine, estimateId]);

  useEffect(() => {
    loadFinancials();
  }, [loadFinancials]);

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
        const [p, c, cos, scope, history, projectInvoices, companySettingsResult] = await Promise.all([
          projectService.getById(e.projectId, true),
          e.clientId ? clientService.getById(e.clientId, true) : Promise.resolve(null),
          changeOrderService.listForEstimate(e.id),
          estimateService.getScopeLines(e.id, e.estimateType),
          auditService.getHistory(e.companyId, "estimates", e.id),
          invoiceService.listForProject(e.projectId),
          companyService.getByCompanyId(e.companyId),
        ]);
        setProject(p);
        if (c) setClient(c);
        setChangeOrders(cos);
        setScopeLines(scope);
        setActivity(history);
        setCompanySettings(companySettingsResult);

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
  }, [estimateService, projectService, clientService, changeOrderService, auditService, roofingAreaService, estimateAreaLineItemService, invoiceService, paymentService, estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!estimate) return;
    const reason = window.prompt(`Why are you deleting estimate ${estimate.estimateNumber ?? estimate.id}?`);
    if (!reason) return;
    try {
      await estimateService.softDelete(estimate.id, reason);
      router.push(editBasePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete estimate.");
    }
  }

  async function handleSignature(signature: NonNullable<Estimate["signature"]>) {
    if (!estimate) return;
    setError(null);
    setNotice(null);
    try {
      const result = await estimateWorkflow.signEstimate(estimate.id, signature);
      if (!result.ok || !result.estimate) {
        setError(result.message ?? "Failed to save signature.");
        return;
      }
      if (result.message) setNotice(result.message);
      setEstimate({ ...estimate, ...result.estimate });
      await load();
      await loadFinancials();
      setShowSignatureModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signature.");
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

  // Synchronous, no `await` before window.open. The route now
  // authenticates from the browser's own session cookie (see
  // app/api/estimates/[id]/pdf/route.ts) — no bearer token, so nothing
  // needs fetching first. That matters beyond tidiness: a `window.open`
  // called AFTER an `await` loses the browser's "this came from a real
  // click" signal, and gets silently blocked as a popup by exactly the
  // browsers/conditions a local dev session tends not to hit — which is
  // why this worked while testing locally and not for real users.
  function handleDownloadPdf() {
    if (!estimate) return;
    window.open(`/api/estimates/${estimate.id}/pdf`, "_blank");
  }

  if (loading) return <PageContainer><div className="py-16 text-center text-sm font-medium text-muted-foreground animate-pulse">Loading estimate details...</div></PageContainer>;
  if (error && !estimate) return <PageContainer><div className="rounded-xl bg-danger/10 p-4 text-sm font-medium text-danger">{error}</div></PageContainer>;
  if (!estimate) return <PageContainer><EmptyState title="Estimate not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hasApprovedChangeOrders = changeOrders.some((c) => c.status === "approved");
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(changeOrders);
  const revisedTotal = calculateRevisedEstimateTotal(estimate.total, changeOrders);

  return (
    <PageContainer>
      {/* Top Toolbar / Header */}
<div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-border/60">
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground capitalize truncate">{estimate.title || "Untitled Estimate"}</h1>
          <Badge tone={STATUS_TONE[estimate.status]} className="shrink-0">{estimate.status.replace(/_/g, " ")}</Badge>
          <span className="hidden md:inline text-xs text-muted-foreground truncate">· {project?.name} {estimate.estimateNumber ?? estimate.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => expensesPanelRef.current?.openNewExpense()}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
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
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Wallet className="size-3.5" />
            <span className="hidden sm:inline">Payment</span>
          </button>
          <button type="button" onClick={handleDownloadPdf} className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors" title="PDF">
            <Download className="size-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button type="button" onClick={() => setEmailModalOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors" title="Email Customer">
            <Mail className="size-3.5" />
            <span className="hidden sm:inline">Email</span>
          </button>
          <Link href={`${editBasePath}/${estimate.id}/edit`} className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors" title="Edit">
            <Pencil className="size-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </Link>
          <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors" title="Delete">
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {notice && <div className="mb-4 rounded-xl bg-warning/15 px-4 py-3 text-sm font-medium text-warning-foreground">{notice}</div>}

      {/* Top Summary Strip — every figure here is read straight from
          estimate.total / FinancialEngine.getEstimateFinancials, never
          recomputed. "Project Total Cost" = financials.totalExpenses,
          the exact same figure EstimateProfitSummaryCard's own "Total
          job cost" row shows further down — one number, shown twice at
          different points of emphasis, not two calculations. */}
<     div className="mb-4 grid grid-cols-4 gap-2 sm:gap-3">
        {/* Shows the REVISED total once a change order is approved.
            The original quote alone was the loudest number on the page
            and the only one that ignored approved change orders, while
            the invoice, revised-total row and net profit right beside
            it all counted them — so a $24 estimate with a $100 approved
            change order billed the customer $124 under a headline
            reading "$24". Same figure the Line Items block already
            shows (revisedTotal, from calculateRevisedEstimateTotal),
            not a second calculation; the original stays visible
            underneath so the quoted-vs-revised comparison isn't lost. */}
        <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {hasApprovedChangeOrders ? "Revised Total" : "Estimate Total"}
          </div>
          <div className="mt-0.5 text-sm sm:text-lg font-bold text-foreground truncate">
            {formatMoney(hasApprovedChangeOrders ? revisedTotal : estimate.total)}
          </div>
          {hasApprovedChangeOrders && (
            <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
              quoted {formatMoney(estimate.total)}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Project Total Cost</div>
          <div className="mt-0.5 text-sm sm:text-lg font-bold text-foreground truncate">{financials ? formatMoney(financials.totalExpenses) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Net Profit</div>
          <div className={`mt-0.5 text-sm sm:text-lg font-bold truncate ${financials ? (financials.netProfit >= 0 ? "text-success" : "text-danger") : "text-foreground"}`}>
            {financials ? formatMoney(financials.netProfit) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Status</div>
          <div className={`mt-0.5 text-sm sm:text-lg font-bold truncate ${financials ? (financials.netProfit >= 0 ? "text-success" : "text-danger") : "text-foreground"}`}>
            {financials ? (financials.netProfit >= 0 ? "Profit" : "Loss") : "—"}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Consolidated Project, Line Items & Change Orders) */}
        <div className="space-y-6 lg:col-span-8">
          
          {/* Consolidated Section Card: Project Info, Line Items, and Change Orders */}
<section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950 p-4 sm:p-6 shadow-md space-y-6 text-emerald-950 dark:text-emerald-50">
            
            {/* Quick Info Bar / Project Details — Compact mobile layout with clear hierarchy */}
            <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 rounded-t-2xl border-b border-emerald-200 dark:border-emerald-800 bg-emerald-100/70 dark:bg-emerald-900/90 px-4 py-3 sm:px-6 sm:py-4 sm:pl-[calc(1.5rem-6px)]">
  <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
    <FolderOpen className="size-3.5 text-emerald-700 dark:text-emerald-400" />
    Project Details
  </h2>

{/* Project + Client */}
<div className="mt-1.5 min-w-0">
  {/* Estimate Title — primary */}
  <div className="text-2xl sm:text-3xl font-extrabold leading-tight text-emerald-950 dark:text-white break-words">
    {estimate.title || "Untitled Estimate"}
  </div>

{/* Project + Metadata */}
<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
  {/* Project Name */}
  <div className="font-medium text-emerald-700 dark:text-emerald-300">
    {project ? (
      <Link
        href={`/projects/${project.id}`}
        className="hover:text-emerald-900 dark:hover:text-white hover:underline"
      >
        {project.name}
      </Link>
    ) : (
      <span className="text-emerald-600 dark:text-emerald-400">
        No project
      </span>
    )}
  </div>

  <span className="text-emerald-300 dark:text-emerald-700">·</span>

  {/* Created */}
  <div>
    <span className="text-emerald-700 dark:text-emerald-400">
      Created:
    </span>{" "}
    <span className="font-medium text-emerald-950 dark:text-white">
      {new Date(estimate.createdAt).toLocaleDateString()}
    </span>
  </div>

  <span className="text-emerald-300 dark:text-emerald-700">·</span>

  {/* Type */}
  <div>
    <span className="text-emerald-700 dark:text-emerald-400">
      Type:
    </span>{" "}
    <span className="font-medium capitalize text-emerald-950 dark:text-white">
      {estimate.estimateType || "Standard"}
    </span>
  </div>
</div>

{/* Client */}
<div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-emerald-800 dark:text-emerald-200">
  <User className="size-3 shrink-0 text-emerald-700 dark:text-emerald-400" />

  {client ? (
    <>
      <Link
        href={`/clients/${client.id}`}
        className="font-semibold text-emerald-950 dark:text-white hover:underline"
      >
        {client.name}
      </Link>

      {client.phone && (
        <>
          <span>·</span>
          <a href={`tel:${client.phone}`} className="hover:underline">
            {client.phone}
          </a>
        </>
      )}

      {client.address && (
        <>
          <span>·</span>
          <span className="max-w-[300px] truncate">
            {client.address.replace(/\s*\n\s*/g, ", ")}
          </span>
        </>
      )}
    </>
  ) : (
    <span>No client</span>
  )}
</div>


</div>

 

  {/* Compact description */}
{estimate.description && (
  <div className="mt-2 border-t border-emerald-200 pt-2 dark:border-emerald-800/80">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
      Description
    </div>

    <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-100/90 break-words">
      {estimate.description}
    </div>
  </div>
)}
</div>

            {/* Roof Areas (If applicable) */}
            {estimate.estimateType === "roofing" && roofingAreas.length > 0 && (
              <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  <Home className="size-4 text-emerald-700 dark:text-emerald-400" /> Roof Areas ({roofingAreas.length})
                </h3>
                <div className="space-y-4">
                  {roofingAreas.map((area, idx) => {
                    const items = areaLineItems[area.id] ?? [];
                    const areaSubtotal = calculateSubtotal(items.map((li) => ({ total: calculateLineItemTotal(li) })));
                    return <RoofAreaSummaryCard key={area.id} area={area} index={idx} areaSubtotal={areaSubtotal} />;
                  })}
                </div>
              </div>
            )}

            {/* THE SCOPE & PRICING GROUP — Structured in a high-contrast container */}
            <div className="overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white/60 dark:bg-emerald-900/30 space-y-5 p-1">

            {/* Line Items & Totals Content Area */}
  <div className="p-3 sm:p-4 bg-emerald-100/40 dark:bg-emerald-950/40 rounded-lg">
  {/* Header with toggle */}
  <div
    className="flex items-center justify-between cursor-pointer select-none"
    onClick={() => setIsLineItemsOpen(!isLineItemsOpen)}
  >
    <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
      Line Items
      <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
        ({scopeLines.length})
      </span>
    </h2>
    <button
      type="button"
      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 transition-transform"
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
        <div className="divide-y divide-emerald-100 rounded-lg border border-emerald-200 bg-white dark:divide-emerald-900/80 dark:border-emerald-800/80 dark:bg-emerald-950 sm:hidden">
          {scopeLines.map((item) => (
            <div key={item.id} className="px-2.5 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-emerald-950 dark:text-white">{item.name}</div>
                  {item.description && (
                    <div className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                      {item.description}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-emerald-950 dark:text-white">
                  {formatMoney(item.total)}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""} × {formatMoney(item.unitPrice)}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-emerald-950 sm:block">
          <table className="w-full text-xs text-emerald-950 dark:text-emerald-100">
            <thead className="bg-emerald-100/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider">Item</th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wider">Qty</th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wider">Unit</th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider">Price</th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/80">
              {scopeLines.map((item) => (
                <tr key={item.id} className="hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-emerald-950 dark:text-white">{item.name}</div>
                    {item.description && (
                      <div
                        className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 truncate max-w-[180px]"
                        title={item.description}
                      >
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-emerald-800 dark:text-emerald-200">{item.quantity}</td>
                  <td className="px-2 py-1.5 text-center text-emerald-800 dark:text-emerald-200">{item.unit ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-800 dark:text-emerald-200">{formatMoney(item.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-emerald-950 dark:text-white">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals – more compact */}
        <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-700/80 bg-white dark:bg-emerald-900/70 p-2 sm:p-3 space-y-1.5 text-xs shadow-xs dark:shadow-inner">
          {/* <div className="flex justify-between text-emerald-800 dark:text-emerald-200">
            <span>Subtotal</span>
            <span className="text-emerald-950 dark:text-white">{formatMoney(estimate.subtotal)}</span>
          </div> */}
          {estimate.markup !== 0 && (
            <div className="flex justify-between text-emerald-800 dark:text-emerald-200">
              <span>Markup</span>
              <span className="text-emerald-950 dark:text-white">{formatMoney(estimate.markup)}</span>
            </div>
          )}
          {estimate.discount !== 0 && (
            <div className="flex justify-between text-emerald-800 dark:text-emerald-200">
              <span>Discount</span>
              <span className="text-emerald-950 dark:text-white">-{formatMoney(estimate.discount)}</span>
            </div>
          )}
          {estimate.taxRate !== 0 && (
            <div className="flex justify-between text-emerald-800 dark:text-emerald-200">
              <span>Tax ({estimate.taxRate}%)</span>
            </div>
          )}
          <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-700 pt-2 font-bold text-sm text-emerald-950 dark:text-white">
            <span>Total</span>
            <span>{formatMoney(estimate.total)}</span>
          </div>
          {estimate.depositAmount > 0 && (
            <div className="flex justify-between text-emerald-800 dark:text-emerald-200 pt-1">
              <span>Requested deposit</span>
              <span className="text-emerald-950 dark:text-white">{formatMoney(estimate.depositAmount)}</span>
            </div>
          )}
          {hasApprovedChangeOrders && (
            <>
              <div className="flex justify-between text-emerald-800 dark:text-emerald-200 pt-1">
                <span>Approved change orders</span>
                <span className="text-emerald-950 dark:text-white">{formatMoney(approvedChangeOrderRevenue)}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-700 pt-2 font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                <span>Revised total</span>
                <span className="text-emerald-950 dark:text-white">{formatMoney(revisedTotal)}</span>
              </div>
            </>
          )}
        </div>
      </>
    )}
  </div>
</div>

            {/* Change Orders — Visually stepped back as a secondary block */}
<div className="border-t border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 sm:p-4 rounded-lg">
  {/* Header – always visible, clickable toggle */}
  <div
    className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none"
    onClick={() => setChangeOrdersOpen(!changeOrdersOpen)}
  >
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
      <GitPullRequest className="size-4 text-emerald-700 dark:text-emerald-400" />
      Change Orders ({changeOrders.length})
    </h2>
    <div className="flex items-center gap-2">
      <Link
        href={`/change-orders/new?projectId=${estimate.projectId}&estimateId=${estimate.id}`}
        className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white hover:underline"
        onClick={(e) => e.stopPropagation()} // Prevent toggle when clicking the link
      >
        + New change order
      </Link>
      <button
        type="button"
        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 transition-transform"
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
      <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 italic py-1">No change orders recorded yet.</p>
    ) : (
      <ul className="divide-y divide-emerald-100 dark:divide-emerald-900 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-emerald-950/60 px-3">
        {changeOrders.map((co) => (
          <li key={co.id}>
            <Link
              href={`/change-orders/${co.id}`}
              className="flex items-center justify-between gap-2 py-2.5 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            >
              <div>
                <div className="text-xs font-semibold text-emerald-950 dark:text-white">
                  {co.changeOrderNumber} - {co.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-950 dark:text-white">
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

            </div>
            {/* /scope & pricing group */}

          </section>



          {/* Side-by-Side Compact Cards for Invoices/Payments and Expenses — secondary, compact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            
            {/* Invoice & Payments Feed Card */}
            <section className="rounded-lg border border-border/60 bg-card p-3.5 flex flex-col justify-between">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Receipt className="size-4 text-primary" /> Invoice & Payments
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
                          <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-2 py-1.5 text-xs hover:text-primary transition-colors">
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

            {/* Expenses Card */}
            <section className="rounded-lg border border-border/60 bg-card p-3.5 flex flex-col justify-between">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Receipt className="size-4 text-primary" /> Expenses
                </h2>
                {estimate.projectId && (
                  <ProjectExpensesPanel
                    ref={expensesPanelRef}
                    companyId={estimate.companyId}
                    projectId={estimate.projectId}
                    estimateId={estimate.id}
                    canEdit={canEditExpenses}
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


          {/* Attachments (Docs & Photos) — secondary, compact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-border/60 bg-card p-3.5">
              <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <FolderOpen className="size-3.5 text-primary" /> Documents
              </h3>
              <p className="text-xs text-muted-foreground italic">No attached documents.</p>
            </section>
            <section className="rounded-lg border border-border/60 bg-card p-3.5">
              <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Camera className="size-3.5 text-primary" /> Photos
              </h3>
              <p className="text-xs text-muted-foreground italic">No attached photos.</p>
            </section>
          </div>

                    {/* Financial Summary — a primary section, kept prominent and
              placed ahead of the secondary Invoices/Expenses cards
              below (visual hierarchy: Roof Areas -> Financial Summary
              -> Expenses/Invoices/Payments). Same EstimateFinancials
              object the top summary strip reads from. */}
          <EstimateProfitSummaryCard financials={financials} />

          {/* Read-only — WHICH template is picked once, on Create/Edit
              (EstimateForm) and frozen onto the estimate. The template's
              TEXT is not frozen: it's resolved live from this company's
              own override (Settings → Company → Terms & Conditions),
              falling back to the built-in default in
              lib/estimateTerms.ts. Same resolution, same source, on the
              customer portal and in the generated PDF — editing a
              template in Settings changes what this section (and
              every other estimate on that key) shows immediately. */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" /> Terms &amp; Conditions
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold normal-case text-foreground">
                {getEstimateTermsTemplate(
                  estimate.termsTemplate,
                  companySettings ? overrideForTemplateKey(companySettings, estimate.termsTemplate) : null
                ).label}
              </span>
            </h2>
            <TermsBody
              className="text-xs leading-relaxed text-muted-foreground"
              body={
                getEstimateTermsTemplate(
                  estimate.termsTemplate,
                  companySettings ? overrideForTemplateKey(companySettings, estimate.termsTemplate) : null
                ).body
              }
            />
          </section>
        </div>

        {/* Right Sidebar (Sub/Agent, Portal, Client & Signature, Activity Timeline) */}
        <div className="space-y-6 lg:col-span-4">
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

          {/* ADDITIVE — renders BELOW the existing Sub/Agent panel,
              which is untouched. Assignments live in their own table
              that no financial calculation reads, so nothing above this
              point changes. */}
          <TeamMembersPanel
            ref={teamMembersRef}
            companyId={estimate.companyId}
            estimateId={estimate.id}
            projectId={estimate.projectId ?? null}
            onChanged={async () => {
              await expensesPanelRef.current?.refresh();
            }}
          />

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Share2 className="size-4 text-primary" /> Customer Portal
            </h2>
            {estimate.customerToken ? (
              <SharePortalPanel
                // The token itself IS the path — no ?token= query
                // string, so the credential never shows up in browser
                // history, referrer headers, or server access logs.
                // app/portal/[id]/page.tsx accepts this directly (and
                // still honours the old ?token= form for any link
                // already sent to a customer before this change).
                portalUrl={`${origin}/portal/${estimate.customerToken}`}
                clientName={client?.name ?? null}
                clientPhone={client?.phone ?? null}
                clientEmail={client?.email ?? null}
                documentLabel="estimate"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No portal link yet — re-save or migrate tokens to enable client view.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Mail className="size-4 text-primary" /> Email History
            </h2>
            <EmailHistoryPanel key={emailHistoryRefreshKey} estimateId={estimate.id} />
          </section>

          {/* Client Details & Condensed Signature Option */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <User className="size-4 text-primary" /> Client Details & Signature
            </h2>
            {client ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-foreground text-sm">{client.name}</div>
                  {client.email && <div className="text-muted-foreground mt-0.5">{client.email}</div>}
                  {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${estimate.signature ? "text-success" : "text-muted-foreground"}`} />
                    <span className="font-medium text-foreground">
                      {estimate.signature ? "Signed by customer" : "Awaiting signature"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSignatureNotice(null); setShowSignatureModal(!showSignatureModal); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showSignatureModal ? "Close" : "Manage"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-muted-foreground italic">No client attached to this project.</p>
                <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${estimate.signature ? "text-success" : "text-muted-foreground"}`} />
                    <span className="font-medium text-foreground">
                      {estimate.signature ? "Signed by customer" : "Awaiting signature"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSignatureNotice(null); setShowSignatureModal(!showSignatureModal); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showSignatureModal ? "Close" : "Manage"}
                  </button>
                </div>
              </div>
            )}

            {showSignatureModal && (
              <div className="mt-4 pt-4 border-t border-border/60">
                {signatureNotice && (
                  <div
                    role="status"
                    className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                      signatureNotice.tone === "error"
                        ? "bg-danger/10 text-danger"
                        : "bg-success/15 text-success"
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
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <History className="size-4 text-primary" /> Activity Timeline
            </h2>
            {panelsLoading && activity.length === 0 ? (
              <SkeletonLines rows={3} />
            ) : activity.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No recent activity.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-1">
                <ol className="space-y-3 border-l-2 border-border/80 pl-3.5">
                  {activity.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[19px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-card" />
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
          </section>
        </div>
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
        hasPortalLink={!!estimate.customerToken}
      />
    </PageContainer>
  );
}