"use client";

/**
 * Record / edit a project expense – redesigned for speed.
 *
 * - Sticky footer: Submit / Cancel buttons always visible
 * - Compact 2‑column grid layout
 * - Pill‑style type selection (General tab)
 * - Pill‑style agent selection (Agent tab)
 * - Agent commission amount is manually adjustable (defaults to calculated split)
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { X, Check, Trash2 } from "lucide-react";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { AgentCommissionPreview } from "./AgentCommissionPreview";
import { createAgentDirectory, createSubcontractorDirectory, createVendorDirectory, createCompanyUserDirectory } from "./directories";
import { PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
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
  type EstimateFinancials,
} from "@/lib/services";

/** Which directory a given expense type should offer. */
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

const GENERAL_EXPENSE_TYPES = EXPENSE_TYPES.filter(
  (t) => t !== "subcontractor" && t !== "agent_commission"
);

type TabId = "general" | "subcontractor" | "agent";

export function ExpenseDialog({
  companyId,
  projectId,
  estimateId,
  expense,
  onClose,
  onSubmit,
  onDelete,
}: {
  companyId: string;
  projectId: string | null;
  estimateId?: string | null;
  expense?: Expense | null;
  onClose: () => void;
  onSubmit: (input: Omit<ExpenseCreateInput, "companyId" | "projectId">) => Promise<boolean>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const { expenseService, financialEngine } = useServices();
  const { profile } = useAuth();
  const isEdit = !!expense;
  const formRef = useRef<HTMLFormElement>(null);

  const initialTab: TabId = expense
    ? expense.expenseType === "subcontractor"
      ? "subcontractor"
      : expense.expenseType === "agent_commission"
      ? "agent"
      : "general"
    : "general";

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [expenseType, setExpenseType] = useState<ExpenseType>(expense?.expenseType ?? "materials");
  const [generalType, setGeneralType] = useState<ExpenseType>(
    expense && expense.expenseType !== "subcontractor" && expense.expenseType !== "agent_commission"
      ? expense.expenseType
      : "materials"
  );

  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(expense?.description ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [payeeId, setPayeeId] = useState<string | null>(expense?.payeeId ?? null);

  const [paidByType, setPaidByType] = useState<PaidByType>(expense?.paidByType ?? "company");
  // Editing keeps the stored payer. A NEW expense defaults to the
  // signed-in user: they are overwhelmingly the person who fronted it,
  // and leaving it null means the reimbursement has no owner —
  // ExpenseService.listPendingReimbursements filters on `paid_by_id`,
  // so a null one can never be attributed to anybody.
  const [paidById, setPaidById] = useState<string | null>(expense?.paidById ?? profile?.userId ?? null);
  const [paidByLabel, setPaidByLabel] = useState<string | null>(
    expense ? null : profile?.fullName || null
  );

  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "");
  const [isPaid, setIsPaid] = useState(expense?.isPaid ?? true);
  const [reimbursableOverride, setReimbursableOverride] = useState<boolean | null>(
    expense ? expense.reimbursable : null
  );

  // Agent commission fields
  const [selectedAgents, setSelectedAgents] = useState<Array<{ id: string; label: string }>>([]);
  const [commissionPercent, setCommissionPercent] = useState<30 | 70 | null>(null);
  const [estimateFinancials, setEstimateFinancials] = useState<EstimateFinancials | null>(null);
  const [allAgents, setAllAgents] = useState<Array<{ id: string; label: string }>>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Manual override for per‑agent commission amount
  const [manualPerAgentAmount, setManualPerAgentAmount] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commissionEstimateId = estimateId ?? expense?.estimateId ?? null;

  const subcontractorDir = useMemo(() => createSubcontractorDirectory(supabase, companyId), [companyId]);
  const agentDir = useMemo(() => createAgentDirectory(supabase, companyId), [companyId]);
  /** Company users — the people an "employee paid" expense is owed to.
   * See createCompanyUserDirectory for why this is an RPC, not a
   * `profiles` read. */
  const companyUserDir = useMemo(() => createCompanyUserDirectory(supabase), []);
  const vendorDir = useMemo(() => createVendorDirectory(expenseService, companyId), [expenseService, companyId]);

  const payeeKind = PAYEE_KIND[expenseType];
  const reimbursable = reimbursableOverride ?? paidByType !== "company";

  const payeeDirectory = payeeKind === "subcontractor" ? subcontractorDir : payeeKind === "agent" ? agentDir : vendorDir;
  const payerDirectory =
    paidByType === "agent"
      ? agentDir
      : paidByType === "subcontractor"
      ? subcontractorDir
      : paidByType === "employee"
      ? companyUserDir
      : null;

  const parsedAmount = parseFloat(amount) || 0;

  // Fetch estimate financials for commission
  useEffect(() => {
    if (commissionEstimateId && expenseType === "agent_commission" && !estimateFinancials) {
      financialEngine.getEstimateFinancials(commissionEstimateId).then(setEstimateFinancials).catch(console.error);
    }
  }, [commissionEstimateId, expenseType, estimateFinancials, financialEngine]);

  // Load all agents when the agent tab becomes active
  useEffect(() => {
    if (activeTab === "agent" && allAgents.length === 0 && !agentsLoading) {
      setAgentsLoading(true);
      agentDir
        .search("")
        .then((results) => {
          // DirectoryOption.id is nullable (vendors are free text and
          // carry none); a real agent always has one, so drop any that
          // don't rather than widening the state type.
          setAllAgents(results.flatMap((r) => (r.id ? [{ id: r.id, label: r.label }] : [])));
          setAgentsLoading(false);
        })
        .catch(() => setAgentsLoading(false));
    }
  }, [activeTab, agentDir, allAgents.length, agentsLoading]);

  const commissionSplit = financialEngine.calculateAgentCommissionSplit(
    estimateFinancials?.netProfit ?? 0,
    commissionPercent,
    selectedAgents.length
  );

  // When the calculated per‑agent amount changes, update the manual input
  // (but only if the user hasn't manually edited it yet – we track with a flag)
  const [isManualEdit, setIsManualEdit] = useState(false);

  useEffect(() => {
    if (!isManualEdit && commissionSplit.perAgentCommission > 0) {
      setManualPerAgentAmount(commissionSplit.perAgentCommission.toFixed(2));
    }
  }, [commissionSplit.perAgentCommission, isManualEdit]);

  // If selectedAgents or commissionPercent changes, reset the manual edit flag
  // so that the input updates to the new calculated value.
  useEffect(() => {
    setIsManualEdit(false);
  }, [selectedAgents.length, commissionPercent]);

  // Parse manual amount for submission & preview
  const parsedManualAmount = parseFloat(manualPerAgentAmount) || 0;
  const effectivePerAgentAmount = parsedManualAmount > 0 ? parsedManualAmount : commissionSplit.perAgentCommission;

  // Re‑calculate split with the effective amount (for preview only – the actual submission uses effectivePerAgentAmount)
  const effectiveTotalCommission = effectivePerAgentAmount * selectedAgents.length;
  const effectiveRemainingProfit = (estimateFinancials?.netProfit ?? 0) - effectiveTotalCommission;

  function selectPayee(option: DirectoryOption | null) {
    setPayeeId(option?.id ?? null);
    setVendor(option?.label ?? "");
  }

  function switchTab(tab: TabId) {
    if (tab === activeTab) return;
    let newType: ExpenseType;
    if (tab === "general") {
      newType = generalType;
    } else if (tab === "subcontractor") {
      newType = "subcontractor";
    } else {
      newType = "agent_commission";
    }
    if (PAYEE_KIND[newType] !== PAYEE_KIND[expenseType]) {
      setPayeeId(null);
      setVendor("");
    }
    setExpenseType(newType);
    setActiveTab(tab);
  }

  useEffect(() => {
    if (activeTab === "general") {
      if (PAYEE_KIND[generalType] !== PAYEE_KIND[expenseType]) {
        setPayeeId(null);
        setVendor("");
      }
      setExpenseType(generalType);
    }
  }, [generalType, activeTab, expenseType]);

  function toggleAgent(agent: { id: string; label: string }) {
    const already = selectedAgents.some((a) => a.id === agent.id);
    if (already) {
      setSelectedAgents(selectedAgents.filter((a) => a.id !== agent.id));
    } else {
      setSelectedAgents([...selectedAgents, agent]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (expenseType === "agent_commission") {
      if (selectedAgents.length === 0) {
        setError("Select at least one agent.");
        return;
      }
      if (!commissionPercent) {
        setError("Select a commission percentage.");
        return;
      }
      if (!estimateFinancials) {
        setError(
          commissionEstimateId
            ? "Unable to calculate remaining profit."
            : "Agent commission must be recorded against an estimate."
        );
        return;
      }

      // Validate manual amount (must be > 0)
      if (parsedManualAmount <= 0) {
        setError("Enter a commission amount per agent greater than zero.");
        return;
      }

      // Warn if total commission exceeds remaining profit, but allow submission
      const totalCommission = parsedManualAmount * selectedAgents.length;
      if (totalCommission > (estimateFinancials.netProfit ?? 0)) {
        if (!window.confirm(`Total commission ($${totalCommission.toFixed(2)}) exceeds remaining profit ($${estimateFinancials.netProfit?.toFixed(2)}). Continue anyway?`)) {
          return;
        }
      }
    }

    if (parsedAmount <= 0 && expenseType !== "agent_commission") {
      setError("Enter an amount greater than zero.");
      return;
    }

    if ((paidByType === "agent" || paidByType === "subcontractor") && !paidById) {
      setError(`Please select which ${paidByType} paid this expense.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (expenseType === "agent_commission" && estimateFinancials && commissionPercent && selectedAgents.length > 0) {
        // Use the effective per‑agent amount (manual or calculated)
        const commissionPerAgent = effectivePerAgentAmount;

        let allOk = true;
        for (const agent of selectedAgents) {
          const ok = await onSubmit({
            estimateId: commissionEstimateId,
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
        if (!allOk) setError("Could not save all commissions.");
        else onClose();
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

  async function handleDelete() {
    if (!expense || !onDelete) return;
    if (!window.confirm(`Delete this expense?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(expense.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this expense.");
      setDeleting(false);
    }
  }

  function money(n: number) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  const isAgentTab = activeTab === "agent";
  const isSubTab = activeTab === "subcontractor";
  const isGeneralTab = activeTab === "general";
  const showAmount = expenseType !== "agent_commission";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex h-[95vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header – fixed */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? "Edit Expense" : "Record Expense"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs – fixed */}
        <div className="flex shrink-0 gap-0.5 border-b border-border px-4 pt-2 text-xs">
          {(["general", "subcontractor", "agent"] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "general" ? "General" : tab === "subcontractor" ? "Subcontractor" : "Agent"}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="rounded bg-danger/10 px-3 py-1.5 text-sm text-danger">{error}</div>
            )}

            {/* ---- GENERAL TAB ---- */}
            {isGeneralTab && (
              <>
                <div>
                  <label className="block text-xs font-medium text-foreground">Type *</label>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {GENERAL_EXPENSE_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGeneralType(type)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          generalType === type
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {EXPENSE_TYPE_LABEL[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground">Vendor / payee</label>
                  <CreateOrSelect
                    adapter={payeeDirectory}
                    value={payeeId}
                    valueLabel={vendor || null}
                    onChange={selectPayee}
                  />
                </div>
              </>
            )}

            {/* ---- SUBCONTRACTOR TAB ---- */}
            {isSubTab && (
              <div>
                <label className="block text-xs font-medium text-foreground">Subcontractor *</label>
                <CreateOrSelect
                  adapter={subcontractorDir}
                  value={payeeId}
                  valueLabel={vendor || null}
                  onChange={selectPayee}
                />
              </div>
            )}

            {/* ---- AGENT TAB ---- */}
            {isAgentTab && (
              <div className="space-y-3">
                {estimateFinancials ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-foreground">Select Agents</label>
                      <p className="text-[10px] text-muted-foreground">
                        Click to toggle. Commission split equally.
                      </p>

                      {selectedAgents.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {selectedAgents.map((agent) => (
                            <span
                              key={agent.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {agent.label}
                              <button
                                type="button"
                                onClick={() => toggleAgent(agent)}
                                className="rounded-full p-0.5 hover:bg-primary/20"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {agentsLoading ? (
                        <div className="py-2 text-sm text-muted-foreground">Loading agents…</div>
                      ) : allAgents.length === 0 ? (
                        <div className="py-2 text-sm text-muted-foreground">No agents found.</div>
                      ) : (
                        <div className="mt-1 grid grid-cols-2 gap-1.5">
                          {allAgents.map((agent) => {
                            const isSelected = selectedAgents.some((a) => a.id === agent.id);
                            return (
                              <button
                                key={agent.id}
                                type="button"
                                onClick={() => toggleAgent(agent)}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}
                              >
                                {agent.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground">Commission Split</label>
                      <div className="mt-1 flex gap-3">
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            checked={commissionPercent === 30}
                            onChange={() => setCommissionPercent(30)}
                          />
                          30% Agent
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            checked={commissionPercent === 70}
                            onChange={() => setCommissionPercent(70)}
                          />
                          70% Agent
                        </label>
                      </div>
                    </div>

                    {/* Manual amount per agent */}
                    <div>
                      <label className="block text-xs font-medium text-foreground">
                        Amount per agent
                        <span className="ml-1 font-normal text-muted-foreground">
                          (calculated: {money(commissionSplit.perAgentCommission)})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualPerAgentAmount}
                        onChange={(e) => {
                          setManualPerAgentAmount(e.target.value);
                          setIsManualEdit(true);
                        }}
                        className="mt-1 w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
                        placeholder="Enter amount per agent"
                      />
                    </div>

                    {selectedAgents.length > 0 && commissionPercent && (
                      <AgentCommissionPreview
                        estimateRevenue={estimateFinancials.revisedTotal}
                        estimateExpenses={estimateFinancials.totalExpenses}
                        split={{
                          ...commissionSplit,
                          perAgentCommission: effectivePerAgentAmount,
                          totalCommission: effectiveTotalCommission,
                          remainingProfit: effectiveRemainingProfit,
                          exceedsRemainingProfit: effectiveTotalCommission > (estimateFinancials.netProfit ?? 0),
                        }}
                        selectedAgents={selectedAgents}
                        commissionPercent={commissionPercent}
                        onRemoveAgent={(id) =>
                          setSelectedAgents(selectedAgents.filter((a) => a.id !== id))
                        }
                      />
                    )}
                  </>
                ) : (
                  <div className="rounded bg-muted/30 p-3 text-sm text-muted-foreground">
                    Loading estimate data…
                  </div>
                )}
              </div>
            )}

            {/* ---- AMOUNT (hidden for agent) ---- */}
            {showAmount && (
              <div>
                <label className="block text-xs font-medium text-foreground">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
                  placeholder="0.00"
                />
              </div>
            )}

            {/* ---- DATE + PAYMENT METHOD (2 cols) ---- */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground">Date *</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">Payment method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
                >
                  <option value="">-</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ---- PAID BY ---- */}
            <div className="rounded border border-border p-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Paid by</label>
                <span className="text-[10px] text-muted-foreground">
                  Who fronted the money
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  value={paidByType}
                  onChange={(e) => {
                    const next = e.target.value as PaidByType;
                    setPaidByType(next);
                    // Switching to "employee" re-applies the signed-in
                    // user; any other type needs its own pick, and
                    // "company" has no person at all.
                    const isSelf = next === "employee" && !expense;
                    setPaidById(isSelf ? profile?.userId ?? null : null);
                    setPaidByLabel(isSelf ? profile?.fullName || null : null);
                    setReimbursableOverride(null);
                  }}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
                >
                  {PAID_BY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PAID_BY_LABEL[t]}
                    </option>
                  ))}
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
                    {paidByType === "company" ? "No reimbursement" : "No directory"}
                  </div>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={reimbursable}
                    onChange={(e) => setReimbursableOverride(e.target.checked)}
                  />
                  Reimbursable
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
                  Paid
                </label>
                {expense?.reimbursementStatus === "reimbursed" && (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                    Reimbursed
                  </span>
                )}
              </div>
            </div>

            {/* ---- DESCRIPTION + NOTES (compact) ---- */}
            <div>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
              />
            </div>
            <div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
              />
            </div>

            {/* Invisible spacer to ensure scroll doesn't hide content behind footer */}
            <div className="h-2" />
          </form>
        </div>

        {/* ---- STICKY FOOTER ---- */}
        <div className="shrink-0 border-t border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-input px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }}
                disabled={saving || (showAmount && parsedAmount <= 0)}
                className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : isEdit ? "Save" : "Record"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}