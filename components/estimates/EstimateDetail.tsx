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
  FolderOpen, Camera, History, User, Download, Share2, Home, CheckCircle2,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
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
import { usePermission } from "@/lib/hooks/usePermission";
import { supabase } from "@/lib/supabase/client";
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
  const { estimateService, projectService, clientService, changeOrderService, auditService, financialEngine, roofingAreaService, estimateAreaLineItemService, invoiceService, paymentService, estimateWorkflow } = useServices();
  const canEditExpenses = usePermission("expense", "create");
  const canEditPayments = usePermission("payment", "create");

  const expensesPanelRef = useRef<ProjectExpensesPanelRef>(null);
  const paymentsPanelRef = useRef<InvoicePaymentsPanelRef>(null);
  const subAgentTabsRef = useRef<SubAgentTabsPanelRef>(null);
  const [estimate, setEstimate] = useState<(Estimate & { lineItems: EstimateLineItem[] }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<EstimateFinancials | null>(null);
  const [roofingAreas, setRoofingAreas] = useState<RoofingArea[]>([]);
  const [areaLineItems, setAreaLineItems] = useState<Record<string, EstimateAreaLineItem[]>>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, CustomerPayment[]>>({});
  const [paidTotalByInvoice, setPaidTotalByInvoice] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

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
    setError(null);
    try {
      const e = await estimateService.getById(estimateId);
      setEstimate(e);

      if (e) {
        // includeDeleted: true on both — this estimate's own project/
        // client context must never disappear just because either was
        // later deleted; financial history is permanent.
        const p = await projectService.getById(e.projectId, true);
        setProject(p);
        if (e.clientId) setClient(await clientService.getById(e.clientId, true));
        setChangeOrders(await changeOrderService.listForEstimate(e.id));
        setActivity(await auditService.getHistory(e.companyId, "estimates", e.id));

        if (e.estimateType === "roofing") {
          const areas = await roofingAreaService.listForEstimate(e.id, true);
          setRoofingAreas(areas);
          const lineItemsByArea: Record<string, EstimateAreaLineItem[]> = {};
          for (const area of areas) {
            lineItemsByArea[area.id] = await estimateAreaLineItemService.listForArea(area.id);
          }
          setAreaLineItems(lineItemsByArea);
        } else {
          setRoofingAreas([]);
          setAreaLineItems({});
        }

        const projectInvoices = await invoiceService.listForProject(e.projectId);
        const estimateInvoices = projectInvoices.filter((inv) => inv.estimateId === e.id);
        setInvoices(estimateInvoices);
        const paymentEntries = await Promise.all(
          estimateInvoices.map(async (inv) => [inv.id, await paymentService.listForInvoice(inv.id)] as const)
        );
        setPaymentsByInvoice(Object.fromEntries(paymentEntries));
        // totalPaid per invoice comes from PaymentService.getSummaryForInvoice
        // — the same call FinancialEngine itself uses — rather than
        // reducing the raw payments array above, so this can never
        // silently disagree with the figure Dashboard/FinancialEngine show.
        const paidTotalEntries = await Promise.all(
          estimateInvoices.map(async (inv) => [inv.id, (await paymentService.getSummaryForInvoice(inv.id)).totalPaid] as const)
        );
        setPaidTotalByInvoice(Object.fromEntries(paidTotalEntries));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimate.");
    } finally {
      setLoading(false);
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
    try {
      const result = await estimateWorkflow.unsignEstimate(estimate.id);
      if (!result.ok) {
        setError(result.message ?? "Failed to remove signature.");
        return;
      }
      if (result.estimate) setEstimate({ ...estimate, ...result.estimate });
      await load();
      await loadFinancials();
      setShowSignatureModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove signature.");
    }
  }

  async function handleDownloadPdf() {
    if (!estimate) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    window.open(`/api/estimates/${estimate.id}/pdf${token ? `?token=${token}` : ""}`, "_blank");
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
      <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground capitalize">{estimate.title || "Untitled Estimate"}</h1>
            <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{project?.name}  {estimate.estimateNumber ?? estimate.id.slice(0, 8)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => expensesPanelRef.current?.openNewExpense()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Receipt className="size-3.5" />
            Expense
          </button>
          <button
            type="button"
            onClick={() => paymentsPanelRef.current?.openNewPayment()}
            disabled={invoices.length === 0 || !canEditPayments}
            title={invoices.length === 0 ? "Sign estimate to generate invoice." : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Wallet className="size-3.5" />
            Payment
          </button>
          <button type="button" onClick={handleDownloadPdf} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
            <Download className="size-3.5" /> PDF
          </button>
          <Link href={`${editBasePath}/${estimate.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
            <Pencil className="size-3.5" /> Edit
          </Link>
          <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 className="size-3.5" /> Delete
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
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estimate Total</div>
          <div className="mt-0.5 text-lg font-bold text-foreground">{formatMoney(estimate.total)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Total Cost</div>
          <div className="mt-0.5 text-lg font-bold text-foreground">{financials ? formatMoney(financials.totalExpenses) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Profit</div>
          <div className={`mt-0.5 text-lg font-bold ${financials ? (financials.netProfit >= 0 ? "text-success" : "text-danger") : "text-foreground"}`}>
            {financials ? formatMoney(financials.netProfit) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
          <div className={`mt-0.5 text-lg font-bold ${financials ? (financials.netProfit >= 0 ? "text-success" : "text-danger") : "text-foreground"}`}>
            {financials ? (financials.netProfit >= 0 ? "Profit" : "Loss") : "—"}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Consolidated Project, Line Items & Change Orders) */}
        <div className="space-y-6 lg:col-span-8">
          
          {/* Consolidated Section Card: Project Info, Line Items, and Change Orders */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-6">
            
            {/* Quick Info Bar / Project Info */}
            <div>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Project Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Project</span>
                  <span className="text-sm font-medium text-foreground truncate block mt-0.5">
                    {project ? <Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.name}</Link> : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Title</span>
                  <span className="text-sm font-medium text-foreground truncate block mt-0.5">
                    {estimate ? <Link href={`/estimates/${estimate.id}`} className="text-primary hover:underline">{estimate.title}</Link> : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Client</span>
                  <span className="text-sm font-medium text-foreground truncate block mt-0.5">
                    {client ? <Link href={`/clients/${client.id}`} className="text-primary hover:underline">{client.name}</Link> : "None"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Created</span>
                  <span className="text-sm font-medium text-foreground block mt-0.5">{new Date(estimate.createdAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Type</span>
                  <span className="text-sm font-medium text-foreground capitalize block mt-0.5">{estimate.estimateType || "Standard"}</span>
                </div>
                {estimate.description && (
                  <div className="col-span-full pt-2 border-t border-border/50 mt-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">Description</span>
                    <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{estimate.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Roof Areas (If applicable) */}
            {estimate.estimateType === "roofing" && roofingAreas.length > 0 && (
              <div className="pt-4 border-t border-border/60">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Home className="size-4 text-primary" /> Roof Areas ({roofingAreas.length})
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

            {/* Line Items & Totals */}
            <div className="pt-4 border-t border-border/60">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Line Items</h2>
              {estimate.lineItems.length === 0 ? (
                <EmptyState title="No line items" description="Edit this estimate to add items." />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/80">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider">Item</th>
                        <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider">Qty</th>
                        <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider">Unit</th>
                        <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">Price</th>
                        <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {estimate.lineItems.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-foreground">{item.name}</div>
                            {item.description && <div className="text-[11px] text-muted-foreground">{item.description}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{item.unit ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{formatMoney(item.unitPrice)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Compact Financial Totals Breakdown */}
              <div className="mt-4 rounded-lg bg-muted/40 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMoney(estimate.subtotal)}</span></div>
                {estimate.markup !== 0 && <div className="flex justify-between text-muted-foreground"><span>Markup</span><span>{formatMoney(estimate.markup)}</span></div>}
                {estimate.discount !== 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-{formatMoney(estimate.discount)}</span></div>}
                {estimate.taxRate !== 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({estimate.taxRate}%)</span></div>}
                <div className="flex justify-between border-t border-border/80 pt-2 font-bold text-sm text-foreground"><span>Total</span><span>{formatMoney(estimate.total)}</span></div>
                {estimate.depositAmount > 0 && <div className="flex justify-between text-muted-foreground pt-1"><span>Requested deposit</span><span>{formatMoney(estimate.depositAmount)}</span></div>}
                {hasApprovedChangeOrders && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Approved change orders</span>
                      <span>{formatMoney(approvedChangeOrderRevenue)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/80 pt-1 font-bold text-primary">
                      <span>Revised total</span>
                      <span>{formatMoney(revisedTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Change Orders */}
            <div className="pt-4 border-t border-border/60">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <GitPullRequest className="size-4 text-primary" /> Change Orders ({changeOrders.length})
                </h2>
                <Link href={`/change-orders/new?projectId=${estimate.projectId}&estimateId=${estimate.id}`} className="text-xs font-semibold text-primary hover:underline">
                  + New change order
                </Link>
              </div>
              {changeOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">No change orders recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {changeOrders.map((co) => (
                    <li key={co.id}>
                      <Link href={`/change-orders/${co.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary transition-colors">
                        <div>
                          <div className="text-xs font-semibold text-foreground">{co.changeOrderNumber} - {co.title}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{formatMoney(calculateChangeOrderRevenue(co.totalAmount, co.tax))}</span>
                          <Badge tone={CHANGE_ORDER_STATUS_TONE[co.status]}>{co.status}</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </section>

          {/* Financial Summary — a primary section, kept prominent and
              placed ahead of the secondary Invoices/Expenses cards
              below (visual hierarchy: Roof Areas -> Financial Summary
              -> Expenses/Invoices/Payments). Same EstimateFinancials
              object the top summary strip reads from. */}
          <EstimateProfitSummaryCard financials={financials} />

          {/* Side-by-Side Compact Cards for Invoices/Payments and Expenses — secondary, compact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            
            {/* Invoice & Payments Feed Card */}
            <section className="rounded-lg border border-border/60 bg-card p-3.5 flex flex-col justify-between">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Receipt className="size-4 text-primary" /> Invoice & Payments
                </h2>
                {invoices.length === 0 ? (
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
              onChanged={async () => {
                await loadFinancials();
                await expensesPanelRef.current?.refresh();
              }}
            />
          )}

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Share2 className="size-4 text-primary" /> Customer Portal
            </h2>
            {estimate.customerToken ? (
              <SharePortalPanel
                portalUrl={`${origin}/portal/${estimate.id}?token=${encodeURIComponent(estimate.customerToken)}`}
                clientName={client?.name ?? null}
                clientPhone={client?.phone ?? null}
                documentLabel="estimate"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No portal link yet — re-save or migrate tokens to enable client view.
              </p>
            )}
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
                    onClick={() => setShowSignatureModal(!showSignatureModal)}
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
                    onClick={() => setShowSignatureModal(!showSignatureModal)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showSignatureModal ? "Close" : "Manage"}
                  </button>
                </div>
              </div>
            )}

            {showSignatureModal && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <SignaturePad 
                  existingSignature={estimate.signature} 
                  onSave={handleSignature} 
                  onRemove={handleRemoveSignature} 
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <History className="size-4 text-primary" /> Activity Timeline
            </h2>
            {activity.length === 0 ? (
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
    </PageContainer>
  );
}