"use client";

import { isRevenueInvoice } from "@/lib/services/financialEngine";
import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { LaborByPerson } from "@/components/shared/EstimateProfitSummaryCard";
import { laborBreakdownByEmployee, type LaborLine } from "@/lib/services/laborBreakdown";
import { INVOICE_STATUS_TONE, isUnpaidInvoiceStatus } from "@/components/invoices/invoiceStatus";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { SubcontractorAssignment } from "@/lib/services/subcontractorService";
import type { AgentAssignment } from "@/lib/services/agentCommissionService";
import { calculateChangeOrderRevenue } from "@/lib/services/financialCalculations";
import { EXPENSE_TYPE_LABEL, type Expense } from "@/lib/services";
import type { AuditLogEntry, ProjectStatus, EstimateStatus, ChangeOrderStatus, ProjectFinancials } from "@/lib/services";

type Tone = "neutral" | "success" | "warning" | "danger";
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  draft: "neutral",
  active: "success",
  in_progress: "success",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
  archived: "neutral",
};

const ESTIMATE_STATUS_TONE: Record<EstimateStatus, Tone> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const CHANGE_ORDER_STATUS_TONE: Record<ChangeOrderStatus, Tone> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  invoiced: "success",
};

type Balance = { assigned: number; paid: number; committed: number; outstanding: number };
type SubRow = SubcontractorAssignment & { subcontractorName: string; trade: string | null };
type AgentRow = AgentAssignment & { agentName: string };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const cents = (n: number) => Math.round(n * 100) / 100;
const label = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const estimateHref = (e: Estimate) => `${e.estimateType === "roofing" ? "/estimates-roof" : "/estimates"}/${e.id}`;

/** Everything on the project that belongs to one estimate (or to none: the project-level group). */
interface Job {
  key: string;
  estimate: Estimate | null;
  invoices: Invoice[];
  payments: Array<CustomerPayment & { invoiceNumber: string }>;
  changeOrders: ChangeOrder[];
  expenses: Expense[];
  subs: SubRow[];
  agents: AgentRow[];
  /** Invoiced total, or the estimate total once approved. Null when nothing is signed yet. */
  contract: number | null;
  paid: number;
  balance: number;
  expenseTotal: number;
}

const GRID = "sm:grid sm:grid-cols-[20px_minmax(0,1.8fr)_minmax(0,0.9fr)_96px_96px_96px_96px] sm:items-center sm:gap-3";

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const {
    projectService, clientService, estimateService, changeOrderService, auditService, financialEngine, subcontractorService,
    agentCommissionService, invoiceService, paymentService, timeEntryService, employeeService, expenseService,
  } = useServices();

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientProjectCount, setClientProjectCount] = useState<number | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);
  const [subAssignments, setSubAssignments] = useState<SubRow[]>([]);
  const [subBalances, setSubBalances] = useState<Record<string, Balance>>({});
  const [agentAssignments, setAgentAssignments] = useState<AgentRow[]>([]);
  const [agentBalances, setAgentBalances] = useState<Record<string, Balance>>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, CustomerPayment[]>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  /** Re-reads the profit picture from FinancialEngine, plus who the labor cost is for. */
  const loadFinancials = useCallback(async () => {
    try {
      setFinancials(await financialEngine.getProjectFinancials(projectId));
    } catch {
      // A missing financial figure must not blank out the project page.
      setFinancials(null);
    }
    const companyId = project?.companyId;
    if (!companyId) return;
    try {
      const [estimateList, entries, people, jobPays] = await Promise.all([
        estimateService.listForProject(projectId),
        timeEntryService.listForCompany({ companyId }),
        employeeService.list({ companyId, includeDeleted: true }),
        employeeService.listJobPays(companyId),
      ]);
      const estimateIds = new Set(estimateList.map((e) => e.id));
      setLaborLines(
        laborBreakdownByEmployee({
          entries,
          nameById: new Map(people.map((p) => [p.id, p.name])),
          estimateIds,
          jobPays,
          completedEstimateIds: project?.status === "completed" ? estimateIds : new Set(),
        })
      );
    } catch {
      setLaborLines([]);
    }
  }, [financialEngine, estimateService, timeEntryService, employeeService, projectId, project?.companyId, project?.status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFinancials();
  }, [loadFinancials]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await projectService.getById(projectId);
      setProject(p);
      if (!p) return;

      // Everything below depends only on the project, so it loads in parallel.
      const scope = { companyId: p.companyId, projectId: p.id };
      const [c, companyProjects, history, estimateList, coList, subs, agents, projectInvoices, expenseList] = await Promise.all([
        p.clientId ? clientService.getById(p.clientId) : Promise.resolve(null),
        p.clientId ? projectService.list({ companyId: p.companyId }) : Promise.resolve([]),
        auditService.getHistory(p.companyId, "projects", p.id),
        estimateService.listForProject(p.id),
        changeOrderService.listForProject(p.id),
        subcontractorService.listAssignments(scope),
        agentCommissionService.listAssignments(scope),
        invoiceService.listForProject(p.id),
        expenseService.listForProject(p.id),
      ]);
      setClient(c);
      setClientProjectCount(c ? companyProjects.filter((row) => row.clientId === c.id).length : null);
      setActivity(history);
      setEstimates(estimateList);
      setChangeOrders(coList);
      setSubAssignments(subs);
      setAgentAssignments(agents);
      setInvoices(projectInvoices);
      setExpenses(expenseList);

      // Assigned, paid and owed per assignment: the engine's payables, the same
      // expense-based figures Payroll and the estimate show.
      const [payables, payments] = await Promise.all([
        financialEngine.getPayablesSummary(scope),
        paymentService.listForInvoices(projectInvoices.map((inv) => inv.id)),
      ]);
      const balanceOf = (assignmentId: string): Balance | undefined => {
        const line = payables.lines.find((l) => l.assignmentId === assignmentId);
        return line ? { assigned: line.assigned, paid: line.paid, committed: Math.max(line.assigned, line.paid), outstanding: line.outstanding } : undefined;
      };
      setSubBalances(Object.fromEntries(subs.flatMap((a) => (balanceOf(a.id) ? [[a.id, balanceOf(a.id)!]] : []))));
      setAgentBalances(Object.fromEntries(agents.flatMap((a) => (balanceOf(a.id) ? [[a.id, balanceOf(a.id)!]] : []))));
      setPaymentsByInvoice(payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [projectService, clientService, estimateService, changeOrderService, auditService, subcontractorService, agentCommissionService, invoiceService, paymentService, expenseService, financialEngine, projectId]);

  useEffect(() => {
    // Fetch-on-mount is this effect's entire purpose — synchronizing
    // with the service layer, exactly what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // One row per estimate, newest number first, then a project-level row for anything not tied to one.
  const jobs = useMemo<Job[]>(() => {
    const build = (estimate: Estimate | null): Job => {
      const id = estimate?.id ?? null;
      const jobInvoices = invoices.filter((inv) => inv.estimateId === id);
      const payments = jobInvoices.flatMap((inv) => (paymentsByInvoice[inv.id] ?? []).map((pay) => ({ ...pay, invoiceNumber: inv.invoiceNumber })));
      const paid = cents(payments.reduce((s, pay) => s + pay.amount, 0));
      // Void and cancelled invoices are listed but bill nothing (isRevenueInvoice).
      const billing = jobInvoices.filter(isRevenueInvoice);
      const invoiced = cents(billing.reduce((s, inv) => s + inv.total, 0));
      const contract = billing.length > 0 ? invoiced : estimate && estimate.status === "approved" ? estimate.total : null;
      const jobExpenses = expenses.filter((x) => x.estimateId === id);
      return {
        key: id ?? "_project",
        estimate,
        invoices: jobInvoices,
        payments: payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
        changeOrders: id ? changeOrders.filter((co) => co.estimateId === id) : [],
        expenses: jobExpenses,
        subs: subAssignments.filter((a) => a.estimateId === id),
        agents: agentAssignments.filter((a) => a.estimateId === id),
        contract,
        paid,
        balance: contract === null ? 0 : cents(Math.max(0, contract - paid)),
        expenseTotal: cents(jobExpenses.reduce((s, x) => s + x.amount, 0)),
      };
    };
    const list = [...estimates]
      .sort((a, b) => (b.estimateNumber ?? "").localeCompare(a.estimateNumber ?? ""))
      .map((e) => build(e));
    const projectLevel = build(null);
    const hasProjectLevel =
      projectLevel.invoices.length + projectLevel.expenses.length + projectLevel.subs.length + projectLevel.agents.length > 0;
    return hasProjectLevel ? [...list, projectLevel] : list;
  }, [estimates, invoices, paymentsByInvoice, changeOrders, expenses, subAssignments, agentAssignments]);

  const totals = useMemo(
    () => ({
      contract: cents(jobs.reduce((s, j) => s + (j.contract ?? 0), 0)),
      paid: cents(jobs.reduce((s, j) => s + j.paid, 0)),
      balance: cents(jobs.reduce((s, j) => s + j.balance, 0)),
      expenses: cents(jobs.reduce((s, j) => s + j.expenseTotal, 0)),
    }),
    [jobs]
  );

  // Soft-delete — a real delete (hidden from every list, recoverable
  // only via /projects/trash's Restore), NOT the same thing as the
  // "archived" status below.
  const { ask, dialog } = useConfirmDialog();

  async function handleDelete() {
    if (!project) return;
    setMenuOpen(false);
    const reason = await ask({
      title: `Delete "${project.name}"?`,
      message: "This can be undone from Projects → Deleted.",
      confirmLabel: "Delete",
      destructive: true,
      reasonLabel: "Why are you deleting this project?",
    });
    if (!reason) return;
    try {
      await projectService.softDelete(project.id, reason);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    }
  }

  // Real "archived" status: only allowed from completed or cancelled
  // (ValidationService.PROJECT_TRANSITIONS), matching when the menu offers it.
  async function handleArchive() {
    if (!project) return;
    setMenuOpen(false);
    setError(null);
    try {
      await projectService.changeStatus(project.id, "archived");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project.");
    }
  }

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error && !project) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!project) return <PageContainer><EmptyState title="Project not found" description="It may have been archived or the link is incorrect." /></PageContainer>;

  const f = financials;
  const openInvoices = invoices.filter((inv) => isUnpaidInvoiceStatus(inv.status)).length;
  const paymentCount = Object.values(paymentsByInvoice).reduce((s, list) => s + list.length, 0);
  const approvedCoTotal = cents(changeOrders.filter((co) => co.status === "approved" || co.status === "invoiced").reduce((s, co) => s + calculateChangeOrderRevenue(co.totalAmount, co.tax), 0));
  const activityShown = showAllActivity ? activity : activity.slice(0, 4);

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4 text-[13px]">
        {/* Header */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name}</h1>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE_CHIP[STATUS_TONE[project.status]]}`}>{label(project.status)}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {client ? (
                  <Link href={`/clients/${client.id}`} className="text-primary hover:underline">{client.name}</Link>
                ) : (
                  "No client"
                )}
                {project.address && <> · {project.address}</>}
                {" · "}
                {estimates.length} {estimates.length === 1 ? "estimate" : "estimates"}
                {project.projectNumber && <> · #{project.projectNumber}</>}
              </div>
            </div>
            <div className="relative flex items-center gap-1.5">
              <Link href={`/projects/${project.id}/edit`} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] font-medium text-foreground hover:bg-muted">
                Edit
              </Link>
              <button
                type="button"
                aria-label="More actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-56 rounded-md border border-border bg-card py-1 text-[12px] shadow-md">
                  {(project.status === "completed" || project.status === "cancelled") && (
                    <button type="button" onClick={handleArchive} className="block w-full px-3 py-1.5 text-left text-foreground hover:bg-muted">
                      Archive project
                    </button>
                  )}
                  <button type="button" onClick={handleDelete} className="block w-full px-3 py-1.5 text-left text-danger hover:bg-danger/10">
                    Delete project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}

        {/* Money strip: the same FinancialEngine figures the dashboard and reports use. */}
        <div className="grid grid-cols-2 rounded-lg border border-border bg-card sm:grid-cols-5">
          <Stat title="Contract" value={f ? money(f.revisedTotal) : "—"} note={approvedCoTotal > 0 ? `incl. ${money(approvedCoTotal)} change orders` : "no change orders"} className="border-b border-r sm:border-b-0" />
          <Stat title="Collected" value={f ? money(f.amountPaid) : "—"} tone="text-success" note={`${paymentCount} ${paymentCount === 1 ? "payment" : "payments"}`} className="border-b sm:border-b-0 sm:border-r" />
          <Stat
            title="Balance due"
            value={f ? money(f.remainingBalance) : "—"}
            tone={f && f.remainingBalance > 0 ? "text-warning" : undefined}
            note={`${openInvoices} open ${openInvoices === 1 ? "invoice" : "invoices"}`}
            className="border-b border-r sm:border-b-0"
          />
          <Stat title="Costs" value={f ? money(f.totalExpenses) : "—"} note={f && f.outstandingTotal > 0 ? `${money(f.outstandingTotal)} still owed` : "nothing owed"} className="border-b sm:border-b-0 sm:border-r" />
          <Stat
            title="Est. profit"
            value={f ? money(f.netProfit) : "—"}
            tone={f ? (f.netProfit >= 0 ? "text-foreground" : "text-danger") : undefined}
            note={f ? `${f.profitMargin.toFixed(1)}% margin` : ""}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Jobs */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-foreground">Jobs on this project</h2>
            <div className="flex gap-4 text-[12px]">
              <Link href={`/estimates/new?projectId=${project.id}`} className="text-primary hover:underline">+ New estimate</Link>
              <Link href={`/change-orders/new?projectId=${project.id}`} className="text-primary hover:underline">+ New change order</Link>
              <Link href="/expense-v2" className="text-primary hover:underline">+ Record expense</Link>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-muted-foreground">
              No estimates yet. <Link href={`/estimates/new?projectId=${project.id}`} className="text-primary hover:underline">Create the first one</Link>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className={`hidden bg-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary ${GRID}`}>
                <span />
                <span>Estimate</span>
                <span>Invoice</span>
                <span className="text-right">Contract</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Expenses</span>
              </div>
              {jobs.map((job) => {
                const isOpen = openJob === job.key;
                const e = job.estimate;
                const inv = job.invoices[0];
                return (
                  <Fragment key={job.key}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setOpenJob(isOpen ? null : job.key)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setOpenJob(isOpen ? null : job.key);
                        }
                      }}
                      className={`flex cursor-pointer gap-2 border-t border-border px-3 py-2.5 first:border-t-0 hover:bg-muted/40 sm:first:border-t ${GRID} ${!e ? "bg-muted/30" : ""}`}
                    >
                      <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform sm:mt-0 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        {e ? (
                          <div className="flex flex-wrap items-center gap-x-1.5">
                            <Link href={estimateHref(e)} onClick={(ev) => ev.stopPropagation()} className="font-medium text-primary hover:underline">
                              {e.estimateNumber ?? "Estimate"}
                            </Link>
                            <span className="truncate text-foreground">{e.title || "Untitled"}</span>
                            {e.estimateType === "roofing" && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">Roofing</span>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Project-level · not tied to an estimate</span>
                        )}
                        {/* Phones: the money on a second line. */}
                        <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                          {inv ? `${inv.invoiceNumber} · ${label(inv.status)}` : e ? `Estimate ${label(e.status).toLowerCase()}` : ""}
                          {job.contract !== null && ` · ${money(job.contract)} · paid ${money(job.paid)}`}
                        </div>
                      </div>
                      <div className="hidden min-w-0 sm:block">
                        {inv ? (
                          <>
                            <Link href={`/invoices/${inv.id}`} onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline">
                              {inv.invoiceNumber}
                            </Link>
                            {job.invoices.length > 1 && <span className="text-muted-foreground"> +{job.invoices.length - 1}</span>}
                            <div className={`text-[11px] ${TONE_TEXT[INVOICE_STATUS_TONE[inv.status]]}`}>{label(inv.status)}</div>
                          </>
                        ) : e ? (
                          <span className={`text-[11px] ${TONE_TEXT[ESTIMATE_STATUS_TONE[e.status]]}`}>Estimate {label(e.status).toLowerCase()}</span>
                        ) : null}
                      </div>
                      <span
                        className={`hidden text-right tabular-nums sm:block ${job.contract === null ? "text-muted-foreground" : "text-foreground"}`}
                        title={job.contract === null && e ? "Not signed yet, so not counted in the contract" : undefined}
                      >
                        {job.contract !== null ? money(job.contract) : e && e.total > 0 ? `(${money(e.total)})` : "—"}
                      </span>
                      <span className={`hidden text-right tabular-nums sm:block ${job.paid > 0 ? "text-success" : "text-muted-foreground"}`}>{job.paid > 0 ? money(job.paid) : "—"}</span>
                      <span className={`shrink-0 text-right tabular-nums ${job.balance > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>
                        {job.balance > 0 ? money(job.balance) : job.contract ? "Paid" : "—"}
                      </span>
                      <span className="hidden text-right tabular-nums text-foreground sm:block">{job.expenseTotal > 0 ? money(job.expenseTotal) : <span className="text-muted-foreground">—</span>}</span>
                    </div>
                    {isOpen && <JobDetail job={job} subBalances={subBalances} agentBalances={agentBalances} />}
                  </Fragment>
                );
              })}
              <div className={`hidden border-t border-border bg-muted/30 px-3 py-2 font-semibold text-foreground ${GRID}`}>
                <span />
                <span>Total</span>
                <span />
                <span className="text-right tabular-nums">{money(totals.contract)}</span>
                <span className="text-right tabular-nums text-success">{money(totals.paid)}</span>
                <span className={`text-right tabular-nums ${totals.balance > 0 ? "text-warning" : ""}`}>{money(totals.balance)}</span>
                <span className="text-right tabular-nums">{money(totals.expenses)}</span>
              </div>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Amounts in brackets are unsigned estimates and aren&apos;t counted. Expenses are the costs recorded on each job; the Costs figure above also includes labor and mileage.
          </p>
        </div>

        {/* Client, details, profit, activity */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client</h3>
            {client ? (
              <div className="leading-relaxed">
                <Link href={`/clients/${client.id}`} className="font-medium text-primary hover:underline">{client.name}</Link>
                {client.email && <div className="text-muted-foreground">{client.email}</div>}
                {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
                {client.address && <div className="text-muted-foreground">{client.address}</div>}
                <Link href={`/projects?clientId=${client.id}`} className="mt-1 inline-block text-[12px] text-primary hover:underline">
                  {clientProjectCount ?? 1} {(clientProjectCount ?? 1) === 1 ? "project" : "projects"} with this client →
                </Link>
              </div>
            ) : (
              <div className="text-muted-foreground">No client. <Link href={`/projects/${project.id}/edit`} className="text-primary hover:underline">Add one</Link></div>
            )}
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project details</h3>
            <dl className="divide-y divide-border">
              <DetailRow name="Address" value={project.address ?? "—"} />
              <DetailRow name="Project #" value={project.projectNumber ?? "—"} />
              <DetailRow name="Start" value={project.startDate ? shortDate(project.startDate) : "—"} />
              <DetailRow name="End" value={project.endDate ? shortDate(project.endDate) : "—"} />
            </dl>
            {project.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{project.description}</p>}
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profit</h3>
            {f ? (
              <dl className="divide-y divide-border">
                <DetailRow name="Revenue (revised contract)" value={money(f.revisedTotal)} />
                <DetailRow name="Labor (approved time)" value={money(f.laborCost)} />
                {laborLines.length > 0 && <div className="py-1"><LaborByPerson lines={laborLines} /></div>}
                <DetailRow name="Total costs" value={money(f.totalExpenses)} />
                {f.outstandingTotal > 0 && <DetailRow name="Still owed to subs and agents" value={money(f.outstandingTotal)} tone="text-warning" />}
                <DetailRow name="Estimated profit" value={money(f.netProfit)} tone={f.netProfit >= 0 ? "text-success" : "text-danger"} strong />
                <DetailRow name="Actual profit (cash in − costs)" value={money(f.amountPaid - f.totalExpenses)} tone={f.amountPaid - f.totalExpenses >= 0 ? "text-success" : "text-danger"} strong />
              </dl>
            ) : (
              <div className="text-muted-foreground">Not available.</div>
            )}
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
            {activity.length === 0 ? (
              <div className="text-muted-foreground">Nothing recorded yet.</div>
            ) : (
              <ul className="space-y-1">
                {activityShown.map((entry) => (
                  <li key={entry.id} className="flex justify-between gap-3">
                    <span className="text-foreground">{label(entry.action)}</span>
                    <span className="text-muted-foreground">{new Date(entry.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </li>
                ))}
                {activity.length > 4 && (
                  <li>
                    <button type="button" onClick={() => setShowAllActivity((s) => !s)} className="text-[12px] text-primary hover:underline">
                      {showAllActivity ? "Show less" : `Show all ${activity.length}`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
      {dialog}
    </PageContainer>
  );
}

/** The expanded part of a job row: change orders and payments on the left, costs on the right. */
function JobDetail({ job, subBalances, agentBalances }: { job: Job; subBalances: Record<string, Balance>; agentBalances: Record<string, Balance> }) {
  const e = job.estimate;
  const empty = job.changeOrders.length + job.payments.length + job.expenses.length + job.subs.length + job.agents.length === 0;
  return (
    <div className="border-t border-border bg-muted/40 px-3 py-3 text-[12px] sm:pl-11">
      {empty ? (
        <div className="text-muted-foreground">No change orders, payments or costs on this job yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          <div className="space-y-4">
            {job.changeOrders.length > 0 && (
              <ListBlock title={`Change orders · ${money(job.changeOrders.reduce((s, co) => s + calculateChangeOrderRevenue(co.totalAmount, co.tax), 0))}`}>
                {job.changeOrders.map((co) => (
                  <Line
                    key={co.id}
                    left={
                      <>
                        <Link href={`/change-orders/${co.id}`} className="text-primary hover:underline">{co.changeOrderNumber}</Link> {co.title}{" "}
                        <span className={TONE_TEXT[CHANGE_ORDER_STATUS_TONE[co.status]]}>· {label(co.status)}</span>
                      </>
                    }
                    right={money(calculateChangeOrderRevenue(co.totalAmount, co.tax))}
                  />
                ))}
              </ListBlock>
            )}
            {job.payments.length > 0 && (
              <ListBlock title={`Payments received · ${money(job.paid)}`}>
                {job.payments.map((pay) => (
                  <Line key={pay.id} left={`${shortDate(pay.paymentDate)} · ${pay.invoiceNumber} · ${label(pay.method)}${pay.referenceNumber ? ` #${pay.referenceNumber}` : ""}`} right={money(pay.amount)} tone="text-success" />
                ))}
              </ListBlock>
            )}
            {job.changeOrders.length === 0 && job.payments.length === 0 && <div className="text-muted-foreground">No change orders or payments.</div>}
          </div>
          <div className="space-y-4">
            {job.expenses.length > 0 && (
              <ListBlock title={`Expenses · ${money(job.expenseTotal)}`}>
                {job.expenses.map((x) => (
                  <Line
                    key={x.id}
                    left={
                      <>
                        <span className="text-muted-foreground">{shortDate(x.expenseDate)} · </span>
                        {EXPENSE_TYPE_LABEL[x.expenseType]}
                        {x.description && <span className="text-muted-foreground"> · {x.description}</span>}
                        {x.vendor && <span className="text-muted-foreground"> · {x.vendor}</span>}
                      </>
                    }
                    right={money(x.amount)}
                  />
                ))}
              </ListBlock>
            )}
            {(job.subs.length > 0 || job.agents.length > 0) && (
              <ListBlock title="Subcontractors and agents">
                {job.subs.map((a) => {
                  const b = subBalances[a.id];
                  return (
                    <Line
                      key={a.id}
                      left={
                        <>
                          {a.subcontractorName}
                          {a.trade && <span className="text-muted-foreground"> · {a.trade}</span>}
                          {b && <span className={b.outstanding > 0 ? "text-warning" : "text-success"}> · {b.outstanding > 0 ? `owed ${money(b.outstanding)}` : "paid"}</span>}
                          {b && b.outstanding > 0 && <PayLink payeeKey={`sub:${a.subcontractorId}`} />}
                        </>
                      }
                      right={b ? money(b.assigned) : "—"}
                    />
                  );
                })}
                {job.agents.map((a) => {
                  const b = agentBalances[a.id];
                  return (
                    <Line
                      key={a.id}
                      left={
                        <>
                          {a.agentName} <span className="text-muted-foreground">· agent</span>
                          {b && <span className={b.outstanding > 0 ? "text-warning" : "text-success"}> · {b.outstanding > 0 ? `owed ${money(b.outstanding)}` : "paid"}</span>}
                          {b && b.outstanding > 0 && <PayLink payeeKey={`agent:${a.agentId}`} />}
                        </>
                      }
                      right={b ? money(b.assigned) : "—"}
                    />
                  );
                })}
              </ListBlock>
            )}
            {job.expenses.length === 0 && job.subs.length === 0 && job.agents.length === 0 && <div className="text-muted-foreground">No costs recorded.</div>}
          </div>
        </div>
      )}
      {e && (
        <div className="mt-3 flex gap-4">
          <Link href={estimateHref(e)} className="text-primary hover:underline">Open estimate →</Link>
          {job.invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`} className="text-primary hover:underline">Open {inv.invoiceNumber} →</Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Subcontractors and agents are paid on Payroll; this opens their row there. */
function PayLink({ payeeKey }: { payeeKey: string }) {
  return (
    <Link href={`/payroll?person=${encodeURIComponent(payeeKey)}`} className="ml-2 text-primary hover:underline">
      Pay →
    </Link>
  );
}

function ListBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </div>
  );
}

function Line({ left, right, tone }: { left: React.ReactNode; right: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="min-w-0 text-foreground">{left}</span>
      <span className={`shrink-0 tabular-nums ${tone ?? "text-foreground"}`}>{right}</span>
    </div>
  );
}

function Stat({ title, value, note, tone, className }: { title: string; value: string; note: string; tone?: string; className?: string }) {
  return (
    <div className={`border-border px-4 py-2.5 ${className ?? ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function DetailRow({ name, value, tone, strong }: { name: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{name}</dt>
      <dd className={`text-right tabular-nums ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <RequirePermission resource="project" action="view">
      <ProjectDetailContent />
    </RequirePermission>
  );
}
