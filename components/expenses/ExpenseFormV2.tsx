"use client";

/**
 * Expense entry form for /expense-v2. A SEPARATE component from
 * ExpenseDialog by design — that one stays untouched.
 *
 * ============================================================
 * WHY A SECOND FORM IS NOT A SECOND IMPLEMENTATION
 * ============================================================
 * No business logic is restated here. Every rule this form depends on is
 * imported from where it already lives:
 *
 *   EXPENSE_TYPES / PAID_BY_TYPES / PAID_BY_LABEL  lib/services/expenseService
 *   vendor + payee directories                     ./directories
 *   payment methods                                components/payments/paymentMethods
 *   the CreateOrSelect picker                      components/shared/CreateOrSelect
 *   the write                                      ExpenseService.create (via onSubmit)
 *
 * `reimbursable` is derived by the SAME expression ExpenseService.create
 * uses when the field is omitted (`paidByType !== "company"`), so the
 * form previews the service's own default rather than inventing a
 * parallel rule. Amount validation is likewise a mirror of the service's
 * `amount > 0`, which remains the authority — this only avoids a
 * pointless round trip.
 *
 * ============================================================
 * NARROWER ON PURPOSE
 * ============================================================
 * This handles GENERAL expenses only. ExpenseDialog additionally owns
 * the subcontractor and agent-commission tabs, including the
 * multi-agent fan-out and the commission-split preview. Those keep
 * their existing flow untouched: duplicating them here would mean two
 * places computing commissions, which is exactly what this codebase's
 * service layer exists to prevent. So `subcontractor` and
 * `agent_commission` are absent from the type list below, matching
 * ExpenseDialog's own GENERAL_EXPENSE_TYPES filter.
 *
 * "Who fronted this" arrives already answered — /expense-v2 asks it
 * before opening the form — but stays editable here.
 *
 * RECEIPTS ARE NOT COLLECTED. `receiptUrl` exists on ExpenseCreateInput
 * and three receipt columns exist on the table, but nothing in the app
 * writes any of them and there is no storage bucket or upload route for
 * expense receipts (0 of 109 live rows populated). Adding capture here
 * would be new functionality, not reuse, so the field is deliberately
 * omitted rather than shown as an input that silently discards its
 * value. See EXPENSE_FORM.md §8.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, HandCoins, Trash2 } from "lucide-react";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { createVendorDirectory } from "./directories";
import { useServices } from "@/components/providers/ServicesProvider";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  PAID_BY_LABEL,
  type Expense,
  type ExpenseCreateInput,
  type ExpenseType,
  type PaidByType,
} from "@/lib/services";

/** Same exclusion ExpenseDialog applies: these two types have their own
 * dedicated flows (assignment panels + commission split) and must not be
 * enterable through a general form. */
const GENERAL_EXPENSE_TYPES = EXPENSE_TYPES.filter(
  (t) => t !== "subcontractor" && t !== "agent_commission"
);

const FIELD =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-semibold text-foreground";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ExpenseFormV2({
  companyId,
  projectId,
  estimateId,
  initialPaidByType,
  initialReimbursable,
  initialPaidById = null,
  initialPaidByLabel = null,
  onClose,
  onSubmit,
  onChanged,
}: {
  companyId: string;
  projectId: string | null;
  estimateId: string | null;
  /** Answer to "who paid?" collected by the page before this opened. */
  initialPaidByType: PaidByType;
  initialReimbursable: boolean;
  /** Who to reimburse, when the page already knows — for "I Paid" that
   * is the signed-in user. Without it `paidById` stays null and the
   * debt has no owner: ExpenseService.listPendingReimbursements filters
   * on `paid_by_id`, so a null one can never be attributed to anybody. */
  initialPaidById?: string | null;
  /** Display name for the above, so the form can say whose debt it is
   * instead of rendering a bare uuid. */
  initialPaidByLabel?: string | null;
  onClose: () => void;
  onSubmit: (input: Omit<ExpenseCreateInput, "companyId" | "projectId">) => Promise<boolean>;
  /** Called after a delete so the page can refresh its own figures. */
  onChanged?: () => Promise<void> | void;
}) {
  const { expenseService } = useServices();

  // Only the six fields the user actually fills in.
  const [expenseType, setExpenseType] = useState<ExpenseType>("materials");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** What has ALREADY been recorded against this job — so you can see at
   * the moment of entry whether you've logged this cost before, or spot
   * one you forgot. Scoped to the estimate when there is one (the
   * tightest match for "this job"), else to the project. */
  const [jobExpenses, setJobExpenses] = useState<Expense[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadJobExpenses = useCallback(async () => {
    if (!estimateId && !projectId) {
      setJobExpenses([]);
      return;
    }
    try {
      const rows = estimateId
        ? await expenseService.listForEstimate(estimateId)
        : await expenseService.listForProject(projectId as string);
      setJobExpenses(rows);
    } catch {
      // Never block recording a cost because the history lookup failed —
      // the list is context, not a precondition.
      setJobExpenses([]);
    }
  }, [estimateId, projectId, expenseService]);

  useEffect(() => {
    setJobExpenses(null);
    loadJobExpenses();
  }, [loadJobExpenses]);

  /** Soft delete, matching the pattern ProjectExpensesPanel already
   * uses: confirm, then ExpenseService.softDelete with a reason (the
   * service REQUIRES one — validationService.validateDeleteReason
   * rejects a blank). Nothing is destroyed; the row keeps
   * deleted_at/deleted_by/delete_reason and drops out of every
   * calculation because the list and totals queries filter it, not
   * because anything here subtracts.
   *
   * The service refuses to delete an expense whose reimbursement has
   * already been PAID OUT — that is settled cash, not a typo. That
   * error is surfaced verbatim rather than swallowed. */
  async function handleDelete(e: Expense) {
    if (!window.confirm(`Delete this ${money(e.amount)} cost? It can be restored later.`)) return;
    setDeletingId(e.id);
    setError(null);
    try {
      await expenseService.softDelete(e.id, "User deleted via UI");
      await loadJobExpenses();
      // Let the page re-read its own figures in the same interaction,
      // so "Owed to you" cannot disagree with this list.
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this cost.");
    } finally {
      setDeletingId(null);
    }
  }

  const jobTotal = useMemo(
    () => (jobExpenses ?? []).reduce((sum, e) => sum + e.amount, 0),
    [jobExpenses]
  );

  /* ------------------------------------------------------------------
   * NOT ASKED — settled before this form opened, or sensibly defaulted.
   * These are still written; they are simply not questions.
   *
   *   expenseDate    today. Costs are entered as they happen; a
   *                  back-dated one is an edit, not the common case.
   *   paidByType     the page's "who paid?" choice.
   *   paidById       the signed-in user for "I Paid", else none.
   *   reimbursable   follows from that same choice.
   *   isPaid         true — money has already changed hands, which is
   *                  what "recording an expense" means here.
   *   paymentMethod  null. Optional on the row and not needed to cost
   *                  a job; ExpenseDialog still collects it for anyone
   *                  who wants it.
   *   description    null. "Note" is the one free-text field, and two
   *                  boxes that both mean "say something about this"
   *                  is how they end up used inconsistently.
   * ------------------------------------------------------------------ */
  const expenseDate = new Date().toISOString().slice(0, 10);
  const paidByType: PaidByType = initialPaidByType;
  const paidById = initialPaidById;
  const paidByLabel = initialPaidByLabel;
  const reimbursable = initialReimbursable;

  // Vendors are free text by design (no vendors table); the adapter
  // supplies names already used by this company.
  const vendorDir = useMemo(() => createVendorDirectory(expenseService, companyId), [expenseService, companyId]);

  const parsedAmount = parseFloat(amount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ok = await onSubmit({
        estimateId,
        expenseType,
        amount: parsedAmount,
        expenseDate,
        description: null,
        notes: notes.trim() || null,
        vendor: vendor.trim() || null,
        // Only claim a structured payee when one was actually chosen;
        // otherwise this is a free-text vendor and payeeType stays null.
        payeeType: payeeId || vendor.trim() ? "vendor" : null,
        payeeId,
        paidByType,
        paidById,
        paymentMethod: null,
        isPaid: true,
        reimbursable,
      });
      if (!ok) setError("Could not save this expense.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-lg sm:max-w-lg sm:rounded-xl"
      >
        {/* The reimbursement case is called out here, not left to be
            inferred from a checkbox further down: it is the difference
            between a plain job cost and one the company now owes
            somebody back, and it was chosen a screen ago. */}
        <header
          className={`flex items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4 ${
            reimbursable ? "border-warning/30 bg-warning/10" : "border-border"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Record expense</h2>
            {reimbursable && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                <HandCoins className="size-3" /> Reimbursement
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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

          {reimbursable && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-warning">
              This will be recorded as money the company owes{" "}
              <span className="font-semibold">{paidByLabel ?? "whoever paid"}</span> back.
            </p>
          )}

          {/* ---- REQUIRED ---- */}
          <label className="block">
            <span className={LABEL}>Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              required
              autoFocus
            />
          </label>

          <div>
            <span className={LABEL}>Type</span>
            <div className="flex flex-wrap gap-1.5">
              {GENERAL_EXPENSE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setExpenseType(t)}
                  aria-pressed={expenseType === t}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    expenseType === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {EXPENSE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* ---- OPTIONAL ---- */}
          <p className="border-t border-border/60 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Optional
          </p>

          <div>
            <span className={LABEL}>Vendor</span>
            <CreateOrSelect
              adapter={vendorDir}
              value={payeeId}
              valueLabel={vendor || null}
              onChange={(opt: DirectoryOption | null) => {
                setPayeeId(opt?.id ?? null);
                setVendor(opt?.label ?? "");
              }}
              placeholder="Search or add a vendor"
            />
          </div>

          <label className="block">
            <span className={LABEL}>Note</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth remembering about this cost"
              className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>

          {/* RECEIPT (optional) is intentionally absent, not forgotten.
              Nothing in this app can store one: there is no expense
              receipts bucket, no upload route, and all three receipt
              columns are empty across every live row. Rendering a file
              input here would accept a photo and silently drop it,
              which is worse than not offering it. Wiring it up needs a
              storage bucket plus RLS policies — a migration, which this
              task excluded. See EXPENSE_FORM.md §8. */}
          {/* ---- ALREADY ON THIS JOB ----
              Deliberately at the bottom: it is a check you glance at,
              not something to read before typing. Amount / what for /
              who paid — the three fields that tell you whether a cost
              is already here. */}
          {jobExpenses !== null && jobExpenses.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Already on this job
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {jobExpenses.length} · {money(jobTotal)}
                </span>
              </div>
<div className="max-h-40 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
  {jobExpenses.map((e) => {
    const paidByYou = !!e.paidById && e.paidById === paidById;
    return (
      <div
        key={e.id}
        className="flex items-center justify-between gap-2 px-2 py-1"
      >
        {/* Amount */}
        <span className="w-14 shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
          {money(e.amount)}
        </span>

        {/* Description */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {e.description || e.notes || e.vendor || EXPENSE_TYPE_LABEL[e.expenseType]}
        </span>

        {/* Date */}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {new Date(e.createdAt).toLocaleDateString()}
        </span>

        {/* Paid by */}
        <span
          className={`shrink-0 text-[11px] ${
            paidByYou
              ? "font-semibold text-warning"
              : "text-muted-foreground"
          }`}
        >
          {paidByYou ? "You" : PAID_BY_LABEL[e.paidByType]}
        </span>

        {/* Delete button */}
        <button
          type="button"
          onClick={() => handleDelete(e)}
          disabled={deletingId === e.id}
          aria-label={`Delete ${money(e.amount)} cost`}
          title="Delete this cost"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    );
  })}
</div>

            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 sm:px-4">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {reimbursable
              ? `Reimbursing ${paidByLabel ?? "whoever paid"}`
              : "Company paid — no reimbursement"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save expense"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
