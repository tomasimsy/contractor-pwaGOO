import { supabase } from "@/lib/supabase/client";
import { computePayoutStatus } from "@/lib/queries/expenses";
import type { PayoutStatusValue } from "@/lib/types";

export type SubcontractorAssignmentDetail = {
  assignmentId: string; // estimate_subcontractors.id
  estimateId: string;
  estimateNumber: string | null;
  projectTitle: string;
  assignedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: PayoutStatusValue;
  notes: string | null;
};

export type SubcontractorPaymentDetail = {
  id: string;
  assignmentId: string;
  estimateId: string;
  projectTitle: string;
  amount: number;
  paymentDate: string | null;
  paymentMethod: string | null;
  notes: string | null;
};

export type SubcontractorDetail = {
  assignments: SubcontractorAssignmentDetail[];
  payments: SubcontractorPaymentDetail[];
  totals: {
    totalAssigned: number;
    totalPaid: number;
    totalRemaining: number;
  };
};

/**
 * Every project a subcontractor is assigned to, plus every payment
 * logged against them — for the expandable detail section on the
 * Subcontractors page. Reads `estimate_subcontractors` and
 * `subcontractor_payments` directly (the same tables
 * SubcontractorAssignmentsCard/usePayoutActions on the Expense page
 * already use) and reuses computePayoutStatus for the remaining-owed
 * math, so this can't drift from the Expense page's own numbers.
 * Fetched fresh on expand — no separate cache to invalidate when a
 * payment or assignment changes elsewhere.
 */
export async function getSubcontractorDetail(
  subcontractorId: string,
  companyId: string
): Promise<SubcontractorDetail> {
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("estimate_subcontractors")
    .select("id, estimate_id, amount, notes, estimates(estimate_number, title)")
    .eq("subcontractor_id", subcontractorId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (assignmentError) throw assignmentError;

  const assignmentIds = (assignmentRows ?? []).map((a: any) => a.id);
  let paymentRows: any[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from("subcontractor_payments")
      .select("id, estimate_subcontractor_id, estimate_id, amount, payment_date, payment_method, notes")
      .in("estimate_subcontractor_id", assignmentIds)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });
    if (error) throw error;
    paymentRows = data ?? [];
  }

  const paidByAssignment = new Map<string, number>();
  for (const p of paymentRows) {
    paidByAssignment.set(p.estimate_subcontractor_id, (paidByAssignment.get(p.estimate_subcontractor_id) ?? 0) + p.amount);
  }

  const projectTitleByAssignment = new Map<string, string>();
  const assignments: SubcontractorAssignmentDetail[] = (assignmentRows ?? []).map((a: any) => {
    const paidAmount = paidByAssignment.get(a.id) ?? 0;
    const { remainingAmount, status } = computePayoutStatus(a.amount ?? 0, paidAmount);
    const projectTitle = a.estimates?.title || "Untitled Estimate";
    projectTitleByAssignment.set(a.id, projectTitle);
    return {
      assignmentId: a.id,
      estimateId: a.estimate_id,
      estimateNumber: a.estimates?.estimate_number ?? null,
      projectTitle,
      assignedAmount: a.amount ?? 0,
      paidAmount,
      remainingAmount,
      status,
      notes: a.notes ?? null,
    };
  });

  const payments: SubcontractorPaymentDetail[] = paymentRows.map((p) => ({
    id: p.id,
    assignmentId: p.estimate_subcontractor_id,
    estimateId: p.estimate_id,
    projectTitle: projectTitleByAssignment.get(p.estimate_subcontractor_id) ?? "Untitled Estimate",
    amount: p.amount,
    paymentDate: p.payment_date,
    paymentMethod: p.payment_method,
    notes: p.notes,
  }));

  const totalAssigned = assignments.reduce((sum, a) => sum + a.assignedAmount, 0);
  const totalPaid = assignments.reduce((sum, a) => sum + a.paidAmount, 0);
  const totalRemaining = assignments.reduce((sum, a) => sum + a.remainingAmount, 0);

  return { assignments, payments, totals: { totalAssigned, totalPaid, totalRemaining } };
}
