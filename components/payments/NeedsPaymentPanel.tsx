"use client";

/**
 * "Needs Payment" — one place to pay agents, subcontractors and team
 * member reimbursements.
 *
 * ============================================================
 * NO NEW TABLE, NO NEW SERVICE, NO NEW MATH
 * ============================================================
 * Everything shown is read from existing sources, and everything paid is
 * written through the existing paths:
 *
 *   READ  subcontractors  FinancialEngine.getPayeeBalances(scope, "subcontractor")
 *         agents          FinancialEngine.getPayeeBalances(scope, "agent")
 *         team members    ExpenseService.listPendingReimbursements(companyId)
 *
 *   PAY   subcontractor / agent   ExpenseService.create(...)  -- ONE PAYMENT
 *                                 = ONE EXPENSE RECORD, typed
 *                                 `subcontractor` / `agent_commission`
 *                                 and tagged with the payee. Exactly what
 *                                 SubcontractorAssignmentPanel's "Pay"
 *                                 already writes.
 *         team reimbursement      ExpenseService.markReimbursed(expenseId)
 *
 * WHY THIS AND NOT A `payments` TABLE. FinancialEngine derives what is
 * owed like this:
 *
 *     row.paid += e.amount;                       // EXPENSE rows only
 *     row.outstanding = calculateCommittedCostBalance(contracted, paid)
 *
 * A separate payments table would be invisible to that, so paying
 * somebody would not reduce their outstanding balance and they would sit
 * on this list forever — the "manual status syncing" this feature exists
 * to avoid. Writing the expense row instead means the balance moves on
 * its own, because the thing the engine reads is the thing we wrote.
 * Same for a reimbursement: `markReimbursed` flips the status the
 * pending-reimbursement query filters on.
 *
 * This component therefore computes NOTHING. Every figure it renders came
 * from FinancialEngine or ExpenseService, and every write is a call to a
 * method that already existed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HandCoins, HardHat, Briefcase, UsersRound, X, ChevronDown, ChevronRight, ExternalLink, Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import {
  calculateExpenseTotals,
  derivePayableState,
  isActionablePayable,
  JOB_COMPLETE_ESTIMATE_STATUSES,
  JOB_COMPLETE_PROJECT_STATUSES,
  type PayableState,
} from "@/lib/services/financialCalculations";
import { EXPENSE_TYPE_LABEL, type Expense } from "@/lib/services/expenseService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "Materials for Roof-estimate-one", "Assign for Smith Remodel".
 *
 * Every breakdown line answers the same question — what is this amount
 * FOR — in the same shape, so the two kinds of money owed are
 * distinguishable at a glance:
 *
 *   an EXPENSE row      -> "<type> for <job>"    (a cost already incurred)
 *   an ASSIGNMENT       -> "Assign for <job>"    (work committed, not yet a cost)
 *
 * The job name is dropped rather than faked when a row has neither an
 * estimate nor a project. */
const labelFor = (what: string, job: string | null) => (job ? `${what} for ${job}` : what);

/** `team_member` = money they FRONTED (a reimbursement, settled by
 * flipping existing expense rows). `team_labour` = money we owe them
 * for ASSIGNED WORK (settled by creating an expense, exactly like a
 * subcontractor payout). Two different debts to the same person, and
 * two different settlement mechanics — conflating them made labour
 * unpayable, because the reimbursement branch had no rows to flip. */
type PayeeKind = "subcontractor" | "agent" | "team_member" | "team_labour" | "bill";

/** One row on the list. `expenses` is populated only for team members —
 * a reimbursement is settled by flipping specific expense rows, so the
 * rows themselves are what gets paid. */
/** One line of "where this balance came from". Built only from figures
 * the services already returned — a PayableLine's own `outstanding` for
 * a sub/agent, an expense row's own `amount` for a reimbursement. */
type SourceLine = {
  id: string;
  label: string;
  sublabel: string;
  amount: number;
  /** Set for assignment-backed lines so the row can offer "Enter
   * amount" instead of a Pay button it cannot honour. */
  state?: PayableState;
  role?: "subcontractor" | "agent";
  payeeId?: string;
  /** Where to go to see it. Payables hang off a project/estimate, not an
   * invoice — invoices are the customer side of the ledger. */
  href: string | null;
};

type Payable = {
  kind: PayeeKind;
  payeeId: string;
  payeeName: string;
  outstanding: number;
  /** Where the outstanding figure comes from. */
  sources: SourceLine[];
  /** How many of those lines are finished jobs with no amount entered. */
  needsAmount?: number;
  /** What was COMMITTED, and what has gone out against it. Only
   * assignment-backed kinds have these — a bill or a reimbursement was
   * never "assigned" to anyone, it was simply incurred. Read straight
   * off the engine's balances; `outstanding` stays the payable figure. */
  assigned?: number;
  paidSoFar?: number;
  /** Which project to attach a payout expense to. Taken from the payee's
   * own assignments so the cost lands on a real job instead of becoming
   * an orphan with no project and no estimate. */
  projectId: string | null;
  expenses: Expense[];
};

const KIND_META: Record<PayeeKind, { label: string; icon: typeof HardHat }> = {
  bill: { label: "Bill", icon: Receipt },
  subcontractor: { label: "Subcontractor", icon: HardHat },
  agent: { label: "Agent", icon: Briefcase },
  team_member: { label: "Team member", icon: UsersRound },
  team_labour: { label: "Team labour", icon: UsersRound },
};

export function NeedsPaymentPanel() {
  const { financialEngine, expenseService, subcontractorService, agentCommissionService, projectService, estimateService, teamAssignmentService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [rows, setRows] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [paying, setPaying] = useState<Payable | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  /** Which payee rows are expanded. Keyed the same way the list is. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** assignmentId currently being priced inline, and its draft value. */
  const [pricing, setPricing] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [pricingBusy, setPricingBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const scope = { companyId };
      const [subs, agents, teamLabour, pending, billRows, members, payables, subAssign, agentAssign, projects, estimates] =
        await Promise.all([
          financialEngine.getPayeeBalances(scope, "subcontractor"),
          financialEngine.getPayeeBalances(scope, "agent"),
          // Team-member LABOUR (assigned work), distinct from their
          // reimbursements below — same person can be owed both.
          financialEngine.getPayeeBalances(scope, "team_member"),
          expenseService.listPendingReimbursements(companyId),
          // Unpaid vendor bills — expenses carrying a due date. Same
          // rows the Bills page shows; nothing is recomputed.
          expenseService.listBills(companyId),
          supabase.rpc("list_company_members"),
          // Per-ASSIGNMENT outstanding, already computed by the engine.
          // Used only to break the payee total down — never recomputed
          // here, so the parts always sum to the whole.
          financialEngine.getPayablesSummary(scope),
          // Assignments carry the projectId a PayableLine doesn't, which
          // is what makes each breakdown line linkable.
          subcontractorService.listAssignments(scope),
          agentCommissionService.listAssignments(scope),
          projectService.list(scope),
          estimateService.list(scope),
        ]);

      const projectName = new Map(projects.map((p) => [p.id, p.name]));

      /** project -> its estimate, ONLY when the project has exactly one.
       *
       * Assignments are made per PROJECT — the existing assignToProject
       * never records an estimate_id (verified: 1 of 4 subcontractor and
       * 1 of 5 agent assignments carry one). Where the assignment does
       * name an estimate we use it. Where it does not, a project with a
       * single estimate resolves unambiguously; a project with several
       * cannot, and guessing would link to the wrong job, so those keep
       * the project link. */
      const soleEstimateOfProject = new Map<string, string>();
      {
        const byProject = new Map<string, string[]>();
        for (const e of estimates) {
          if (!e.projectId) continue;
          const list = byProject.get(e.projectId) ?? [];
          list.push(e.id);
          byProject.set(e.projectId, list);
        }
        for (const [pid, ids] of byProject) {
          if (ids.length === 1) soleEstimateOfProject.set(pid, ids[0]);
        }
      }
      const estimateOf = new Map(
        estimates.map((e) => [e.id, e.title || e.estimateNumber || e.id.slice(0, 8)])
      );
      // Assignments carry BOTH ids. The estimate is the job somebody
      // actually recognises, so it wins; the project is only a fallback
      // for legacy rows saved before estimate_id was populated.
      const assignmentJob = new Map<string, { estimateId: string | null; projectId: string | null }>([
        ...subAssign.map((a) => [a.id, { estimateId: a.estimateId, projectId: a.projectId }] as const),
        ...agentAssign.map((a) => [a.id, { estimateId: a.estimateId, projectId: a.projectId }] as const),
      ]);

      const memberNames = new Map(
        (((members.data ?? []) as Array<{ id: string; email: string | null; full_name?: string | null }>) || []).map(
          (m) => [m.id, m.full_name?.trim() || m.email || "Unnamed user"]
        )
      );

      // Team members: group their own pending reimbursements. The
      // outstanding figure is calculateExpenseTotals' — the same rule
      // every other pending-reimbursement number in the app uses.
      const byUser = new Map<string, Expense[]>();
      for (const e of pending) {
        if (e.paidByType !== "employee" || !e.paidById) continue;
        const list = byUser.get(e.paidById) ?? [];
        list.push(e);
        byUser.set(e.paidById, list);
      }

      const estimateStatus = new Map(estimates.map((e) => [e.id, e.status as string]));
      const projectStatus = new Map(projects.map((p) => [p.id, p.status as string]));

      /* Team labour: getPayablesSummary only builds lines for sub/agent,
       * so there is no per-assignment breakdown to classify. Classify at
       * payee level instead — jobComplete is true when ANY of their
       * assigned jobs is complete, which is the same "should I be
       * chasing this" question one level up. */
      const teamAssignmentRows = await teamAssignmentService.listAssignments(scope);
      const teamAssignmentsByUser = new Map<string, { complete: boolean }>();
      for (const a of teamAssignmentRows) {
        const est = a.estimateId ? estimateStatus.get(a.estimateId) : undefined;
        const proj = a.projectId ? projectStatus.get(a.projectId) : undefined;
        const complete =
          (!!est && (JOB_COMPLETE_ESTIMATE_STATUSES as readonly string[]).includes(est)) ||
          (!!proj && (JOB_COMPLETE_PROJECT_STATUSES as readonly string[]).includes(proj));
        const cur = teamAssignmentsByUser.get(a.userId);
        teamAssignmentsByUser.set(a.userId, { complete: (cur?.complete ?? false) || complete });
      }

      const teamLabourRows: Payable[] = teamLabour
        .map((b) => {
          const state = derivePayableState({
            contracted: b.contracted,
            paid: b.paid,
            jobComplete: teamAssignmentsByUser.get(b.payeeId)?.complete ?? false,
          });
          if (!isActionablePayable(state)) return null;
          return {
            kind: "team_labour" as PayeeKind,
            payeeId: b.payeeId,
            payeeName: b.payeeName,
            outstanding: b.outstanding,
            needsAmount: state === "needs_amount" ? 1 : 0,
            assigned: b.contracted,
            paidSoFar: b.paid,
            /* One line PER ASSIGNMENT so each links to the job it came
             * from. `amount` is that assignment's ASSIGNED figure, not
             * its outstanding: getPayablesSummary builds no lines for
             * team labour, so payments are only known at payee level.
             * The row header carries the authoritative outstanding. */
            sources: teamAssignmentRows
              .filter((a) => a.userId === b.payeeId)
              .map((a) => ({
                id: a.id,
                label: labelFor(
                  "Assign",
                  (a.estimateId && estimateOf.get(a.estimateId)) ||
                    (a.projectId && projectName.get(a.projectId)) ||
                    null
                ),
                sublabel:
                  state === "needs_amount"
                    ? "job complete · amount not entered"
                    : `assigned ${money(a.amount)} · paid ${money(b.paid)} of ${money(b.contracted)}`,
                amount: a.amount,
                href: a.estimateId
                  ? `/estimates/${a.estimateId}`
                  : a.projectId
                  ? `/projects/${a.projectId}`
                  : null,
              })),
            projectId: b.projectIds[0] ?? null,
            expenses: [],
          } as Payable;
        })
        .filter((r): r is Payable => r !== null);

      const teamRows: Payable[] = [...byUser.entries()].map(([userId, theirs]) => ({
        kind: "team_member",
        payeeId: userId,
        payeeName: memberNames.get(userId) ?? "Unknown member",
        outstanding: calculateExpenseTotals(theirs).outstandingReimbursements,
        // One line per unpaid expense they fronted, linked to the job it
        // was for. The estimate is the more specific target when the row
        // has one; otherwise the project.
        sources: [...theirs]
          .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate))
          .map((e) => ({
            id: e.id,
            // The TYPE, not the description: "Materials for Roof-estimate-one"
            // says what the money was for at a glance, where a free-text
            // note may say anything or nothing. The note still shows on
            // the second line when there is one.
            label: labelFor(
              EXPENSE_TYPE_LABEL[e.expenseType],
              (e.estimateId && estimateOf.get(e.estimateId)) ||
                (e.projectId && projectName.get(e.projectId)) ||
                null
            ),
            sublabel: [e.expenseDate, e.description || e.notes || e.vendor]
              .filter(Boolean)
              .join(" · "),
            amount: e.amount,
            href: e.estimateId
              ? `/estimates/${e.estimateId}`
              : e.projectId
              ? `/projects/${e.projectId}`
              : null,
          })),
        projectId: null,
        // Oldest first, so settling part of a balance clears the debts
        // that have been waiting longest.
        expenses: [...theirs].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate)),
      }));

      // One row PER VENDOR, so a vendor with three open bills is one
      // line to act on. Grouped by vendor name because bills carry a
      // free-text vendor, not a payee id.
      const unpaidBills = billRows.filter((b) => !b.isPaid);
      const byVendor = new Map<string, Expense[]>();
      for (const b of unpaidBills) {
        const key = b.vendor?.trim() || "Unnamed vendor";
        const list = byVendor.get(key) ?? [];
        list.push(b);
        byVendor.set(key, list);
      }
      const billRowsGrouped: Payable[] = [...byVendor.entries()].map(([name, theirs]) => ({
        kind: "bill" as PayeeKind,
        payeeId: `vendor:${name}`,
        payeeName: name,
        // The existing breakdown function's `unpaid`, not a bespoke sum.
        outstanding: calculateExpenseTotals(theirs).unpaid,
        sources: [...theirs]
          .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
          .map((b) => ({
            id: b.id,
            label: labelFor(
              EXPENSE_TYPE_LABEL[b.expenseType],
              (b.estimateId && estimateOf.get(b.estimateId)) ||
                (b.projectId && projectName.get(b.projectId)) ||
                null
            ),
            sublabel: [`due ${b.dueDate}`, b.billNumber && `#${b.billNumber}`]
              .filter(Boolean)
              .join(" · "),
            amount: b.amount,
            href: b.estimateId
              ? `/estimates/${b.estimateId}`
              : b.projectId
              ? `/projects/${b.projectId}`
              : "/bills",
          })),
        projectId: null,
        expenses: theirs,
      }));

      // Job status per assignment — the estimate is the job, the
      // project is the fallback for assignments made before estimate_id
      // was recorded.
      const jobCompleteFor = (assignmentId: string): boolean => {
        const job = assignmentJob.get(assignmentId);
        const pid = job?.projectId ?? null;
        const eid = job?.estimateId ?? (pid ? soleEstimateOfProject.get(pid) ?? null : null);
        const est = eid ? estimateStatus.get(eid) : undefined;
        if (est && (JOB_COMPLETE_ESTIMATE_STATUSES as readonly string[]).includes(est)) return true;
        const proj = pid ? projectStatus.get(pid) : undefined;
        return !!proj && (JOB_COMPLETE_PROJECT_STATUSES as readonly string[]).includes(proj);
      };

      /* Classify PER ASSIGNMENT, then roll up.
       *
       * Payee-level would be wrong: somebody with one finished job and
       * one still in progress should only be chased for the finished
       * one. The engine already gives per-assignment assigned/paid via
       * getPayablesSummary; derivePayableState only labels them. */
      const payeeRows: Payable[] = [...subs, ...agents]
        .map((b) => {
          const lines = payables.lines
            .filter((l) => l.payeeId === b.payeeId && l.role === b.role)
            .map((l) => ({
              line: l,
              state: derivePayableState({
                contracted: l.assigned,
                paid: l.paid,
                jobComplete: jobCompleteFor(l.assignmentId),
              }),
            }))
            .filter(({ state }) => isActionablePayable(state));

          if (lines.length === 0) return null;

          const sources = lines.map(({ line: l, state }) => {
            const job = assignmentJob.get(l.assignmentId);
            const pid = job?.projectId ?? null;
            const eid = job?.estimateId ?? (pid ? soleEstimateOfProject.get(pid) ?? null : null);
            return {
              id: l.assignmentId,
              label: labelFor(
                "Assign",
                (eid && estimateOf.get(eid)) || (pid && projectName.get(pid)) || null
              ),
              sublabel:
                state === "needs_amount"
                  ? "job complete · amount not entered"
                  : `assigned ${money(l.assigned)} · paid ${money(l.paid)}`,
              amount: l.outstanding as number,
              href: eid ? `/estimates/${eid}` : pid ? `/projects/${pid}` : null,
              state,
              role: b.role as "subcontractor" | "agent",
              payeeId: b.payeeId,
            };
          });

          return {
            kind: b.role as PayeeKind,
            payeeId: b.payeeId,
            payeeName: b.payeeName,
            // Only the actionable assignments' outstanding — a payee
            // owed nothing on a finished job still shows, at $0, with
            // "needs amount".
            outstanding: lines.reduce((sum, { line }) => sum + (line.outstanding as number), 0),
            needsAmount: lines.filter(({ state }) => state === "needs_amount").length,
            // Only the actionable lines, so the assigned figure and the
            // outstanding figure describe the same set of jobs.
            assigned: lines.reduce((sum, { line }) => sum + line.assigned, 0),
            paidSoFar: lines.reduce((sum, { line }) => sum + line.paid, 0),
            sources,
            projectId: b.projectIds[0] ?? null,
            expenses: [],
          } as Payable;
        })
        .filter((r): r is Payable => r !== null);

      setRows(
        [...billRowsGrouped, ...payeeRows, ...teamLabourRows, ...teamRows]
          // Keep rows worth $0 when they are asking for an amount —
          // that row IS the reminder.
          .filter((r) => r.outstanding > 0 || (r.needsAmount ?? 0) > 0)
          .sort((a, b) => b.outstanding - a.outstanding)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payables.");
    } finally {
      setLoading(false);
    }
  }, [companyId, financialEngine, expenseService]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.outstanding, 0), [rows]);

  function openPay(row: Payable) {
    setPaying(row);
    // Pre-filled with what's owed — the common case is paying it in full.
    setAmount(row.outstanding.toFixed(2));
    setMethod("");
    setReference("");
    setNotes("");
    setNotice(null);
    setError(null);
  }

  /** For a team member, which whole expenses the entered amount settles.
   * A reimbursement is settled per EXPENSE ROW (markReimbursed flips a
   * row's status), so a part-payment clears the oldest rows that fit
   * rather than pretending a row can be half-settled. */
  const settlement = useMemo(() => {
    if (!paying || (paying.kind !== "team_member" && paying.kind !== "bill")) return null;
    const target = parseFloat(amount) || 0;
    let running = 0;
    const covered: Expense[] = [];
    for (const e of paying.expenses) {
      if (running + e.amount > target + 0.001) break;
      running += e.amount;
      covered.push(e);
    }
    return { covered, coveredTotal: running, of: paying.expenses.length };
  }, [paying, amount]);

  /** Set the amount on an assignment that was never priced.
   *
   * Writes through the assignment services' own amount mutators — the
   * same field getPayeeBalances reads as `contracted`. Once it lands,
   * derivePayableState reclassifies the row from "needs_amount" to
   * "unpaid" on the next load and the Pay button appears. Nothing here
   * creates an expense: no money has moved yet. */
  async function savePrice(src: SourceLine) {
    const value = parseFloat(priceValue) || 0;
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPricingBusy(true);
    setError(null);
    try {
      if (src.role === "subcontractor") {
        await subcontractorService.updateAssignmentAmount(src.id, value);
      } else {
        await agentCommissionService.updateAssignmentAmount(src.id, value);
      }
      setPricing(null);
      setPriceValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that amount.");
    } finally {
      setPricingBusy(false);
    }
  }

  async function handlePay() {
    if (!paying || !companyId) return;
    const value = parseFloat(amount) || 0;
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (paying.kind === "bill") {
        // A bill IS the expense. Paying it flips is_paid on the row that
        // already holds the cost — no new expense, nothing to reconcile.
        if (!settlement || settlement.covered.length === 0) {
          setError("That amount doesn't cover any single bill.");
          setSaving(false);
          return;
        }
        for (const b of settlement.covered) {
          await expenseService.update(b.id, {
            isPaid: true,
            paymentMethod: method || null,
          });
        }
        setNotice(
          `Paid ${paying.payeeName} — ${settlement.covered.length} bill${
            settlement.covered.length === 1 ? "" : "s"
          }, ${money(settlement.coveredTotal)}.`
        );
      } else if (paying.kind === "team_labour") {
        // ONE PAYMENT = ONE EXPENSE RECORD — the same write a
        // subcontractor payout performs, typed `labor` and tagged with
        // the member as PAYEE (paidByType stays "company": we are
        // paying them, they did not front anything).
        await expenseService.create({
          companyId,
          projectId: paying.projectId,
          expenseType: "labor",
          amount: value,
          expenseDate: new Date().toISOString().slice(0, 10),
          vendor: paying.payeeName,
          payeeType: "employee",
          payeeId: paying.payeeId,
          paidByType: "company",
          paymentMethod: method || null,
          isPaid: true,
          reimbursable: false,
          notes: [reference && `Ref: ${reference}`, notes].filter(Boolean).join(" — ") || null,
        });
        setNotice(`Paid ${paying.payeeName} ${money(value)}.`);
      } else if (paying.kind === "team_member") {
        if (!settlement || settlement.covered.length === 0) {
          setError("That amount doesn't cover any single outstanding expense.");
          setSaving(false);
          return;
        }
        // Settle the debt on the rows themselves. No new record: the
        // expense already IS the cost, this only marks it repaid.
        for (const e of settlement.covered) {
          await expenseService.markReimbursed(e.id);
        }
        setNotice(
          `Reimbursed ${paying.payeeName} — ${settlement.covered.length} expense${
            settlement.covered.length === 1 ? "" : "s"
          }, ${money(settlement.coveredTotal)}.`
        );
      } else {
        // ONE PAYMENT = ONE EXPENSE RECORD. This is the same write
        // SubcontractorAssignmentPanel's "Pay" performs.
        await expenseService.create({
          companyId,
          projectId: paying.projectId,
          expenseType: paying.kind === "subcontractor" ? "subcontractor" : "agent_commission",
          amount: value,
          expenseDate: new Date().toISOString().slice(0, 10),
          vendor: paying.payeeName,
          payeeType: paying.kind,
          payeeId: paying.payeeId,
          paidByType: "company",
          paymentMethod: method || null,
          isPaid: true,
          // The company paid this out; nobody is owed a reimbursement
          // for it. Passing false explicitly rather than relying on the
          // derived default keeps the intent readable.
          reimbursable: false,
          notes: [reference && `Ref: ${reference}`, notes].filter(Boolean).join(" — ") || null,
        });
        setNotice(`Paid ${paying.payeeName} ${money(value)}.`);
      }

      setPaying(null);
      // Balances re-read from the engine, which now sees what we wrote.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    } finally {
      setSaving(false);
    }
  }

  /* ONE ROW PER PERSON.
   *
   * `rows` is built per KIND, because paying an assignment, a bill and a
   * reimbursement are three different writes. But Agent-1 is one human,
   * and seeing them listed twice — once for an assignment, once for an
   * expense — reads as two debts when it is one.
   *
   * So the kinds are merged for DISPLAY only. Each part keeps its own
   * kind, its own sources and its own Pay button, so nothing about the
   * payment paths changes; the sum is a plain total of the same amounts
   * already shown. Merging on the displayed name rather than the id is
   * deliberate: the same person is a different id as an agent than as a
   * team member, and the name is what makes the duplicate obvious.
   */
  const payees = (() => {
    const byName = new Map<string, Payable[]>();
    for (const r of rows) {
      const k = r.payeeName.trim().toLowerCase();
      byName.set(k, [...(byName.get(k) ?? []), r]);
    }
    return [...byName.entries()]
      .map(([key, parts]) => ({
        key,
        payeeName: parts[0].payeeName,
        parts,
        outstanding: parts.reduce((s, p) => s + p.outstanding, 0),
        needsAmount: parts.reduce((s, p) => s + (p.needsAmount ?? 0), 0),
        assigned: parts.reduce((s, p) => s + (p.assigned ?? 0), 0),
        paidSoFar: parts.reduce((s, p) => s + (p.paidSoFar ?? 0), 0),
      }))
      .sort((a, b) => b.outstanding - a.outstanding);
  })();

  /** "Agent · 1 job", "Team member · 2 expenses" — the per-kind detail
   * that used to be the row's whole subtitle, now one of several. */
  const describePart = (p: Payable) => {
    const n = p.sources.length;
    const noun =
      p.kind === "team_member" ? "expense" : p.kind === "team_labour" ? "assignment" : p.kind === "bill" ? "bill" : "job";
    return `${KIND_META[p.kind].label} · ${n} ${noun}${n === 1 ? "" : "s"}`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <HandCoins className={`size-4 shrink-0 ${total > 0 ? "text-warning" : "text-muted-foreground"}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Needs payment
        </span>
        <span className={`text-base font-bold tabular-nums ${total > 0 ? "text-warning" : "text-foreground"}`}>
          {money(total)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {payees.length} {payees.length === 1 ? "payee" : "payees"}
        </span>
      </div>

      {error && !paying && (
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

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nobody is owed money"
          description="Subcontractors, agents and team members are all settled up."
        />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {payees.map((g) => {
            const Icon = KIND_META[g.parts[0].kind].icon;
            const key = g.key;
            const isOpen = expanded.has(key);
            /* Only a single-kind payee can be paid from the row itself:
               with two kinds there are two different writes, so the Pay
               buttons live per part inside the expansion. */
            const single = g.parts.length === 1 ? g.parts[0] : null;
            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-2 px-2 py-2.5 sm:px-3">
                  {/* The whole left side toggles — a bigger target than a
                      lone chevron, which matters most on a phone. */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Hide" : "Show"} what ${g.payeeName} is owed for`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left hover:bg-muted/50"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{g.payeeName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {g.parts.map(describePart).join(" + ")}
                        {/* What was committed, next to what is left, so
                            the row says how much of the job's price has
                            already gone out. */}
                        {g.assigned > 0 && (
                          <span> · assigned {money(g.assigned)}</span>
                        )}
                        {g.paidSoFar > 0 && <span> · paid {money(g.paidSoFar)}</span>}
                        {g.needsAmount > 0 && (
                          <span className="ml-1 font-semibold text-warning">
                            · {g.needsAmount} need{g.needsAmount === 1 ? "s" : ""} amount
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-warning">
                      {g.outstanding > 0 ? money(g.outstanding) : "—"}
                    </span>
                    {/* Nothing priced yet — there is no amount to pay, so
                        expanding to enter one is the only sensible action.
                        A Pay button here would open a sheet pre-filled
                        with $0.00. */}
                    {single ? (
                      single.outstanding > 0 ? (
                        <button
                          type="button"
                          onClick={() => openPay(single)}
                          className="min-h-9 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          Pay Now
                        </button>
                      ) : (
                        <span className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] font-semibold text-warning">
                          Needs amount
                        </span>
                      )
                    ) : (
                      <span className="rounded-lg border border-input px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
                        {g.parts.length} to pay
                      </span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/30 px-2 py-1.5 sm:px-3">
                    {g.parts.map((part) => (
                      <div key={part.kind}>
                        {/* Only worth a heading when there is more than one
                            kind to tell apart — and it carries the Pay
                            button for that kind. */}
                        {g.parts.length > 1 && (
                          <div className="flex items-center gap-2 border-b border-border/40 px-1 pb-1 pt-2 first:pt-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {KIND_META[part.kind].label}
                            </span>
                            <span className="text-[10px] font-bold tabular-nums text-warning">
                              {part.outstanding > 0 ? money(part.outstanding) : "needs amount"}
                            </span>
                            {part.outstanding > 0 && (
                              <button
                                type="button"
                                onClick={() => openPay(part)}
                                className="ml-auto rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        )}
                    {part.sources.length === 0 ? (
                      <p className="py-1.5 text-[11px] text-muted-foreground">
                        No itemised source — this balance comes from payments recorded without an
                        assignment.
                      </p>
                    ) : (
                      part.sources.map((src) => {
                        if (src.state === "needs_amount") {
                          const open = pricing === src.id;
                          return (
                            <div key={src.id} className="flex items-center gap-2 px-1 py-1">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-medium text-foreground">
                                  {src.label}
                                </span>
                                <span className="block truncate text-[10px] text-warning">{src.sublabel}</span>
                              </span>
                              {open ? (
                                <>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    autoFocus
                                    value={priceValue}
                                    onChange={(e) => setPriceValue(e.target.value)}
                                    placeholder="0.00"
                                    className="h-7 w-20 shrink-0 rounded-md border border-input bg-background px-1.5 text-[11px] text-foreground outline-none focus-visible:border-ring"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => savePrice(src)}
                                    disabled={pricingBusy}
                                    className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                                  >
                                    Save
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setPricing(src.id); setPriceValue(""); setError(null); }}
                                  className="shrink-0 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning"
                                >
                                  Enter amount
                                </button>
                              )}
                            </div>
                          );
                        }
                        const body = (
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-foreground">
                                {src.label}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {src.sublabel}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
                              {money(src.amount)}
                            </span>
                            {src.href && (
                              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                          </>
                        );
                        return src.href ? (
                          <Link
                            key={src.id}
                            href={src.href}
                            className="flex items-baseline gap-2 rounded-md px-1 py-1 hover:bg-background"
                          >
                            {body}
                          </Link>
                        ) : (
                          <div key={src.id} className="flex items-baseline gap-2 px-1 py-1">
                            {body}
                          </div>
                        );
                      })
                    )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- PAY SHEET ---------- */}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-lg sm:max-w-md sm:rounded-xl">
            <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">Pay {paying.payeeName}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {KIND_META[paying.kind].label} · owed {money(paying.outstanding)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaying(null)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              {error && (
                <div role="alert" className="rounded-lg bg-danger/10 px-2.5 py-2 text-xs font-medium text-danger">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-foreground">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  autoFocus
                />
              </label>

              {/* A reimbursement settles whole expense rows, so say
                  exactly which ones this amount clears rather than
                  implying a row can be part-settled. */}
              {(paying.kind === "team_member" || paying.kind === "bill") && settlement && (
                <p
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    settlement.covered.length === 0
                      ? "bg-danger/10 text-danger"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {settlement.covered.length === 0
                    ? paying.kind === "bill"
                      ? "Too low to settle any single bill — bills are paid in full."
                      : "Too low to settle any single expense — reimbursements clear whole expenses."
                    : `Settles ${settlement.covered.length} of ${settlement.of} ${
                        paying.kind === "bill" ? "bill" : "expense"
                      }${settlement.of === 1 ? "" : "s"} (${money(settlement.coveredTotal)}), ${
                        paying.kind === "bill" ? "soonest due first" : "oldest first"
                      }.`}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-foreground">Method</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-foreground">Reference</span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Check #, txn id"
                    className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-foreground">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </label>

              {/* Method/reference/notes are captured on the expense row's
                  own fields for a payout. A reimbursement settles
                  existing rows, so there is nowhere to put them without
                  inventing a column — say so instead of dropping them
                  silently. */}
              {paying.kind === "team_member" && (
                <p className="text-[11px] text-muted-foreground">
                  Method and reference aren&apos;t stored for reimbursements — they settle existing
                  expense rows rather than creating a new one.
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5 sm:px-4">
              <button
                type="button"
                onClick={() => setPaying(null)}
                className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Recording…" : "Record payment"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
