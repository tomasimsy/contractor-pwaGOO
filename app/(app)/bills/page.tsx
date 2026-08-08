"use client";

/**
 * Bills — vendor invoices the business has received.
 *
 * ============================================================
 * A BILL IS AN EXPENSE THAT HAS A DUE DATE
 * ============================================================
 * There is no bills table and no "bill" expense type. A bill is an
 * ordinary `estimate_expenses` row whose `due_date` is set, which is why
 * this page introduces no way to double-count: the cost was, and remains,
 * exactly one expense row.
 *
 * Consequences that fall out of that choice, rather than being built:
 *   - Unpaid       is the existing `is_paid = false`
 *   - Outstanding  is calculateExpenseTotals(bills).unpaid — the same
 *                  function ExpenseService.getTotalsForProject uses
 *   - Paying       is the existing expense update path
 *   - Job costing  already includes bills, because they were always
 *                  expenses; nothing was added to any total
 *
 * The only thing computed here is which bucket a due date falls into
 * (overdue / due soon / upcoming). That is date bucketing for display,
 * not a financial calculation — no money is derived from it.
 *
 * Recurring bills are TEMPLATES in `bill_schedules`. They hold no cost;
 * `generateDue` materialises each due occurrence as one ordinary expense
 * via ExpenseService, then advances the schedule. Generation runs on
 * page load because this app has no scheduler, and it is idempotent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Plus, X, AlertTriangle, CalendarClock, Calendar, Repeat, Check } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { createVendorDirectory } from "@/components/expenses/directories";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  type Expense,
  type ExpenseType,
} from "@/lib/services/expenseService";
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABEL,
  type BillFrequency,
  type BillSchedule,
} from "@/lib/services/billScheduleService";
import type { Project } from "@/lib/services/projectService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);

/** Days from today within which an unpaid bill counts as "due soon". */
const DUE_SOON_DAYS = 7;

type Filter = "unpaid" | "paid" | "recurring" | "all";

const FIELD =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-semibold text-foreground";

function BillsContent() {
  const { expenseService, billScheduleService, projectService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [bills, setBills] = useState<Expense[]>([]);
  const [schedules, setSchedules] = useState<BillSchedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [busyId, setBusyId] = useState<string | null>(null);

  // ---- Add Bill form ----
  const [adding, setAdding] = useState(false);
  const [vendor, setVendor] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [expenseType, setExpenseType] = useState<ExpenseType>("miscellaneous");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState<"none" | BillFrequency>("none");
  const [endMode, setEndMode] = useState<"never" | "on" | "after">("never");
  const [endDate, setEndDate] = useState("");
  const [occurrences, setOccurrences] = useState("");
  const [saving, setSaving] = useState(false);

  const vendorDir = useMemo(
    () => (companyId ? createVendorDirectory(expenseService, companyId) : null),
    [expenseService, companyId]
  );

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      // Materialise anything that has come due, THEN read — so a bill
      // that fell due overnight is present in the same paint.
      const generated = await billScheduleService.generateDue(companyId);
      const [billRows, scheduleRows, projectRows] = await Promise.all([
        expenseService.listBills(companyId),
        billScheduleService.listForCompany(companyId),
        projectService.list({ companyId }),
      ]);
      setBills(billRows);
      setSchedules(scheduleRows);
      setProjects(projectRows);
      if (generated > 0) {
        setNotice(`${generated} recurring bill${generated === 1 ? "" : "s"} generated.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  }, [companyId, expenseService, billScheduleService, projectService]);

  useEffect(() => {
    load();
  }, [load]);

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const unpaid = useMemo(() => bills.filter((b) => !b.isPaid), [bills]);

  /** The existing breakdown function — not a bespoke sum. */
  const outstanding = useMemo(() => calculateExpenseTotals(unpaid).unpaid, [unpaid]);

  /** Date bucketing for display. No money is derived here. */
  const groups = useMemo(() => {
    const now = today();
    const soonCutoff = new Date(Date.now() + DUE_SOON_DAYS * 86400000).toISOString().slice(0, 10);
    return {
      overdue: unpaid.filter((b) => (b.dueDate ?? "") < now),
      dueSoon: unpaid.filter((b) => (b.dueDate ?? "") >= now && (b.dueDate ?? "") <= soonCutoff),
      upcoming: unpaid.filter((b) => (b.dueDate ?? "") > soonCutoff),
    };
  }, [unpaid]);

  function resetForm() {
    setVendor("");
    setVendorId(null);
    setBillNumber("");
    setAmount("");
    setBillDate(today());
    setDueDate(today());
    setExpenseType("miscellaneous");
    setProjectId("");
    setNotes("");
    setRepeat("none");
    setEndMode("never");
    setEndDate("");
    setOccurrences("");
  }

  async function handleSave() {
    if (!companyId) return;
    const value = parseFloat(amount) || 0;
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (repeat === "none") {
        // ONE expense row, with a due date. Nothing else.
        await expenseService.create({
          companyId,
          projectId: projectId || null,
          expenseType,
          amount: value,
          expenseDate: billDate,
          dueDate,
          billNumber: billNumber.trim() || null,
          vendor: vendor.trim() || null,
          payeeType: vendor.trim() ? "vendor" : null,
          payeeId: vendorId,
          paidByType: "company",
          isPaid: false,
          reimbursable: false,
          notes: notes.trim() || null,
        });
        setNotice("Bill added.");
      } else {
        // A RULE, not a cost. generateDue turns each occurrence into an
        // ordinary expense; the first one appears on the next load.
        await billScheduleService.create({
          companyId,
          projectId: projectId || null,
          vendor: vendor.trim() || null,
          amount: value,
          expenseType,
          notes: notes.trim() || null,
          frequency: repeat,
          startDate: dueDate,
          endDate: endMode === "on" && endDate ? endDate : null,
          maxOccurrences: endMode === "after" ? parseInt(occurrences, 10) || null : null,
        });
        setNotice("Recurring bill created.");
      }
      resetForm();
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this bill.");
    } finally {
      setSaving(false);
    }
  }

  /** Paying a bill is the existing expense update path — `is_paid`. No
   * separate payment record, no status to sync. */
  async function markPaid(bill: Expense) {
    setBusyId(bill.id);
    setError(null);
    try {
      await expenseService.update(bill.id, { isPaid: true });
      await load();
      setNotice(`Marked ${bill.vendor || "bill"} paid.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this bill paid.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    if (filter === "paid") return bills.filter((b) => b.isPaid);
    if (filter === "all") return bills;
    return unpaid;
  }, [filter, bills, unpaid]);

  function BillRow({ bill }: { bill: Expense }) {
    const overdue = !bill.isPaid && (bill.dueDate ?? "") < today();
    return (
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {bill.vendor || EXPENSE_TYPE_LABEL[bill.expenseType]}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            Due {bill.dueDate}
            {bill.billNumber && ` · #${bill.billNumber}`}
            {bill.projectId && ` · ${projectName.get(bill.projectId) ?? "Project"}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`text-sm font-bold tabular-nums ${
              bill.isPaid ? "text-muted-foreground" : overdue ? "text-danger" : "text-foreground"
            }`}
          >
            {money(bill.amount)}
          </span>
          {bill.isPaid ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
              <Check className="size-3.5" /> Paid
            </span>
          ) : (
            <button
              type="button"
              onClick={() => markPaid(bill)}
              disabled={busyId === bill.id}
              className="min-h-9 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Pay
            </button>
          )}
        </div>
      </div>
    );
  }

  function Group({ title, icon: Icon, rows, tone }: { title: string; icon: typeof AlertTriangle; rows: Expense[]; tone: string }) {
    if (rows.length === 0) return null;
    return (
      <div className="mb-3">
        <h3 className={`mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${tone}`}>
          <Icon className="size-3.5" /> {title}
        </h3>
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((b) => (
            <BillRow key={b.id} bill={b} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Bills"
        description="Invoices your business has received."
        actions={
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setError(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:text-sm"
          >
            <Plus className="size-4" /> Add Bill
          </button>
        }
      />

      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">{notice}</div>
      )}

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Receipt className={`size-4 shrink-0 ${outstanding > 0 ? "text-warning" : "text-muted-foreground"}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</span>
        <span className={`text-base font-bold tabular-nums ${outstanding > 0 ? "text-warning" : "text-foreground"}`}>
          {money(outstanding)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {unpaid.length} unpaid
        </span>
      </div>

      {/* ---------- ADD BILL (compact; recurrence revealed on demand) ---------- */}
      {adding && (
        <section className="mb-4 space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <span className={LABEL}>Vendor</span>
              {vendorDir && (
                <CreateOrSelect
                  adapter={vendorDir}
                  value={vendorId}
                  valueLabel={vendor || null}
                  onChange={(opt: DirectoryOption | null) => {
                    setVendorId(opt?.id ?? null);
                    setVendor(opt?.label ?? "");
                  }}
                  placeholder="Search or add a vendor"
                />
              )}
            </div>

            <label className="block">
              <span className={LABEL}>Amount</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>Bill #</span>
              <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Optional" className={FIELD} />
            </label>

            <label className="block">
              <span className={LABEL}>{repeat === "none" ? "Bill date" : "Starts"}</span>
              <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
            </label>

            <label className="block">
              <span className={LABEL}>Category</span>
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value as ExpenseType)} className={FIELD}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>{EXPENSE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="col-span-2 block">
              <span className={LABEL}>Repeat</span>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as "none" | BillFrequency)} className={FIELD}>
                <option value="none">Does not repeat</option>
                {BILL_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{BILL_FREQUENCY_LABEL[f]}</option>
                ))}
              </select>
            </label>

            {/* Recurrence fields appear only once a frequency is chosen —
                the form stays four rows for the common one-time case. */}
            {repeat !== "none" && (
              <div className="col-span-2 grid grid-cols-2 gap-2.5 rounded-lg border border-border/60 bg-background p-2.5">
                <label className="col-span-2 block">
                  <span className={LABEL}>Ends</span>
                  <select value={endMode} onChange={(e) => setEndMode(e.target.value as "never" | "on" | "after")} className={FIELD}>
                    <option value="never">Never</option>
                    <option value="on">On date</option>
                    <option value="after">After N occurrences</option>
                  </select>
                </label>
                {endMode === "on" && (
                  <label className="col-span-2 block">
                    <span className={LABEL}>End date</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
                  </label>
                )}
                {endMode === "after" && (
                  <label className="col-span-2 block">
                    <span className={LABEL}>Occurrences</span>
                    <input type="number" min="1" value={occurrences}
                      onChange={(e) => setOccurrences(e.target.value)} placeholder="12" className={FIELD} />
                  </label>
                )}
              </div>
            )}

            <label className="col-span-2 block">
              <span className={LABEL}>Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={FIELD} />
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Attachments aren&apos;t available yet — expense file storage isn&apos;t set up.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); resetForm(); }}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : repeat === "none" ? "Save Bill" : "Create Recurring"}
            </button>
          </div>
        </section>
      )}

      <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-0.5">
        {(["unpaid", "paid", "recurring", "all"] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : filter === "recurring" ? (
        schedules.length === 0 ? (
          <EmptyState icon={Repeat} title="No recurring bills" description="Add a bill and set Repeat to create one." />
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{s.vendor || "Recurring bill"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {BILL_FREQUENCY_LABEL[s.frequency]} · next {s.nextDueDate}
                    {!s.isActive && " · ended"}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{money(s.amount)}</span>
              </div>
            ))}
          </div>
        )
      ) : filter === "unpaid" ? (
        unpaid.length === 0 ? (
          <EmptyState icon={Receipt} title="No unpaid bills" description="Everything received has been paid." />
        ) : (
          <>
            <Group title="Overdue" icon={AlertTriangle} rows={groups.overdue} tone="text-danger" />
            <Group title="Due soon" icon={CalendarClock} rows={groups.dueSoon} tone="text-warning" />
            <Group title="Upcoming" icon={Calendar} rows={groups.upcoming} tone="text-muted-foreground" />
          </>
        )
      ) : visible.length === 0 ? (
        <EmptyState icon={Receipt} title="No bills" description="Add a bill to get started." />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((b) => (
            <BillRow key={b.id} bill={b} />
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        A bill is an expense with a due date, so bills already count in job costing and every
        financial total. See <Link href="/payments" className="text-primary hover:underline">Payments</Link>{" "}
        for subcontractors, agents and reimbursements.
      </p>
    </PageContainer>
  );
}

export default function BillsPage() {
  return (
    <RequirePermission resource="expense" action="view">
      <BillsContent />
    </RequirePermission>
  );
}
