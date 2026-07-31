"use client";

/**
 * Record / edit a project expense.
 *
 * Input collection only. It computes no money: the amount is a number
 * the user types, and every total derived from it comes back from
 * ExpenseService/FinancialEngine after the write. There is deliberately
 * no local "running total" here.
 *
 * DYNAMIC PAYEE
 * The payee control is chosen by expense type - subcontractor expenses
 * get the subcontractor directory, agent commissions get the agent
 * directory, everything else gets vendors. All three are the same
 * generic CreateOrSelect over a different DirectoryAdapter, so "search,
 * or create one inline and come back with it selected" behaves
 * identically in all three cases and exists in one implementation.
 *
 * WHO PAID vs WHO WAS PAID are separate controls on purpose - an
 * agent can pay a subcontractor. Conflating them is how a cost ends up
 * attributed to the wrong person. Reimbursement follows from the payer,
 * defaulted (anything not company-paid means someone is owed) but
 * overridable, because a customer-paid expense is often not something
 * the company repays.
 */
import { useMemo, useState, useEffect } from "react";
import { X } from "lucide-react";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { AgentMultiSelect } from "./AgentMultiSelect";
import { AgentCommissionPreview } from "./AgentCommissionPreview";
import { createAgentDirectory, createSubcontractorDirectory, createVendorDirectory } from "./directories";
import { PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import { supabase } from "@/lib/supabase/client";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  PAID_BY_LABEL,
  PAID_BY_TYPES,
  type Expense,
  type ExpenseCreateInput,
  type ExpenseType,
  type PaidByType,
  type ExpensePayeeType,
  type ProjectFinancials,
} from "@/lib/services";

/** Which directory a given expense type should offer, and what the
 * resulting payee is recorded AS. One table instead of branches
 * scattered through the render. */
const PAYEE_KIND: Record<ExpenseType, ExpensePayeeType> = {
  materials: "vendor",
  labor: "vendor",
  subcontractor: "subcontractor",
  agent_commission: "agent",
  permit: "vendor",
  equipment: "vendor",
  reimbursement: "vendor",
  miscellaneous: "vendor",
};

export function ExpenseDialog({
  companyId,
  projectId,
  estimateId,
  expense,
  onClose,
  onSubmit,
}: {
  companyId: string;
  projectId: string | null;
  estimateId?: string | null;
  /** Present when editing. */
  expense?: Expense | null;
  onClose: () => void;
  onSubmit: (input: Omit<ExpenseCreateInput, "companyId" | "projectId">) => Promise<boolean>;
}) {
  const { expenseService, financialEngine } = useServices();
  const isEdit = !!expense;

  const [expenseType, setExpenseType] = useState<ExpenseType>(expense?.expenseType ?? "materials");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(expense?.description ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [payeeId, setPayeeId] = useState<string | null>(expense?.payeeId ?? null);

  const [paidByType, setPaidByType] = useState<PaidByType>(expense?.paidByType ?? "company");
  const [paidById, setPaidById] = useState<string | null>(expense?.paidById ?? null);
  const [paidByLabel, setPaidByLabel] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "");
  const [isPaid, setIsPaid] = useState(expense?.isPaid ?? true);
  // Untouched => follows the payer. Once the user sets it explicitly we
  // stop overriding their choice.
  const [reimbursableOverride, setReimbursableOverride] = useState<boolean | null>(
    expense ? expense.reimbursable : null
  );

  // Agent commission fields
  const [selectedAgents, setSelectedAgents] = useState<Array<{ id: string; label: string }>>([]);
  const [commissionPercent, setCommissionPercent] = useState<40 | 60 | null>(null);
  const [projectFinancials, setProjectFinancials] = useState<ProjectFinancials | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch project financials when showing agent commission preview
  useEffect(() => {
    if (projectId && expenseType === "agent_commission" && !projectFinancials) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      financialEngine.getProjectFinancials(projectId).then(setProjectFinancials).catch(console.error);
    }
  }, [projectId, expenseType, projectFinancials, financialEngine]);

  const payeeKind = PAYEE_KIND[expenseType];
  const reimbursable = reimbursableOverride ?? paidByType !== "company";

  const subcontractorDir = useMemo(() => createSubcontractorDirectory(supabase, companyId), [companyId]);
  const agentDir = useMemo(() => createAgentDirectory(supabase, companyId), [companyId]);
  const vendorDir = useMemo(() => createVendorDirectory(expenseService, companyId), [expenseService, companyId]);

  const payeeDirectory = payeeKind === "subcontractor" ? subcontractorDir : payeeKind === "agent" ? agentDir : vendorDir;

  /** Who fronted it. Only agent/subcontractor resolve to a real record;
   * employee and customer have no table in this app yet, so they carry a
   * type with no id - enough to cost and to owe, without inventing
   * schema for a module that doesn't exist. */
  const payerDirectory = paidByType === "agent" ? agentDir : paidByType === "subcontractor" ? subcontractorDir : null;

  const parsedAmount = parseFloat(amount) || 0;

  function selectPayee(option: DirectoryOption | null) {
    setPayeeId(option?.id ?? null);
    // The display name is always kept, including for structured payees,
    // so a list never has to resolve a uuid to render a row.
    setVendor(option?.label ?? "");
  }

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  // Agent commission validation
  if (expenseType === "agent_commission") {
    if (selectedAgents.length === 0) {
      setError("Select at least one agent to allocate commission to.");
      return;
    }
    if (!commissionPercent) {
      setError("Select a commission percentage (40% or 60%).");
      return;
    }
    if (!projectFinancials) {
      setError("Unable to calculate remaining profit. Please try again.");
      return;
    }

    // Validate that commission doesn't exceed remaining profit
    const otherExpenses = projectFinancials.totalExpenses;
    const remainingProfit = projectFinancials.revisedTotal - otherExpenses;
    const totalCommission = remainingProfit * (commissionPercent / 100);

    if (totalCommission < 0 || remainingProfit < 0) {
      setError("Commission exceeds remaining profit. Adjust expenses or profit before allocating commissions.");
      return;
    }
  }

  // Normal expense validation
  if (parsedAmount <= 0 && expenseType !== "agent_commission") {
    setError("Enter an amount greater than zero.");
    return;
  }

  if (
    (paidByType === "agent" || paidByType === "subcontractor") &&
    !paidById
  ) {
    setError(
      `Please select which ${paidByType} paid this expense before submitting.`
    );
    return;
  }

  setSaving(true);
  setError(null);

  try {
    // Handle agent commission: create one expense per agent
    if (expenseType === "agent_commission" && projectFinancials && commissionPercent && selectedAgents.length > 0) {
      const otherExpenses = projectFinancials.totalExpenses;
      const remainingProfit = projectFinancials.revisedTotal - otherExpenses;
      const commissionPerAgent = (remainingProfit * (commissionPercent / 100)) / selectedAgents.length;

      let allOk = true;
      for (const agent of selectedAgents) {
        const ok = await onSubmit({
          estimateId: estimateId ?? expense?.estimateId ?? null,
          expenseType: "agent_commission",
          amount: commissionPerAgent,
          expenseDate,
          description: description.trim() || null,
          notes: notes.trim() || null,
          vendor: agent.label,
          payeeType: "agent",
          payeeId: agent.id,
          paidByType: "company",
          paidById: null,
          paymentMethod: paymentMethod || null,
          isPaid,
          reimbursable: false,
        });
        if (!ok) allOk = false;
      }

      setSaving(false);
      if (!allOk) {
        setError("Could not save all commissions. Please check and retry.");
      } else {
        onClose();
      }
    } else {
      // Normal expense submission
      const ok = await onSubmit({
        estimateId: estimateId ?? expense?.estimateId ?? null,
        expenseType,
        amount: parsedAmount,
        expenseDate,
        description: description.trim() || null,
        notes: notes.trim() || null,
        vendor: vendor.trim() || null,
        payeeType: payeeId || vendor.trim() ? payeeKind : null,
        payeeId,
        paidByType,
        paidById: paidByType === "company" ? null : paidById,
        paymentMethod: paymentMethod || null,
        isPaid,
        reimbursable,
      });

      setSaving(false);
      if (!ok) setError("Could not save this expense.");
    }
  } catch (err) {
    setSaving(false);
    setError(err instanceof Error ? err.message : "An error occurred.");
  }
}

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{isEdit ? "Edit Expense" : "Record Expense"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Type *</label>
              <select
                value={expenseType}
                onChange={(e) => {
                  const next = e.target.value as ExpenseType;
                  // Switching between payee kinds invalidates the
                  // selected record - an agent id is not a valid
                  // subcontractor id. Cleared rather than silently
                  // mis-filed.
                  if (PAYEE_KIND[next] !== PAYEE_KIND[expenseType]) {
                    setPayeeId(null);
                    setVendor("");
                  }
                  setExpenseType(next);
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>{EXPENSE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Amount {expenseType !== "agent_commission" && "*"}</label>
              <input
                type="number" step="0.01" min="0" required={expenseType !== "agent_commission"} autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
          </div>

          {expenseType !== "agent_commission" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {payeeKind === "subcontractor" ? "Subcontractor" : payeeKind === "agent" ? "Agent" : "Vendor / payee"}
              </label>
              <CreateOrSelect
                adapter={payeeDirectory}
                value={payeeId}
                valueLabel={vendor || null}
                onChange={selectPayee}
              />
              <p className="text-xs text-muted-foreground">
                {payeeKind === "vendor"
                  ? "Vendors are free text - type a new name and it becomes a suggestion next time."
                  : "Not listed? Search for the name, then use \"Create\" - you'll come straight back here with it selected."}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Date *</label>
              <input
                type="date" required value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">-</option>
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-foreground">Paid by</legend>
            <p className="text-xs text-muted-foreground">
              Who fronted the money - separate from who was paid. Anything other than the company means someone is owed
              a reimbursement.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={paidByType}
                onChange={(e) => {
                  const next = e.target.value as PaidByType;
                  setPaidByType(next);
                  setPaidById(null);
                  setPaidByLabel(null);
                  // Reset the override so the default (reimbursable
                  // unless company-paid) applies to the new payer.
                  setReimbursableOverride(null);
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              >
                {PAID_BY_TYPES.map((t) => <option key={t} value={t}>{PAID_BY_LABEL[t]}</option>)}
              </select>

              {payerDirectory ? (
                <CreateOrSelect
                  adapter={payerDirectory}
                  value={paidById}
                  valueLabel={paidByLabel}
                  placeholder={`Which ${paidByType}?`}
                  onChange={(option) => {
                    setPaidById(option?.id ?? null);
                    setPaidByLabel(option?.label ?? null);
                  }}
                />
              ) : (
                <div className="flex items-center px-1 text-xs text-muted-foreground">
                  {paidByType === "company" ? "No reimbursement needed." : "Tracked by type - no directory yet."}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={reimbursable}
                onChange={(e) => setReimbursableOverride(e.target.checked)}
              />
              Reimbursable
              {expense?.reimbursementStatus === "reimbursed" && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Already reimbursed</span>
              )}
            </label>
          </fieldset>

          {/* Agent commission allocation */}
          {expenseType === "agent_commission" && projectFinancials && (
            <div className="space-y-3">
              <fieldset className="space-y-2 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-medium text-foreground">Select Agents</legend>
                <p className="text-xs text-muted-foreground">
                  Choose one or more agents to allocate commission to. Commission is split equally among all selected agents.
                </p>
                <AgentMultiSelect
                  adapter={agentDir}
                  selectedAgents={selectedAgents}
                  onAddAgent={(agent) => {
                    setSelectedAgents([...selectedAgents, agent]);
                  }}
                  onRemoveAgent={(agentId) => {
                    setSelectedAgents(selectedAgents.filter((a) => a.id !== agentId));
                  }}
                />
              </fieldset>

              <fieldset className="space-y-2 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-medium text-foreground">Commission Percentage</legend>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={commissionPercent === 40}
                      onChange={() => setCommissionPercent(40)}
                    />
                    <span className="text-sm text-foreground">40% Agent / 60% Company</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={commissionPercent === 60}
                      onChange={() => setCommissionPercent(60)}
                    />
                    <span className="text-sm text-foreground">60% Agent / 40% Company</span>
                  </label>
                </div>
              </fieldset>

              {/* Commission preview */}
              {selectedAgents.length > 0 && commissionPercent && (
                <AgentCommissionPreview
                  projectRevenue={projectFinancials.revisedTotal}
                  otherExpenses={projectFinancials.totalExpenses}
                  selectedAgents={selectedAgents}
                  commissionPercent={commissionPercent}
                  onRemoveAgent={(agentId) => {
                    setSelectedAgents(selectedAgents.filter((a) => a.id !== agentId));
                  }}
                />
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
            Paid to the payee
            <span className="text-xs text-muted-foreground">(uncheck for a bill not yet settled)</span>
          </label>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Notes</label>
            <textarea
              value={notes} rows={2}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (expenseType !== "agent_commission" && parsedAmount <= 0)}
              className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Record expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
