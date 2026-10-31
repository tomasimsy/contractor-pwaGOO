"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2, Ban, Send, Download, Copy, Check } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { formatMoney, isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";
import { InvoicePaymentsPanel, type InvoicePaymentsPanelRef } from "@/components/payments/InvoicePaymentsPanel";
import { sumApprovedChangeOrderRevenue, calculateRevisedEstimateTotal, calculateRemainingBalance } from "@/lib/services/financialCalculations";
import { isRevenueInvoice } from "@/lib/services/financialEngine";
import { supabase } from "@/lib/supabase/client";
import type { Invoice, InvoiceLineItem, InvoiceLifecycleStatus, InvoiceStatus } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { AuditLogEntry, PaymentStatus } from "@/lib/services";

/** Invoices get their own blue so they never read as an estimate (which uses the slate ink). */
const BAND = "bg-[#b4530e] text-white";
const SECTION_LABEL = "text-[11px] font-bold uppercase tracking-[0.08em] text-[#b4530e]";
const BUTTON_SOLID = "inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#b4530e] hover:bg-white/90";
const BUTTON_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-white/35 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10";
const BUTTON_GHOST_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-white/35 px-3 py-1.5 text-sm font-medium text-[#ffc2ba] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

/** Status pill on the blue band. Colour follows the status; the words are the status. */
const STATUS_PILL: Record<InvoiceStatus, string> = {
  draft: "bg-white/20 text-white",
  sent: "bg-[#ffd98a] text-[#2a1c10]",
  viewed: "bg-[#ffd98a] text-[#2a1c10]",
  partially_paid: "bg-[#ffd98a] text-[#2a1c10]",
  paid: "bg-[#bfe7cf] text-[#0f3d25]",
  overdue: "bg-[#f8c9c4] text-[#7a1d12]",
  cancelled: "bg-white/20 text-white",
  void: "bg-white/20 text-white",
};

/** How much of the estimate's scope to show before "Show full scope". */
const SCOPE_PREVIEW_CHARS = 280;

/** Change-order lines carry an internal key as their description; show the tag, never the key. */
const CHANGE_ORDER_KEY_PREFIX = "change-order:";

function statusLabel(status: InvoiceStatus): string {
  const words = status.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whole days since the due date, or null when it is not yet past due. */
function daysPastDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - Date.UTC(year, month - 1, day)) / 86_400_000);
  return days > 0 ? days : null;
}

function MoneyCell({ label, value, sub, subTone = "muted", emphasis = false, first = false }: {
  label: string;
  value: string;
  sub?: string | null;
  subTone?: "muted" | "danger";
  emphasis?: boolean;
  /** The first cell sits flush with the strip's left edge; the rest are divided by a rule. */
  first?: boolean;
}) {
  return (
    <div className={`min-w-0 py-2.5 sm:px-5 ${first ? "sm:pl-0" : ""}`}>
      <div className="text-[12px] text-[#7a5238]">{label}</div>
      <div className={`text-lg font-bold tabular-nums sm:text-xl ${emphasis ? "text-[#b4530e]" : "text-[#2a1c10]"}`}>{value}</div>
      {sub && <div className={`text-[12px] ${subTone === "danger" ? "text-danger" : "text-[#7a5238]"}`}>{sub}</div>}
    </div>
  );
}

function InvoiceDetailContent() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { invoiceService, paymentService, projectService, clientService, estimateService, changeOrderService, auditService } = useServices();
  const canUpdate = usePermission("invoice", "update");
  // Payments are their own resource — an accountant may record one on
  // an invoice they are not allowed to edit.
  const canRecordPayment = usePermission("payment", "create");
  const paymentsRef = useRef<InvoicePaymentsPanelRef>(null);

  const [invoice, setInvoice] = useState<(Invoice & { lineItems: InvoiceLineItem[]; hasTotalDrift?: boolean }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [summary, setSummary] = useState<{ totalPaid: number; remainingBalance: number; status: PaymentStatus } | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [projectInvoices, setProjectInvoices] = useState<Invoice[]>([]);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  /** Delete confirmation — replaces window.prompt, which some browsers
   * (embedded/PWA webviews in particular) refuse to render at all
   * ("prompt() is not supported"), silently breaking the button. Also
   * surfaces softDelete's "cannot delete: has payments/is issued"
   * refusal inline instead of only in the page-level banner. */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inv = await invoiceService.getById(invoiceId);
      setInvoice(inv);
      if (inv) {
        // includeDeleted: true on both lookups — this invoice's project/
        // client context must never disappear just because either was
        // later deleted; financial history is permanent (see
        // ProjectService/ClientService.getById's doc comments).
        const [p, pay, sum, history] = await Promise.all([
          projectService.getById(inv.projectId, true),
          paymentService.listForInvoice(inv.id),
          paymentService.getSummaryForInvoice(inv.id),
          auditService.getHistory(inv.companyId, "invoices", inv.id),
        ]);
        setProject(p);
        setPayments(pay);
        setSummary(sum);
        setActivity(history);
        if (inv.clientId) setClient(await clientService.getById(inv.clientId, true));

        // Contract context — the SAME inputs the Estimate page uses, so
        // both pages derive Contract Total from one place.
        setProjectInvoices(await invoiceService.listForProject(inv.projectId));
        if (inv.estimateId) {
          // includeDeleted: true — this invoice's own "revised total"
          // math depends on its source estimate; that must never break
          // just because the estimate was later deleted.
          const [est, cos] = await Promise.all([
            estimateService.getById(inv.estimateId, true),
            changeOrderService.listForEstimate(inv.estimateId),
          ]);
          setEstimate(est);
          setChangeOrders(cos);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  }, [invoiceService, paymentService, projectService, clientService, estimateService, changeOrderService, auditService, invoiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleStatus(to: InvoiceLifecycleStatus) {
    if (!invoice) return;
    setActionError(null);
    try {
      const result = await invoiceService.changeStatus(invoice.id, to);
      if (!result.valid) {
        setActionError(result.issues.map((i) => i.message).join("; "));
        return;
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to change status.");
    }
  }

  async function handleConfirmVoid() {
    if (!invoice) return;
    setVoiding(true);
    try {
      await handleStatus("void");
      setVoidConfirmOpen(false);
    } finally {
      setVoiding(false);
    }
  }

  function openDeleteConfirm() {
    setDeleteReason("");
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!invoice) return;
    if (!deleteReason.trim()) {
      setDeleteError("A reason is required.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await invoiceService.softDelete(invoice.id, deleteReason.trim());
      router.push("/invoices");
    } catch (err) {
      // softDelete refuses (and throws) when this invoice has active
      // payments recorded against it — surfaced here, inline in the
      // modal, rather than the page-level banner.
      setDeleteError(err instanceof Error ? err.message : "Failed to delete invoice.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!invoice?.customerToken) return;
    // window.location.origin, not a hardcoded host — the link has to be
    // correct in dev, preview, and production alike.
    const url = `${window.location.origin}/invoice/${invoice.id}?token=${encodeURIComponent(invoice.customerToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context and can be blocked; say so
      // rather than silently appearing to have copied.
      setActionError("Could not copy automatically — the link is open in the tab next to this button.");
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    window.open(`/api/invoices/${invoice.id}/pdf${token ? `?token=${token}` : ""}`, "_blank");
  }

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!invoice) return <PageContainer><EmptyState title="Invoice not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  // ---- Contract-level figures, derived with the SAME shared functions
  // the Estimate page uses (sumApprovedChangeOrderRevenue /
  // calculateRevisedEstimateTotal). Approved change orders only —
  // pending/rejected/deleted contribute nothing, because that filter
  // lives inside sumApprovedChangeOrderRevenue rather than being
  // re-implemented here.
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(changeOrders);
  const contractTotal = estimate ? calculateRevisedEstimateTotal(estimate.total, changeOrders) : null;
  const invoicedToDate = projectInvoices
    .filter(isRevenueInvoice)
    .reduce((sum, i) => sum + i.total, 0);
  const contractRemaining = contractTotal !== null ? calculateRemainingBalance(contractTotal, invoicedToDate) : null;

  const isDraft = invoice.lifecycleStatus === "draft";
  const isTerminal = invoice.lifecycleStatus === "cancelled" || invoice.lifecycleStatus === "void";
  const balance = summary?.remainingBalance ?? 0;
  const pastDue = balance > 0 ? daysPastDue(invoice.dueDate) : null;
  // Same rule as the invoices list: any invoice still owed money can take a payment.
  const canRecord = canRecordPayment && isOutstandingInvoiceStatus(invoice.status) && balance > 0;
  // Mirrors InvoiceService.softDelete's own assertNoFinancialActivity
  // check — disables the Delete button (with a tooltip explaining why)
  // instead of letting the user click it and only then see a refusal.
  const deleteBlockedReason =
    payments.length > 0
      ? "Cannot delete: this invoice has payments recorded against it. Void it instead, or delete the payments first if they were recorded in error."
      : null;
  const lineItemsTotal = invoice.lineItems.reduce((s, li) => s + li.total, 0);

  return (
    <PageContainer>
      {/* Invoice band: the page's identity, its one status, and its actions */}
      <div className={`rounded-xl px-4 py-3 sm:px-5 ${BAND}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">{invoice.invoiceNumber || invoice.id.slice(0, 8)}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[invoice.status]}`}>{statusLabel(invoice.status)}</span>
            </div>
            <p className="mt-0.5 text-[13px] text-[#fde3c8]">
              {[
                client?.name ?? "No client",
                project ? project.name : "No project",
                invoice.issueDate ? `Issued ${invoice.issueDate}` : null,
                invoice.dueDate ? `Due ${invoice.dueDate}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRecord && (
              <button type="button" onClick={() => paymentsRef.current?.openNewPayment()} className={BUTTON_SOLID}>
                Record payment
              </button>
            )}
            {canUpdate && isDraft && (
              <button
                type="button"
                onClick={() => handleStatus("sent")}
                title="Issue this invoice — locks its line items/total and marks it Sent"
                className={BUTTON_SOLID}
              >
                <Send className="size-3.5" /> Mark Sent
              </button>
            )}
            <button type="button" onClick={handleDownloadPdf} title="Download this invoice as a PDF" className={BUTTON_GHOST}>
              <Download className="size-3.5" /> PDF
            </button>
            {canUpdate && isDraft && (
              <Link href={`/invoices/${invoice.id}/edit`} title="Edit this draft invoice's line items and details" className={BUTTON_GHOST}>
                <Pencil className="size-3.5" /> Edit
              </Link>
            )}
            {canUpdate && !isDraft && !isTerminal && (
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(true)}
                title="Void this invoice — removes it from revenue totals everywhere, but keeps it and its history visible for the record. Cannot be undone."
                className={BUTTON_GHOST_DANGER}
              >
                <Ban className="size-3.5" /> Void
              </button>
            )}
            <button
              type="button"
              onClick={openDeleteConfirm}
              disabled={!!deleteBlockedReason}
              title={deleteBlockedReason ?? "Delete this invoice (requires a reason)"}
              className={BUTTON_GHOST_DANGER}
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>

      {actionError && <div className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</div>}
      {invoice.hasTotalDrift && (
        <div className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          This issued invoice&apos;s total ({formatMoney(invoice.total)}) does not match the sum of its line items
          ({formatMoney(lineItemsTotal)}). This is usually a legacy invoice whose
          billed amount included work (such as approved change orders) that was never written as a line item. The total is
          left exactly as billed — an issued invoice is a historical record and is never rewritten automatically. To correct
          it, void this invoice and reissue.
        </div>
      )}
      {!isDraft && !isTerminal && (
        <div className="mt-4 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
          This invoice has been issued — its financial values are locked. Record a payment or void it; line items can no longer be edited.
        </div>
      )}

      {/* Money strip, on a light blue tint */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 rounded-xl bg-[#fdf1e5] px-4 sm:grid-cols-4 sm:gap-0 sm:px-0">
        <MoneyCell label="Invoice total" value={formatMoney(invoice.total)} first />
        <div className="sm:border-l sm:border-[#f0d2b4]">
          <MoneyCell label="Paid" value={formatMoney(summary?.totalPaid ?? 0)} sub={`${payments.length} ${payments.length === 1 ? "payment" : "payments"}`} />
        </div>
        <div className="sm:border-l sm:border-[#f0d2b4]">
          <MoneyCell
            label="Balance due"
            value={formatMoney(balance)}
            sub={pastDue ? `${pastDue} days past due` : null}
            subTone="danger"
            emphasis
          />
        </div>
        {contractRemaining !== null && (
          <div className="sm:border-l sm:border-[#f0d2b4]">
            <MoneyCell
              label="Contract left to invoice"
              value={formatMoney(contractRemaining)}
              sub={contractTotal !== null ? `of ${formatMoney(contractTotal)} contract` : null}
            />
          </div>
        )}
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-9 rounded-xl border border-[#f0d2b4] p-4 sm:p-5">
          {/* Scope of work, carried from the estimate this invoice came from */}
          {estimate?.description && (
            <section>
              <div className={SECTION_LABEL}>Scope of work</div>
              {estimate.estimateNumber && <div className="mt-0.5 text-[12px] text-[#7a5238]">From estimate {estimate.estimateNumber}</div>}
              {estimate.description.length > SCOPE_PREVIEW_CHARS ? (
                <details className="group mt-2.5 border-l-[3px] border-[#fbc98f] pl-3.5 text-sm leading-relaxed text-foreground">
                  <summary className="cursor-pointer list-none">
                    <span className="whitespace-pre-line group-open:hidden">{estimate.description.slice(0, SCOPE_PREVIEW_CHARS).trimEnd()}…</span>
                    <span className="hidden whitespace-pre-line group-open:inline">{estimate.description}</span>
                    <span className="mt-1 block text-[12px] font-semibold text-[#b4530e] group-open:hidden">Show full scope</span>
                    <span className="mt-1 hidden text-[12px] font-semibold text-[#b4530e] group-open:block">Show less</span>
                  </summary>
                </details>
              ) : (
                <div className="mt-2.5 whitespace-pre-line border-l-[3px] border-[#fbc98f] pl-3.5 text-sm leading-relaxed text-foreground">
                  {estimate.description}
                </div>
              )}
            </section>
          )}

          {/* Line items: category and description from the estimate, each change order tagged */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[15px] font-bold text-foreground">Line items</div>
              {invoice.estimateId && (
                <div className="text-[12px] text-[#7a5238]">Snapshot at creation · later estimate edits do not change it</div>
              )}
            </div>
            {invoice.lineItems.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No line items" description={isDraft ? "Edit this invoice to add items." : "This invoice has no line items."} />
              </div>
            ) : (
              <div className="mt-2.5 overflow-x-auto border-t-2 border-[#b4530e]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#f0d2b4] text-[11px] font-bold uppercase tracking-[0.06em] text-[#7a5238]">
                      <th className="px-1 py-1.5 text-left">Item</th>
                      <th className="px-1 py-1.5 text-right">Qty</th>
                      <th className="px-1 py-1.5 text-right">Unit price</th>
                      <th className="px-1 py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f7e4cf]">
                    {invoice.lineItems.map((item) => {
                      const isChangeOrder = (item.description?.startsWith(CHANGE_ORDER_KEY_PREFIX) ?? false) || /^change order/i.test(item.name);
                      const tag = isChangeOrder ? "Change order" : item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : null;
                      const description = item.description?.startsWith(CHANGE_ORDER_KEY_PREFIX) ? null : item.description;
                      return (
                        <tr key={item.id} className="align-top">
                          <td className="px-1 py-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-foreground">{item.name}</span>
                              {tag && (
                                <span className="rounded-full bg-[#fbe3cc] px-1.5 py-px text-[10px] font-semibold text-[#b4530e]">{tag}</span>
                              )}
                            </div>
                            {description && <div className="text-[11px] leading-snug text-[#7a5238]">{description}</div>}
                          </td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{formatMoney(item.unitPrice)}</td>
                          <td className="px-1 py-1.5 text-right font-semibold tabular-nums text-foreground">{formatMoney(item.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <div className="w-full max-w-[260px] space-y-0.5 text-[13px] tabular-nums">
                {invoice.tax !== 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatMoney(invoice.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-[#b4530e] pt-1.5 font-bold text-[#b4530e]">
                  <span>Invoice total</span>
                  <span>{formatMoney(invoice.total)}</span>
                </div>
                {summary && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Paid</span>
                      <span>−{formatMoney(summary.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground">
                      <span>Balance due</span>
                      <span>{formatMoney(summary.remainingBalance)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            {invoice.hasTotalDrift && (
              <p className="mt-3 text-right text-xs text-muted-foreground">
                This total is {formatMoney(invoice.total - lineItemsTotal)} more than the line items above. On legacy invoices that
                difference is change-order work that was billed but never written as its own line item — it is already included in
                the total, so it must not be added again.
              </p>
            )}
          </section>

          <div id="payments" className="scroll-mt-6">
            <InvoicePaymentsPanel
              ref={paymentsRef}
              invoiceId={invoice.id}
              companyId={invoice.companyId}
              invoiceTotal={invoice.total}
              totalPaid={summary?.totalPaid ?? 0}
              payments={payments}
              canEdit={canRecordPayment}
              onChanged={load}
            />
          </div>
        </div>

        {/* Right rail: who, the customer's link, and where it came from */}
        <aside className="space-y-7 rounded-xl border border-[#f0d2b4] p-4 sm:p-5">
          <section>
            <div className={SECTION_LABEL}>Bill to</div>
            {client ? (
              <div className="mt-2 space-y-0.5 text-sm">
                <div className="font-semibold text-foreground">{client.name}</div>
                {client.email && <div className="text-muted-foreground">{client.email}</div>}
                {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
                {client.address && <div className="text-muted-foreground">{client.address}</div>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">This invoice&apos;s project has no client attached.</p>
            )}
          </section>

          <section>
            <div className={SECTION_LABEL}>Customer link</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              A public, no-login page where the customer can view this invoice, download the PDF, and see payment history.
            </p>
            {invoice.customerToken ? (
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-semibold text-[#b4530e]">
                <Link href={`/invoice/${invoice.id}?token=${encodeURIComponent(invoice.customerToken)}`} target="_blank" className="hover:underline">
                  Open public page ↗
                </Link>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title="Copy the public, no-login link customers use to view this invoice"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : (
              <p className="mt-2.5 text-[13px] text-muted-foreground">
                No customer link yet — this invoice predates the sharing token. Void and reissue it to generate one.
              </p>
            )}
            {invoice.customerToken && (
              <p className="mt-2 text-[12px] text-muted-foreground">Anyone with this link can view the invoice without logging in. Treat it like a password.</p>
            )}
          </section>

          <section>
            <div className={SECTION_LABEL}>Dates and source</div>
            <dl className="mt-2 space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Issued</dt>
                <dd className="text-foreground">{invoice.issueDate ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Due</dt>
                <dd className={pastDue ? "font-semibold text-danger" : "text-foreground"}>{invoice.dueDate ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Project</dt>
                <dd className="min-w-0 truncate">
                  {project ? (
                    <Link href={`/projects/${project.id}`} className="font-semibold text-[#b4530e] hover:underline">{project.name}</Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {invoice.estimateId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Estimate</dt>
                  <dd>
                    <Link href={`/estimates/${invoice.estimateId}`} className="font-semibold text-[#b4530e] hover:underline">
                      {estimate?.estimateNumber ? `${estimate.estimateNumber} ↗` : "View ↗"}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
      </div>

      {/* Reference sections, closed by default */}
      <div className="mt-10 divide-y divide-[#f0d2b4] border-y border-[#f0d2b4]">
        {estimate && (
          <details className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
              Contract summary
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
              <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
            </summary>
            <div className="mt-3 max-w-xl">
              <p className="mb-3 text-xs text-muted-foreground">
                The whole agreement across the estimate and its change orders. These are the same figures the Estimate page shows,
                from the same shared calculation — this invoice is one bill against this contract, not the contract itself.
              </p>
              <div className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between text-muted-foreground">
                  <span>Estimate total</span><span>{formatMoney(estimate.total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Approved change orders</span><span>{formatMoney(approvedChangeOrderRevenue)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Contract total</span><span>{contractTotal !== null ? formatMoney(contractTotal) : "—"}</span>
                </div>
                <div className="flex justify-between pt-1 text-muted-foreground">
                  <span>Invoiced to date{projectInvoices.length > 1 ? ` (${projectInvoices.length} invoices)` : ""}</span>
                  <span>−{formatMoney(invoicedToDate)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Remaining to invoice</span>
                  <span>{contractRemaining !== null ? formatMoney(contractRemaining) : "—"}</span>
                </div>
              </div>

              {changeOrders.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change orders</h3>
                  <ul className="space-y-1.5">
                    {changeOrders.map((co) => {
                      const counted = co.status === "approved";
                      return (
                        <li key={co.id} className="flex items-center justify-between gap-2 text-xs">
                          <Link href={`/change-orders/${co.id}`} className="font-medium text-[#b4530e] hover:underline">
                            {co.changeOrderNumber}
                          </Link>
                          <span className="flex items-center gap-2">
                            <span className={counted ? "font-medium text-foreground tabular-nums" : "text-muted-foreground line-through tabular-nums"}>
                              {formatMoney(co.totalAmount + co.tax)}
                            </span>
                            <Badge tone={counted ? "success" : co.status === "rejected" ? "danger" : "warning"}>{co.status}</Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Struck-through amounts are pending or rejected and are excluded from every figure above.
                  </p>
                </div>
              )}
            </div>
          </details>
        )}

        <details className="group py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
            Activity
            <span className="text-xs font-normal text-muted-foreground">
              {activity.length} {activity.length === 1 ? "event" : "events"} · <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="mt-3">
            {activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" description="Created/sent/viewed/cancelled/voided events will appear here." />
            ) : (
              <ol className="space-y-3 border-l-2 border-[#f0d2b4] pl-4">
                {activity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-[#b4530e]" />
                    <div className="text-sm font-medium capitalize text-foreground">{entry.action.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </div>

      <Modal open={voidConfirmOpen} onClose={() => (voiding ? undefined : setVoidConfirmOpen(false))} title="Void this invoice?">
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Voiding invoice <span className="font-medium">{invoice.invoiceNumber || invoice.id.slice(0, 8)}</span> removes it from
            every revenue calculation — Dashboard, Reports, Accounting, and Tax will no longer count its total. This cannot be
            undone from here; you cannot un-void an invoice.
          </p>
          <p className="text-sm text-muted-foreground">
            The invoice itself, its line items, and any recorded payments are kept exactly as they are — nothing is deleted, and
            its full history stays visible on this page and in invoice lists.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setVoidConfirmOpen(false)}
              disabled={voiding}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmVoid}
              disabled={voiding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
            >
              <Ban className="size-3.5" /> {voiding ? "Voiding…" : "Void Invoice"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteConfirmOpen} onClose={() => { if (!deleteBusy) setDeleteConfirmOpen(false); }} title="Delete this invoice?">
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            Deleting <span className="font-semibold">{invoice.invoiceNumber || invoice.id.slice(0, 8)}</span> is a soft
            delete — it disappears from lists but can be restored later. This is blocked if it has payments recorded
            against it; void the invoice instead if it's already been issued.
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
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteBusy}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteBusy || !deleteReason.trim()}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
            >
              {deleteBusy ? "Deleting…" : "Delete Invoice"}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

export default function InvoiceDetailPage() {
  return (
    <RequirePermission resource="invoice" action="view">
      <InvoiceDetailContent />
    </RequirePermission>
  );
}
