"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2, Receipt, Wallet, History, User, Download, Send, Ban, Link2, Copy, Check, FileText } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { INVOICE_STATUS_TONE, formatMoney } from "@/components/invoices/invoiceStatus";
import { InvoicePaymentsPanel } from "@/components/payments/InvoicePaymentsPanel";
import { sumApprovedChangeOrderRevenue, calculateRevisedEstimateTotal, calculateRemainingBalance } from "@/lib/services/financialCalculations";
import { isRevenueInvoice } from "@/lib/services/financialEngine";
import { supabase } from "@/lib/supabase/client";
import type { Invoice, InvoiceLineItem, InvoiceLifecycleStatus } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { AuditLogEntry, PaymentStatus } from "@/lib/services";

function InvoiceDetailContent() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { invoiceService, paymentService, projectService, clientService, estimateService, changeOrderService, auditService } = useServices();
  const canUpdate = usePermission("invoice", "update");
  // Payments are their own resource — an accountant may record one on
  // an invoice they are not allowed to edit.
  const canRecordPayment = usePermission("payment", "create");

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

  async function handleDelete() {
    if (!invoice) return;
    const reason = window.prompt(`Why are you deleting invoice ${invoice.invoiceNumber}?`);
    if (!reason) return;
    try {
      await invoiceService.softDelete(invoice.id, reason);
      router.push("/invoices");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete invoice.");
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

  return (
    <PageContainer>
      <PageHeader
        title={invoice.invoiceNumber || invoice.id.slice(0, 8)}
        description={project ? `For ${project.name}` : "No project"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>{invoice.status.replace(/_/g, " ")}</Badge>
            <button type="button" onClick={handleDownloadPdf} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Download className="size-3.5" /> PDF
            </button>
            {canUpdate && isDraft && (
              <>
                <Link href={`/invoices/${invoice.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                  <Pencil className="size-3.5" /> Edit
                </Link>
                <button type="button" onClick={() => handleStatus("sent")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Send className="size-3.5" /> Mark Sent
                </button>
              </>
            )}
            {canUpdate && !isDraft && !isTerminal && (
              <button type="button" onClick={() => setVoidConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
                <Ban className="size-3.5" /> Void
              </button>
            )}
            <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        }
      />

      {actionError && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</div>}
      {invoice.hasTotalDrift && (
        <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          This issued invoice&apos;s total ({formatMoney(invoice.total)}) does not match the sum of its line items
          ({formatMoney(invoice.lineItems.reduce((s, li) => s + li.total, 0))}). This is usually a legacy invoice whose
          billed amount included work (such as approved change orders) that was never written as a line item. The total is
          left exactly as billed — an issued invoice is a historical record and is never rewritten automatically. To correct
          it, void this invoice and reissue.
        </div>
      )}
      {!isDraft && !isTerminal && (
        <div className="mb-4 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
          This invoice has been issued — its financial values are locked. Record a payment or void it; line items can no longer be edited.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Receipt className="size-4 text-muted-foreground" /> Invoice Summary
            </h2>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</dt>
                <dd className="mt-0.5 text-foreground">{project ? <Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</dt>
                <dd className="mt-0.5 text-foreground">{client ? <Link href={`/clients/${client.id}`} className="text-primary hover:underline">{client.name}</Link> : "No client"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue Date</dt>
                <dd className="mt-0.5 text-foreground">{invoice.issueDate ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due Date</dt>
                <dd className="mt-0.5 text-foreground">{invoice.dueDate ?? "—"}</dd>
              </div>
              {invoice.estimateId && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source Estimate</dt>
                  <dd className="mt-0.5">
                    <Link href={`/estimates/${invoice.estimateId}`} className="text-primary hover:underline">View the estimate this was generated from</Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">Line items were snapshotted at creation — later estimate edits do not change this invoice.</p>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Line Items</h2>
            {invoice.lineItems.length === 0 ? (
              <EmptyState title="No line items" description={isDraft ? "Edit this invoice to add items." : "This invoice has no line items."} />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatMoney(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
              {/* <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMoney(invoice.subtotal)}</span></div> */}
              {invoice.tax !== 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatMoney(invoice.tax)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Invoice total</span><span>{formatMoney(invoice.total)}</span></div>
              {invoice.hasTotalDrift && (
                <p className="pt-1 text-xs text-muted-foreground">
                  This total is {formatMoney(invoice.total - invoice.lineItems.reduce((s, li) => s + li.total, 0))} more than the
                  line items above. On legacy invoices that difference is change-order work that was billed but never written
                  as its own line item — it is already included in the total, so it must not be added again.
                </p>
              )}
              {summary && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>−{formatMoney(summary.totalPaid)}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                    <span>Balance Due</span>
                    <span>{formatMoney(summary.remainingBalance)}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <InvoicePaymentsPanel
            invoiceId={invoice.id}
            companyId={invoice.companyId}
            invoiceTotal={invoice.total}
            totalPaid={summary?.totalPaid ?? 0}
            payments={payments}
            canEdit={canRecordPayment}
            onChanged={load}
          />

        </div>

        <div className="space-y-5">
          {estimate && (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-muted-foreground" /> Contract Summary
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                The whole agreement across the estimate and its change orders. These are the same figures the
                Estimate page shows, from the same shared calculation — this invoice is one bill against this contract,
                not the contract itself.
              </p>
              <div className="space-y-1 text-sm">
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
                <div className="mt-3 border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change Orders</h3>
                  <ul className="space-y-1.5">
                    {changeOrders.map((co) => {
                      const counted = co.status === "approved";
                      return (
                        <li key={co.id} className="flex items-center justify-between gap-2 text-xs">
                          <Link href={`/change-orders/${co.id}`} className="text-primary hover:underline">
                            {co.changeOrderNumber}
                          </Link>
                          <span className="flex items-center gap-2">
                            <span className={counted ? "font-medium text-foreground" : "text-muted-foreground line-through"}>
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
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="size-4 text-muted-foreground" /> Bill To
            </h2>
            {client ? (
              <div className="space-y-1 text-sm">
                <div className="font-medium text-foreground">{client.name}</div>
                {client.email && <div className="text-muted-foreground">{client.email}</div>}
                {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
                {client.address && <div className="text-muted-foreground">{client.address}</div>}
              </div>
            ) : (
              <EmptyState title="No client" description="This invoice's project has no client attached." />
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="size-4 text-muted-foreground" /> Customer Link
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              A public, no-login page where the customer can view this invoice, download the PDF, and see payment history.
            </p>
            {invoice.customerToken ? (
              <div className="space-y-2">
                <Link
                  href={`/invoice/${invoice.id}?token=${encodeURIComponent(invoice.customerToken)}`}
                  target="_blank"
                  className="block text-sm font-medium text-primary hover:underline"
                >
                  Open public invoice page →
                </Link>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy customer link"}
                </button>
                <p className="text-xs text-muted-foreground">
                  Anyone with this link can view the invoice without logging in. Treat it like a password.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No customer link yet — this invoice predates the sharing token. Void and reissue it to generate one.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4 text-muted-foreground" /> Activity Timeline
            </h2>
            {activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" description="Created/sent/viewed/cancelled/voided events will appear here." />
            ) : (
              <ol className="space-y-3 border-l-2 border-border pl-4">
                {activity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-0.5 size-3 rounded-full bg-primary" />
                    <div className="text-sm font-medium capitalize text-foreground">{entry.action.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
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
