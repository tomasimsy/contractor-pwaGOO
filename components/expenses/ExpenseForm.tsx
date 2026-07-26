"use client";

/**
 * Create an expense. Category, vendor, and "who paid" are just input
 * fields — the only place any of this becomes money is
 * ExpenseService.create (and, underneath it, the ledger). This
 * component doesn't know that "paid by agent" produces a second ledger
 * row (the reimbursement liability); it only knows to pass
 * paidByAgentId through when that toggle is on.
 */
import { useState } from "react";
import { useExpenses } from "../../lib/hooks/useExpenses";
import type { ExpenseCategory } from "../../lib/services";

const CATEGORIES: ExpenseCategory[] = ["material", "labor", "other"];

export function ExpenseForm({
  companyId,
  projectId,
  agents,
}: {
  companyId: string;
  projectId: string;
  agents: Array<{ id: string; name: string }>;
}) {
  const { create, error } = useExpenses(companyId, projectId);
  const [category, setCategory] = useState<ExpenseCategory>("material");
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState("");
  const [paidBy, setPaidBy] = useState<"company" | "agent">("company");
  const [agentId, setAgentId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-3 max-w-md">
      <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Paid by</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={paidBy === "company"} onChange={() => setPaidBy("company")} />
          Company
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={paidBy === "agent"} onChange={() => setPaidBy("agent")} />
          Agent (creates a reimbursement owed to them)
        </label>
        {paidBy === "agent" && (
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Select agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </fieldset>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="button"
        disabled={saving || amount <= 0 || (paidBy === "agent" && !agentId)}
        onClick={async () => {
          setSaving(true);
          try {
            await create({
              category,
              amount,
              vendor,
              expenseDate: new Date().toISOString().slice(0, 10),
              paidByAgentId: paidBy === "agent" ? agentId : null,
            });
            setAmount(0);
            setVendor("");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving..." : "Add expense"}
      </button>
    </div>
  );
}
