"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry, PendingPayout, ProjectBundle } from "@/lib/types";
import {
  addEntry,
  assignAgentToProject,
  assignSubcontractorToProject,
  computePendingPayouts,
  removeAssignment,
  updateAssignment,
} from "@/lib/queries/expenses";

// Shared assign/edit/remove/pay/invoice logic for both the Subcontractor
// Assignments and Agent Commission cards (and the Pending Payouts card) —
// one hook instead of duplicating the same mutations three times now that
// the single combined Payouts panel has been split into role-specific
// cards for the card-based layout.
export function usePayoutActions(
  bundle: ProjectBundle,
  ledger: LedgerEntry[],
  onDelete: (entry: LedgerEntry) => void,
  onRefresh: () => Promise<void>
) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [payoutModalTarget, setPayoutModalTarget] = useState<PendingPayout | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const companyId = bundle.project.company_id;
  const projectLabel = bundle.project.title || bundle.project.estimate_number || "This project";
  const payouts = computePendingPayouts(bundle, true); // include settled ones too, for full visibility here

  const subIdByPaymentId = new Map(bundle.subcontractorPayments.map((p) => [p.id, p.estimate_subcontractor_id]));
  // Same estimate_agent_id-with-agent_id-fallback matching as
  // computePendingPayouts (lib/queries/expenses.ts) — without this
  // fallback, an agent payment row saved before estimate_agent_id was
  // set (or by any insert path that omits it) is still counted in
  // payout totals/paid-amount but invisible in "View payment history",
  // so it could never be selected for delete from this UI even though
  // it kept contributing to every total elsewhere.
  const agentAssignmentByPaymentId = new Map(
    bundle.agentPayments.map((p) => [
      p.id,
      p.estimate_agent_id ?? bundle.assignedAgents.find((a) => a.agentId === p.agent_id)?.estimateAgentId ?? null,
    ])
  );

  function paymentsFor(payout: PendingPayout): LedgerEntry[] {
    if (payout.role === "subcontractor") {
      return ledger.filter((e) => e.source === "subcontractor_payment" && subIdByPaymentId.get(e.id) === payout.assignmentId);
    }
    return ledger.filter((e) => e.source === "agent_payment" && agentAssignmentByPaymentId.get(e.id) === payout.assignmentId);
  }

  async function handleAssignSubcontractor(subcontractorId: string, name: string, trade: string | null, amount: number, notes: string | null) {
    await assignSubcontractorToProject(bundle.project.id, companyId, subcontractorId, name, trade, amount, notes);
    toast.success(`${name} assigned — ${formatCurrency(amount)}`);
    await onRefresh();
  }

  async function handleAssignAgent(agentId: string, name: string, amount: number, notes: string | null) {
    await assignAgentToProject(bundle.project.id, companyId, agentId, name, amount, notes);
    toast.success(`${name} assigned — ${formatCurrency(amount)}`);
    await onRefresh();
  }

  function startEdit(payout: PendingPayout) {
    setEditingId(payout.assignmentId);
    setEditAmount(String(payout.assignedAmount));
    setEditNotes(payout.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(payout: PendingPayout) {
    const table = payout.role === "subcontractor" ? "estimate_subcontractors" : "estimate_agents";
    try {
      await updateAssignment(table, payout.assignmentId, companyId, {
        amount: Number(editAmount) || 0,
        notes: editNotes.trim() || null,
      });
      toast.success("Payout updated.");
      setEditingId(null);
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't update.");
    }
  }

  async function handleRemove(payout: PendingPayout) {
    if (!confirm(`Remove ${payout.name} from this project? Payment history is kept.`)) return;
    const table = payout.role === "subcontractor" ? "estimate_subcontractors" : "estimate_agents";
    try {
      await removeAssignment(table, payout.assignmentId, companyId);
      toast.success("Assignment removed.");
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove.");
    }
  }

  async function handlePay(amount: number) {
    if (!payoutModalTarget) return;
    const payout = payoutModalTarget;
    try {
      if (payout.role === "subcontractor") {
        await addEntry({
          kind: "subcontractor_payment",
          estimateId: bundle.project.id,
          companyId,
          estimateSubcontractorId: payout.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      } else {
        await addEntry({
          kind: "agent_payment",
          estimateId: bundle.project.id,
          companyId,
          agentId: payout.personId,
          estimateAgentId: payout.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      }
      toast.success(`Paid ${payout.name} ${formatCurrency(amount)}`);
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't record payment.");
      throw err;
    }
  }

  // Same localStorage-session -> Bearer-token pattern the estimate/invoice
  // PDF buttons already use — a plain link would hit the route with no
  // session and 404.
  async function openInvoice(payout: PendingPayout) {
    const { data: { session } } = await supabase.auth.getSession();
    window.open(`/api/subcontractor-payouts/${payout.assignmentId}/pdf?token=${session?.access_token ?? ""}`, "_blank");
  }

  return {
    payouts,
    projectLabel,
    assignOpen,
    setAssignOpen,
    payoutModalTarget,
    setPayoutModalTarget,
    editingId,
    editAmount,
    setEditAmount,
    editNotes,
    setEditNotes,
    expandedId,
    setExpandedId,
    paymentsFor,
    handleAssignSubcontractor,
    handleAssignAgent,
    startEdit,
    cancelEdit,
    saveEdit,
    handleRemove,
    handlePay,
    openInvoice,
  };
}

export type PayoutActions = ReturnType<typeof usePayoutActions>;
