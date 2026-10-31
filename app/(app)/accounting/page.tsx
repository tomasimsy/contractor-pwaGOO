"use client";

/**
 * Accounting 2.0 — replaces the placeholder that stood here.
 *
 * ============================================================
 * THIS PAGE COMPUTES NOTHING
 * ============================================================
 * There is no second accounting engine, no new table, and no restated
 * formula. Every figure is read from a service that already owned it:
 *
 *   Income / Expenses / Net Profit / A-R
 *                    FinancialEngine.getCompanyFinancials({ companyId,
 *                    dateRange }) — totalRevenue, totalExpenses,
 *                    netProfit, totalOutstanding. The same call the
 *                    Dashboard makes, with the same date range.
 *
 *   A-P              AccountsPayableService.getPayablesReport — itself a
 *                    re-shape of FinancialEngine.getPayablesSummary.
 *
 *   A-R aging        AccountsReceivableService.getAgingReport — buckets
 *                    existing invoice balances; adds no financial fact.
 *
 *   Transactions     PaymentService.listForCompany (money in) and
 *                    ExpenseService.listForCompany (money out). The
 *                    SOURCE records, both already soft-delete filtered
 *                    by their own service.
 *
 * Two of those services (AR and AP) already existed in the codebase but
 * had never been exposed through ServicesProvider. Wiring them up was
 * the whole "build" — the accounting logic was written long ago.
 *
 * WHY THE SOURCE ROWS AND NOT THE LEDGER. `financial_transactions`
 * exists and mirrors these events, but FinancialEngine deliberately
 * stopped reading it for cost: an append-only ledger cannot honour a
 * soft delete, so a deleted expense kept costing money forever (see
 * ExpenseService's header). Listing transactions from the ledger would
 * reintroduce exactly that — deleted rows reappearing in the register.
 * Reading the source rows keeps this page agreeing with every other
 * total in the app.
 *
 * The only arithmetic here is summing a filtered list for the register's
 * footer, which is display aggregation of rows already fetched.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, Wallet, FileWarning, HandCoins, ArrowRight,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { DateRangeFilter, resolveDateRangePreset, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { EXPENSE_TYPE_LABEL, type Expense } from "@/lib/services/expenseService";
import type { CompanyFinancials } from "@/lib/services/types";
import type { ARAgingReport } from "@/lib/services/accountsReceivableService";
import type { APReport } from "@/lib/services/accountsPayableService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { Client } from "@/lib/services/clientService";
import type { Project } from "@/lib/services/projectService";
import type { PayeeRow } from "@/lib/services/payeeOwed";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import { supabase } from "@/lib/supabase/client";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type TxFilter =
  | "all" | "income" | "expenses" | "customer_payments"
  | "subcontractors" | "vendors" | "agents" | "team_members" | "payroll";

const TX_FILTERS: { id: TxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "customer_payments", label: "Customer Payments" },
  { id: "subcontractors", label: "Subcontractors" },
  { id: "vendors", label: "Vendors" },
  { id: "agents", label: "Agents" },
  { id: "team_members", label: "Team Members" },
  { id: "payroll", label: "Payroll" },
];

/** A register line. Built from an existing payment or expense row — no
 * transaction record is created anywhere. */
type Tx = {
  id: string;
  date: string;
  description: string;
  type: string;
  in: number;
  out: number;
  href: string | null;
  kinds: TxFilter[];
  /** When the record was entered. Orders rows that share a date. */
  enteredAt: string;
  /** True when the money has actually moved. Payments always have;
   * an expense has only when `isPaid`. */
  settled: boolean;
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function AccountingContent() {
  const {
    financialEngine, accountsReceivableService, accountsPayableService,
    paymentService, expenseService, invoiceService, clientService, projectService,
    employeeService, timeEntryService, estimateService,
  } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [preset, setPreset] = useState<DateRangePreset>("this_year");
  const [financials, setFinancials] = useState<CompanyFinancials | null>(null);
  const [ar, setAr] = useState<ARAgingReport | null>(null);
  const [ap, setAp] = useState<APReport | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // Payroll: payments to employees and team members, with their reimbursements.
  const [payroll, setPayroll] = useState<PayeeRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [txSort, setTxSort] = useState<"newest" | "oldest">("newest");
  const [txPage, setTxPage] = useState(1);

  const dateRange = useMemo(() => resolveDateRangePreset(preset), [preset]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const scope = { companyId };
      const payService = createSupabasePayeePaymentService(
        supabase,
        { employeeService, timeEntryService, estimateService, projectService, expenseService },
        companyId
      );
      const [fin, arReport, apReport, pays, exps, invs, cls, projs, payrollRows] = await Promise.all([
        financialEngine.getCompanyFinancials({ companyId, dateRange }),
        accountsReceivableService.getAgingReport(scope),
        accountsPayableService.getPayablesReport(scope),
        paymentService.listForCompany(scope),
        expenseService.listForCompany(companyId),
        invoiceService.listForCompany(scope),
        clientService.list(scope),
        projectService.list(scope),
        payService.load(),
      ]);
      setPayroll(payrollRows);
      setFinancials(fin);
      setAr(arReport);
      setAp(apReport);
      setPayments(pays);
      setExpenses(exps);
      setInvoices(invs);
      setClients(cls);
      setProjects(projs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting data.");
    } finally {
      setLoading(false);
    }
  }, [companyId, dateRange, financialEngine, accountsReceivableService, accountsPayableService,
      paymentService, expenseService, invoiceService, clientService, projectService, employeeService, timeEntryService, estimateService]);

  useEffect(() => { load(); }, [load]);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  /** Source rows -> register lines. Each row keeps the filters it
   * belongs to, so one pass classifies rather than eight queries. */
  const transactions = useMemo<Tx[]>(() => {
    const from = dateRange.start.toISOString().slice(0, 10);
    const to = dateRange.end.toISOString().slice(0, 10);

    const inRows: Tx[] = payments
      .filter((p) => p.paymentDate >= from && p.paymentDate <= to)
      .map((p) => {
        const inv = invoiceById.get(p.invoiceId);
        return {
          id: `pay:${p.id}`,
          date: p.paymentDate,
          description: inv
            ? `${inv.invoiceNumber}${inv.clientId ? ` · ${clientName.get(inv.clientId) ?? ""}` : ""}`
            : "Customer payment",
          type: "Customer Payment",
          in: p.amount,
          out: 0,
          href: inv ? `/invoices/${inv.id}` : null,
          kinds: ["all", "income", "customer_payments"],
          enteredAt: p.createdAt,
          settled: true,
        };
      });

    const outRows: Tx[] = expenses
      .filter((e) => e.expenseDate >= from && e.expenseDate <= to)
      .map((e) => {
        const kinds: TxFilter[] = ["all", "expenses"];
        if (e.expenseType === "subcontractor") kinds.push("subcontractors");
        if (e.expenseType === "agent_commission") kinds.push("agents");
        if (e.payeeType === "vendor" || e.dueDate) kinds.push("vendors");
        if (e.paidByType === "employee") kinds.push("team_members");
        return {
          id: `exp:${e.id}`,
          date: e.expenseDate,
          description:
            e.vendor || e.description || e.notes || EXPENSE_TYPE_LABEL[e.expenseType],
          type: e.dueDate ? "Bill" : EXPENSE_TYPE_LABEL[e.expenseType],
          in: 0,
          out: e.amount,
          href: e.estimateId
            ? `/estimates/${e.estimateId}`
            : e.projectId
            ? `/projects/${e.projectId}`
            : null,
          kinds,
          enteredAt: e.createdAt,
          settled: e.isPaid,
        };
      });

    // Payroll: cash paid to people. Corrections are left out (they change what is owed, not
    // cash), and team payments are left out because each already appears above as a labor expense.
    // A full payment covering several jobs keeps its job parts in
    // `allocations`, each with the labor expense it created — those parts
    // are already listed above, so only what is left (a reimbursement,
    // unassigned money) is listed here.
    const notAlreadyAnExpense = (p: (typeof payroll)[number]["payments"][number]) => {
      if (p.payeeKind === "team" && p.paymentKind === "pay" && p.expenseId) return 0;
      const asExpense = (p.allocations ?? [])
        .filter((a) => a.kind === "job" && a.expenseIds.length > 0)
        .reduce((s, a) => s + a.amount, 0);
      return Math.round((p.amount - asExpense) * 100) / 100;
    };
    const payrollTx: Tx[] = payroll.flatMap((r) =>
      r.payments
        .filter((p) => p.paidOn >= from && p.paidOn <= to)
        // A reversed check moved no money.
        .filter((p) => !p.reversedAt && p.paymentKind !== "adjustment")
        .filter((p) => notAlreadyAnExpense(p) > 0.005)
        .map((p) => {
          const isReimbursement = p.paymentKind === "reimbursement";
          const job = p.estimateId ? r.lines.find((l) => l.estimateId === p.estimateId)?.label : null;
          return {
            id: `pr:${p.id}`,
            date: p.paidOn,
            description: `${r.name}${job ? ` · ${job}` : ""}${p.reference ? ` · #${p.reference}` : ""}`,
            type: isReimbursement ? "Reimbursement" : r.kind === "employee" ? "Employee Pay" : "Team Payment",
            in: 0,
            out: notAlreadyAnExpense(p),
            href: p.estimateId ? `/estimates/${p.estimateId}` : null,
            kinds: isReimbursement ? ["all", "payroll", "team_members"] : ["all", "payroll"],
            enteredAt: `${p.paidOn}T00:00:00`,
            settled: true,
          } as Tx;
        })
    );

    return [...inRows, ...outRows, ...payrollTx];
  }, [payments, expenses, payroll, invoiceById, clientName, dateRange]);

  // Date first, then when the record was entered, so records from the same day stay in order.
  const visibleTx = useMemo(() => {
    const direction = txSort === "newest" ? 1 : -1;
    return transactions
      .filter((t) => t.kinds.includes(txFilter))
      .sort((a, b) => direction * (b.date.localeCompare(a.date) || b.enteredAt.localeCompare(a.enteredAt)));
  }, [transactions, txFilter, txSort]);
  const TX_PAGE_SIZE = 50;
  const txPageCount = Math.max(1, Math.ceil(visibleTx.length / TX_PAGE_SIZE));
  // Clamped, so a shorter list never leaves the page past its last page.
  const currentTxPage = Math.min(txPage, txPageCount);
  const pageTx = visibleTx.slice((currentTxPage - 1) * TX_PAGE_SIZE, currentTxPage * TX_PAGE_SIZE);
  const txIn = useMemo(() => visibleTx.reduce((s, t) => s + t.in, 0), [visibleTx]);
  /** Split the way FinancialEngine splits it, so this register ties back
   * to the Expenses card above instead of quietly disagreeing with it.
   *
   * getCompanyFinancials.totalExpenses is cash basis: paid expenses in
   * the range plus employee wages paid. A bill recorded but not yet paid
   * is listed here as not yet settled and is not in the Expenses card.
   *
   * Team payments appear above as labor expenses, so only what is not
   * already an expense row (employee pay, reimbursements) is listed from
   * Payroll. A reimbursement pays back an expense already listed, so
   * "Paid out" can be higher than the Expenses card by that amount. */
  const txPaidOut = useMemo(
    () => visibleTx.reduce((s, t) => s + (t.settled ? t.out : 0), 0),
    [visibleTx]
  );
  const txUnpaidOut = useMemo(
    () => visibleTx.reduce((s, t) => s + (t.settled ? 0 : t.out), 0),
    [visibleTx]
  );

  /** AR lines joined to their invoice for customer/project/due display.
   * The BALANCE is the report's own — not recomputed. */
  const arRows = useMemo(() => {
    if (!ar) return [];
    return ar.lines
      .filter((l) => l.balance > 0)
      .map((l) => {
        const inv = invoiceById.get(l.invoiceId);
        return {
          ...l,
          customer: l.clientId ? clientName.get(l.clientId) ?? "—" : "—",
          project: inv?.projectId ? projectName.get(inv.projectId) ?? "—" : "—",
          dueDate: inv?.dueDate ?? "—",
          total: inv?.total ?? l.balance,
        };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);
  }, [ar, invoiceById, clientName, projectName]);

  /** APReport.lines are per ASSIGNMENT (a payee with three contracts
   * appears three times). The brief wants payee-level, so lines are
   * grouped — summing the engine's own per-assignment `outstanding`,
   * not recomputing it. The parts still sum to apReport.totalOutstanding. */
  const apRows = useMemo(() => {
    if (!ap) return [];
    const byPayee = new Map<string, { payeeName: string; role: string; assigned: number; outstanding: number; contracts: number }>();
    for (const l of ap.lines) {
      if (l.outstanding <= 0) continue;
      const key = `${l.role}:${l.payeeId}`;
      const row = byPayee.get(key) ?? { payeeName: l.payeeName, role: l.role, assigned: 0, outstanding: 0, contracts: 0 };
      row.assigned += l.assigned;
      row.outstanding += l.outstanding;
      row.contracts += 1;
      byPayee.set(key, row);
    }
    return [...byPayee.entries()]
      .map(([key, r]) => ({ key, ...r }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [ap]);

  const summary = [
    { label: "Income", value: financials?.totalRevenue ?? 0, icon: TrendingUp, tone: "text-success" },
    // Cash basis, from the engine: settled expenses only. The register
    // below shows unpaid activity separately for exactly this reason.
    { label: "Expenses", value: financials?.totalExpenses ?? 0, icon: TrendingDown, tone: "text-foreground" },
    { label: "A/R", value: financials?.totalOutstanding ?? 0, icon: FileWarning, tone: "text-warning" },
    { label: "A/P", value: ap?.totalOutstanding ?? 0, icon: HandCoins, tone: "text-warning" },
    {
      label: "Net Profit",
      value: financials?.netProfit ?? 0,
      icon: Wallet,
      tone: (financials?.netProfit ?? 0) >= 0 ? "text-success" : "text-danger",
    },
  ];

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <PageHeader
        title="Accounting"
        description="Income, expenses, receivables and payables."
        actions={<DateRangeFilter value={preset} onChange={(p) => { setPreset(p); setTxPage(1); }} />}
      />

      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => load()} className="font-medium underline">Retry</button>
        </div>
      )}

      {/* ---------- 1. FINANCIAL SUMMARY ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className="bg-card px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <s.icon className="size-3 shrink-0" /> {s.label}
            </div>
            <div className={`mt-0.5 text-base font-bold tabular-nums sm:text-lg ${s.tone}`}>
              {loading ? "—" : money(s.value)}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- 2. TRANSACTIONS ---------- */}
      <Section
        title="Transactions"
        action={
          <span className="text-[11px] tabular-nums text-muted-foreground">
            <span className="text-success">{money(txIn)} in</span> ·{" "}
            <span className="text-foreground">{money(txPaidOut)} paid</span>
            {txUnpaidOut > 0 && (
              <>
                {" "}· <span className="text-warning">{money(txUnpaidOut)} unpaid</span>
              </>
            )}
          </span>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {TX_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setTxFilter(f.id); setTxPage(1); }}
              aria-pressed={txFilter === f.id}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                txFilter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <select
            value={txSort}
            onChange={(e) => { setTxSort(e.target.value as "newest" | "oldest"); setTxPage(1); }}
            aria-label="Sort transactions"
            className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : visibleTx.length === 0 ? (
          <EmptyState icon={Wallet} title="No transactions" description="Nothing in this range for this filter." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {/* Desktop header — hidden on mobile, where each row stacks. */}
            <div className="hidden bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[92px_1fr_140px_100px_100px] sm:gap-2">
              <span>Date</span><span>Description</span><span>Type</span>
              <span className="text-right">Money In</span><span className="text-right">Money Out</span>
            </div>
            <div className="divide-y divide-border/60">
              {pageTx.map((t) => {
                const body = (
                  <>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{t.date}</span>
                    <span className="min-w-0 truncate text-xs font-medium text-foreground">{t.description}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t.type}
                      {!t.settled && <span className="ml-1 text-warning">· unpaid</span>}
                    </span>
                    {/* On mobile the five cells wrap, so an empty money
                        column would leave a stray gap — hide the side
                        that has no value there, keep both columns on
                        desktop so the table stays aligned. */}
                    <span className={`text-right text-xs font-semibold tabular-nums text-success ${t.in ? "" : "hidden sm:block"}`}>
                      {t.in ? money(t.in) : ""}
                    </span>
                    <span className={`text-right text-xs font-semibold tabular-nums text-foreground ${t.out ? "" : "hidden sm:block"}`}>
                      {t.out ? money(t.out) : ""}
                    </span>
                  </>
                );
                const cls =
                  "grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-0.5 px-3 py-2 sm:grid-cols-[92px_1fr_140px_100px_100px] sm:items-center";
                return t.href ? (
                  <Link key={t.id} href={t.href} className={`${cls} hover:bg-muted/40`}>{body}</Link>
                ) : (
                  <div key={t.id} className={cls}>{body}</div>
                );
              })}
            </div>
            {visibleTx.length > TX_PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                <span>
                  {(currentTxPage - 1) * TX_PAGE_SIZE + 1}–{Math.min(currentTxPage * TX_PAGE_SIZE, visibleTx.length)} of {visibleTx.length}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTxPage(currentTxPage - 1)}
                    disabled={currentTxPage <= 1}
                    className="rounded-md border border-border bg-card px-2 py-1 font-medium text-foreground disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxPage(currentTxPage + 1)}
                    disabled={currentTxPage >= txPageCount}
                    className="rounded-md border border-border bg-card px-2 py-1 font-medium text-foreground disabled:opacity-40"
                  >
                    Next
                  </button>
                </span>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ---------- 3. ACCOUNTS RECEIVABLE ---------- */}
      <Section
        title="Accounts Receivable"
        action={
          <span className="text-[11px] font-semibold tabular-nums text-warning">
            {money(ar?.totalReceivable ?? 0)}
          </span>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : arRows.length === 0 ? (
          <EmptyState icon={FileWarning} title="Nothing receivable" description="Every invoice is paid." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_110px_92px_100px_100px] sm:gap-2">
              <span>Customer</span><span>Project</span><span>Invoice</span><span>Due</span>
              <span className="text-right">Amount</span><span className="text-right">Remaining</span>
            </div>
            <div className="divide-y divide-border/60">
              {arRows.map((r) => (
                <Link key={r.invoiceId} href={`/invoices/${r.invoiceId}`}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-0.5 px-3 py-2 hover:bg-muted/40 sm:grid-cols-[1fr_1fr_110px_92px_100px_100px] sm:items-center">
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">{r.customer}</span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">{r.project}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{r.invoiceNumber}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{r.dueDate}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{money(r.total)}</span>
                  <span className={`text-right text-xs font-semibold tabular-nums ${r.daysPastDue > 0 ? "text-danger" : "text-foreground"}`}>
                    {money(r.balance)}
                    <span className="ml-1 hidden text-[10px] font-normal text-muted-foreground sm:inline">
                      {r.bucket === "current" ? "current" : `${r.bucket}d`}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ---------- 4. ACCOUNTS PAYABLE ---------- */}
      <Section
        title="Accounts Payable"
        action={
          <Link href="/payroll" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            Pay in Payroll <ArrowRight className="size-3" />
          </Link>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : apRows.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nothing payable" description="Subcontractors and agents are settled up." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[1fr_130px_110px_110px_90px] sm:gap-2">
              <span>Payee</span><span>Type</span><span className="text-right">Assigned</span>
              <span className="text-right">Outstanding</span><span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-border/60">
              {apRows.map((r) => (
                <div key={r.key}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-0.5 px-3 py-2 sm:grid-cols-[1fr_130px_110px_110px_90px] sm:items-center">
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">
                    {r.payeeName}
                    {r.contracts > 1 && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        {r.contracts} contracts
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[11px] capitalize text-muted-foreground">{r.role}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{money(r.assigned)}</span>
                  <span className="text-right text-xs font-semibold tabular-nums text-warning">{money(r.outstanding)}</span>
                  <span className="text-right text-[11px] text-muted-foreground">
                    {r.outstanding >= r.assigned ? "Unpaid" : "Partial"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <p className="-mt-2 mb-4 text-[11px] text-muted-foreground">
        A/P is <span className="font-medium text-foreground">lifetime</span> and covers
        subcontractors and agents only, so it ignores the date filter above. Team pay and
        reimbursements are in <Link href="/payroll" className="text-primary hover:underline">Payroll</Link>,
        and supplier invoices in <Link href="/bills" className="text-primary hover:underline">Vendor bills</Link>.
      </p>

      {/* ---------- 5. RECONCILIATION ----------
          A bank statement source now exists: upload a CSV export
          (no bank connection required) at /accounting/reconciliation.
          There is still no cleared/uncleared flag persisted anywhere —
          each run is a fresh comparison against the current register,
          not a saved reconciliation state. */}
      <p className="mt-6 text-[11px] text-muted-foreground">
        <Link href="/accounting/reconciliation" className="font-medium text-primary hover:underline">
          Reconcile a bank statement
        </Link>{" "}
        — upload a CSV export and match it against the payments and expenses below. See also{" "}
        <Link href="/reports" className="text-primary hover:underline">Reports</Link> and{" "}
        <Link href="/tax-center" className="text-primary hover:underline">Tax Center</Link> for
        statements and tax summaries.
      </p>
    </PageContainer>
  );
}

export default function AccountingPage() {
  return (
    <RequirePermission resource="financial_reports" action="view">
      <AccountingContent />
    </RequirePermission>
  );
}
