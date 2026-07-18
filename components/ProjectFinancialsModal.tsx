"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { X, Trash2, Edit2, Check, DollarSign, Users, Plus, Receipt, Eye } from "lucide-react";
import ChangeOrderTab from "@/components/changeOrder/ChangeOrderTab";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { splitEvenly, splitProfit, type CompanyPercentage } from "@/lib/utils/profitSplit";
import { softDeleteAgentPayment, softDeleteExpense, softDeleteSubcontractorPayment } from "@/lib/queries/expenses";

type Subcontractor = {
  id: string;
  name: string;
  company_name: string;
  phone: string;
  email: string;
};

type SubcontractorPayment = {
  id: string;
  amount: number;
  payment_method: string;
  created_at: string;
};

type AssignedSub = {
  id: string;
  amount: number;
  paid_amount: number;
  notes: string;
  subcontractor_id: string;
  subcontractors?: Subcontractor;
  payments?: SubcontractorPayment[];
};

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  notes: string;
};

type Agent = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type AgentPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
  payment_type?: 'commission' | 'reimbursement';
  expense_id?: string;
};

type AssignedAgent = {
  id: string;
  amount: number;
  paid_amount: number;
  reimbursement_amount: number;
  notes: string;
  agent_id: string;
  agents?: Agent;
  payments?: AgentPayment[];
};

interface ProjectFinancialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateId: string;
  estimateTotal: number;
  onRefresh: () => void;
}

const EXPENSE_CATEGORIES = [
  { value: "materials", label: "Materials", icon: "🔨" },
  { value: "equipment", label: "Equipment", icon: "🔧" },
  { value: "permits", label: "Permits", icon: "📋" },
  { value: "travel", label: "Travel", icon: "🚗" },
  { value: "labor", label: "Labor", icon: "👷" },
  { value: "rental", label: "Rental", icon: "🏗️" },
  { value: "other", label: "Other", icon: "📦" },
];

export default function ProjectFinancialsModal({
  isOpen,
  onClose,
  estimateId,
  estimateTotal,
  onRefresh,
}: ProjectFinancialsModalProps) {
  const [activeTab, setActiveTab] = useState<"subcontractors" | "expenses" | "agents" | "changeorders">("subcontractors");
  const [companyPercentage, setCompanyPercentage] = useState<CompanyPercentage>(30);
  const [newSub, setNewSub] = useState({ name: "", company_name: "", phone: "", email: "" });
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "" });
  
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [assignedSubs, setAssignedSubs] = useState<AssignedSub[]>([]);
  const [showNewSubForm, setShowNewSubForm] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [subAmount, setSubAmount] = useState<number | null>(null);
  const [subNotes, setSubNotes] = useState("");
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubAmount, setEditSubAmount] = useState(0);
  const [showSubPaymentModal, setShowSubPaymentModal] = useState(false);
  const [selectedSubForPayment, setSelectedSubForPayment] = useState<AssignedSub | null>(null);
  const [subPaymentAmount, setSubPaymentAmount] = useState(0);
  const [subPaymentMethod, setSubPaymentMethod] = useState("cash");
  const [showSubPaymentHistory, setShowSubPaymentHistory] = useState(false);
  const [selectedSubForHistory, setSelectedSubForHistory] = useState<AssignedSub | null>(null);
  const [editingSubPayment, setEditingSubPayment] = useState<string | null>(null);
  const [editSubPaymentAmount, setEditSubPaymentAmount] = useState(0);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "materials",
    description: "",
    amount: 0,
    expense_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<AssignedAgent[]>([]);
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editAgentAmount, setEditAgentAmount] = useState(0);
  const [showAgentPaymentModal, setShowAgentPaymentModal] = useState(false);
  const [selectedAgentForPayment, setSelectedAgentForPayment] = useState<AssignedAgent | null>(null);
  const [agentPaymentAmount, setAgentPaymentAmount] = useState(0);
  const [agentPaymentMethod, setAgentPaymentMethod] = useState("bank_transfer");
  const [showAgentPaymentHistory, setShowAgentPaymentHistory] = useState(false);
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState<AssignedAgent | null>(null);
  const [editingAgentPayment, setEditingAgentPayment] = useState<string | null>(null);
  const [editAgentPaymentAmount, setEditAgentPaymentAmount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ---- company_id state ----
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Fetch company_id once when modal opens
  useEffect(() => {
    const fetchCompany = async () => {
      const cid = await getCompanyId();
      setCompanyId(cid);
    };
    if (isOpen) fetchCompany();
  }, [isOpen]);

  // Load data only when companyId is available
  useEffect(() => {
    if (isOpen && companyId) {
      loadAllData();
    }
  }, [isOpen, companyId]);

  // Floored at paid-to-date per sub (Math.max) — a subcontractor paid
  // via the Expense page's older flow can have amount=0 with real
  // payments already logged against them; profit must reflect the real
  // committed cost either way. Same reasoning as
  // getEffectiveSubcontractorCommitted in lib/queries/expenses.ts.
  const totalSubAssigned = assignedSubs.reduce((sum, s) => sum + Math.max(s.amount || 0, s.paid_amount || 0), 0);
  const totalSubPaid = assignedSubs.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
  const totalSubOwed = totalSubAssigned - totalSubPaid;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  // Committed (assigned), not paid-to-date — a subcontractor assigned at
  // $5,000 with only $2,000 paid so far still reduces profit by $5,000,
  // the same "committed cost" semantics as summarizeFinancials() on the
  // Expense page (lib/queries/expenses.ts), so profit matches everywhere
  // regardless of how much has actually been paid out yet.
  const afterSubcontractorAndExpenses = estimateTotal - totalSubAssigned - totalExpenses;
  const { companyAmount, agentAmount: remainingForAgents, agentPercentage } = splitProfit(
    afterSubcontractorAndExpenses,
    companyPercentage
  );
  // Total owed to agents: commission + reimbursements they're owed back
  const totalAgentAssigned = assignedAgents.reduce((sum, a) => sum + ((a.amount || 0) + (a.reimbursement_amount || 0)), 0);
  // Total paid to agents: only commission payments count as paid
  const totalAgentPaid = assignedAgents.reduce((sum, a) => sum + (a.paid_amount || 0), 0);
  const remainingToDistribute = remainingForAgents - totalAgentAssigned;

  async function loadAllData() {
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setLoading(true);
    try {
      // Subcontractors (company-scoped)
      const { data: subs } = await supabase
        .from("subcontractors")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (subs) setSubcontractors(subs);

      // Assigned subcontractors
      const { data: assigned } = await supabase
        .from("estimate_subcontractors")
        .select("*, subcontractors(*)")
        .eq("estimate_id", estimateId)
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (assigned) {
        const subsWithPayments = await Promise.all(
          assigned.map(async (sub) => {
            const { data: payments } = await supabase
              .from("subcontractor_payments")
              .select("*")
              .eq("estimate_subcontractor_id", sub.id)
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false });
            const paidAmount = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
            return { ...sub, paid_amount: paidAmount, payments: payments || [] };
          })
        );
        setAssignedSubs(subsWithPayments);
      }

      // Expenses
      const { data: expenseData } = await supabase
        .from("estimate_expenses")
        .select("*")
        .eq("estimate_id", estimateId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("expense_date", { ascending: false });
      if (expenseData) setExpenses(expenseData);

      // Agents (company-scoped)
      const { data: ags } = await supabase
        .from("agents")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (ags) setAgents(ags);

      // Assigned agents
      const { data: assignedAgentsData } = await supabase
        .from("estimate_agents")
        .select("*, agents(*)")
        .eq("estimate_id", estimateId)
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (assignedAgentsData) {
        const agentsWithPayments = await Promise.all(
          assignedAgentsData.map(async (agent) => {
            const { data: payments } = await supabase
              .from("agent_payments")
              .select("*")
              .eq("estimate_id", estimateId)
              .eq("agent_id", agent.agent_id)
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .order("payment_date", { ascending: false });
            // Only count commission payments as paid, not reimbursements
            const commissionPayments = payments?.filter(p => p.payment_type !== 'reimbursement') || [];
            const paidAmount = commissionPayments.reduce((sum, p) => sum + p.amount, 0);
            const reimbursementAmount = payments?.filter(p => p.payment_type === 'reimbursement').reduce((sum, p) => sum + p.amount, 0) || 0;
            return { ...agent, paid_amount: paidAmount, reimbursement_amount: reimbursementAmount, payments: payments || [] };
          })
        );
        setAssignedAgents(agentsWithPayments);
      }
    } catch (err) {
      alert("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function createSubcontractor() {
    if (!newSub.name.trim()) {
      alert("Name is required");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("subcontractors")
      .insert({
        name: newSub.name,
        company_name: newSub.company_name || null,
        phone: newSub.phone || null,
        email: newSub.email || null,
        company_id: companyId,
      })
      .select()
      .single();

    if (error) {
      alert("Error creating subcontractor");
    } else if (data) {
      setSubcontractors([data, ...subcontractors]);
      setSelectedSubId(data.id);
      setShowNewSubForm(false);
      setNewSub({ name: "", company_name: "", phone: "", email: "" });
      alert("Subcontractor created!");
    }
    setSaving(false);
  }

  async function assignSubcontractor() {
    if (!selectedSubId) {
      alert("Select a subcontractor");
      return;
    }
    if (assignedSubs.some((s) => s.subcontractor_id === selectedSubId)) {
      alert("Already assigned");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }

    const amountToSave = subAmount && subAmount > 0 ? subAmount : 0;

    const { data: newSub, error } = await supabase
      .from("estimate_subcontractors")
      .insert({
        estimate_id: estimateId,
        subcontractor_id: selectedSubId,
        amount: amountToSave,
        notes: subNotes || null,
        company_id: companyId,
      })
      .select()
      .single();

    if (error) {
      alert("Error assigning subcontractor");
    } else if (newSub) {
      if (amountToSave > 0) {
        await supabase.from("subcontractor_payments").insert({
          estimate_subcontractor_id: newSub.id,
          estimate_id: estimateId,
          amount: amountToSave,
          payment_method: "cash",
          company_id: companyId,
        });
      }
      await loadAllData();
      onRefresh();
      alert(amountToSave > 0 ? "Subcontractor assigned with payment!" : "Subcontractor assigned");
    }

    setSelectedSubId("");
    setSubAmount(null);
    setSubNotes("");
  }

  async function updateSubAmount(subId: string, newAmount: number) {
    if (newAmount < 0) return;
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("estimate_subcontractors")
      .update({ amount: newAmount })
      .eq("id", subId)
      .eq("company_id", companyId);
    if (error) {
      alert("Error updating amount");
    } else {
      await loadAllData();
      onRefresh();
    }
    setEditingSub(null);
    setSaving(false);
  }

  async function removeSubAssignment(subId: string) {
    if (!confirm("Remove this subcontractor? Their payment history will be kept but hidden.")) return;
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    // Payment rows are soft-deleted (auditable, undoable) — only the
    // assignment link itself is actually removed, since un-assigning a
    // subcontractor from a project is a structural change, not a
    // payment record.
    await supabase
      .from("subcontractor_payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("estimate_subcontractor_id", subId)
      .eq("company_id", companyId);
    await supabase
      .from("estimate_subcontractors")
      .delete()
      .eq("id", subId)
      .eq("company_id", companyId);
    await loadAllData();
    onRefresh();
    setSaving(false);
    alert("Subcontractor removed");
  }

  async function recordSubPayment() {
    if (!selectedSubForPayment || subPaymentAmount <= 0) {
      alert("Enter a valid amount");
      return;
    }
    const remainingOwed = (selectedSubForPayment.amount || 0) - (selectedSubForPayment.paid_amount || 0);
    if (subPaymentAmount > remainingOwed) {
      alert(`Cannot pay more than owed (${formatCurrency(remainingOwed)})`);
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("subcontractor_payments").insert({
      estimate_subcontractor_id: selectedSubForPayment.id,
      estimate_id: estimateId,
      amount: subPaymentAmount,
      payment_method: subPaymentMethod,
      company_id: companyId,
    });

    if (error) {
      alert("Error recording payment");
    } else {
      await loadAllData();
      onRefresh();
      alert(`Payment of ${formatCurrency(subPaymentAmount)} recorded!`);
    }
    setShowSubPaymentModal(false);
    setSubPaymentAmount(0);
    setSaving(false);
  }

  async function deleteSubPayment(paymentId: string, subAssignmentId: string) {
    if (!confirm("Delete this payment? This will increase the subcontractor's owed amount.")) return;
    setSaving(true);
    await softDeleteSubcontractorPayment(paymentId);
    await loadAllData();
    onRefresh();
    setSaving(false);
    alert("Payment deleted");
  }

  async function updateSubPayment(paymentId: string, newAmount: number, subAssignmentId: string, oldAmount: number) {
    if (newAmount < 0) {
      alert("Amount cannot be negative");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    await supabase
      .from("subcontractor_payments")
      .update({ amount: newAmount })
      .eq("id", paymentId)
      .eq("company_id", companyId);
    await loadAllData();
    onRefresh();
    setEditingSubPayment(null);
    setSaving(false);
    alert(`Payment updated from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}`);
  }

  async function addExpense() {
    if (expenseForm.amount <= 0) {
      alert("Enter an amount");
      return;
    }
    if (!expenseForm.description.trim()) {
      alert("Enter a description");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("estimate_expenses").insert({
      estimate_id: estimateId,
      category: expenseForm.category,
      description: expenseForm.description,
      amount: expenseForm.amount,
      expense_date: expenseForm.expense_date,
      notes: expenseForm.notes || null,
      company_id: companyId,
    });

    if (error) {
      alert("Error adding expense");
    } else {
      setExpenseForm({
        category: "materials",
        description: "",
        amount: 0,
        expense_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setShowExpenseForm(false);
      await loadAllData();
      onRefresh();
    }
    setSaving(false);
  }

  async function updateExpense(expenseId: string, newAmount: number, newDescription: string) {
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    await supabase
      .from("estimate_expenses")
      .update({ amount: newAmount, description: newDescription })
      .eq("id", expenseId)
      .eq("company_id", companyId);
    await loadAllData();
    onRefresh();
    setEditingExpense(null);
    setSaving(false);
  }

  async function deleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    setSaving(true);
    await softDeleteExpense(expenseId);
    await loadAllData();
    onRefresh();
    setSaving(false);
  }

  async function createAgent() {
    if (!newAgent.name.trim()) {
      alert("Name is required");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("agents")
      .insert({
        name: newAgent.name,
        email: newAgent.email || null,
        phone: newAgent.phone || null,
        company_id: companyId,
      })
      .select()
      .single();

    if (error) {
      alert("Error creating agent");
    } else if (data) {
      setAgents([data, ...agents]);
      setSelectedAgentId(data.id);
      setShowNewAgentForm(false);
      setNewAgent({ name: "", email: "", phone: "" });
      alert("Agent created!");
    }
    setSaving(false);
  }

  async function assignAgent() {
    if (!selectedAgentId) return;
    if (assignedAgents.some((a) => a.agent_id === selectedAgentId)) {
      alert("Agent already assigned");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("estimate_agents").insert({
      estimate_id: estimateId,
      agent_id: selectedAgentId,
      amount: 0,
      notes: agentNotes || null,
      company_id: companyId,
    });

    if (error) {
      alert("Error assigning agent");
    } else {
      await redistributeAgentEvenly();
      await loadAllData();
      onRefresh();
    }
    setSelectedAgentId("");
    setAgentNotes("");
    setSaving(false);
  }

  // Both buttons that used to redistribute independently had identical
  // bodies (just diverging in whether they refresh/alert afterward) —
  // consolidated onto the shared splitEvenly() so a rounding fix here
  // only has to happen once.
  async function redistributeAgentEvenly() {
    const count = assignedAgents.length;
    if (count === 0 || remainingForAgents <= 0) return;
    if (!companyId) {
      alert("Company not found");
      return;
    }
    const shares = splitEvenly(remainingForAgents, count);
    await Promise.all(
      assignedAgents.map((agent, i) =>
        supabase.from("estimate_agents").update({ amount: shares[i] }).eq("id", agent.id).eq("company_id", companyId)
      )
    );
  }

  async function redistributeByPercentage() {
    if (assignedAgents.length === 0 || remainingForAgents <= 0) return;
    const equalShare = remainingForAgents / assignedAgents.length;
    await redistributeAgentEvenly();
    await loadAllData();
    onRefresh();
    alert(`Distributed ${formatCurrency(remainingForAgents)} evenly among ${assignedAgents.length} agents (${formatCurrency(equalShare)} each)`);
  }

  async function updateAgentAmount(agentId: string, newAmount: number) {
    if (newAmount < 0) return;
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    await supabase
      .from("estimate_agents")
      .update({ amount: newAmount })
      .eq("id", agentId)
      .eq("company_id", companyId);
    await loadAllData();
    onRefresh();
    setEditingAgent(null);
    setSaving(false);
  }

  async function removeAgentAssignment(agentAssignId: string, agentId: string) {
    if (!confirm("Remove this agent? Their payment history will be kept but hidden.")) return;
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    // Same reasoning as removeSubAssignment: soft-delete the payment
    // records, hard-delete only the assignment link.
    await supabase
      .from("agent_payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("estimate_id", estimateId)
      .eq("agent_id", agentId)
      .eq("company_id", companyId);
    await supabase
      .from("estimate_agents")
      .delete()
      .eq("id", agentAssignId)
      .eq("company_id", companyId);
    await redistributeAgentEvenly();
    await loadAllData();
    onRefresh();
    setSaving(false);
    alert("Agent removed");
  }

  async function recordAgentPayment() {
    if (!selectedAgentForPayment || agentPaymentAmount <= 0) {
      alert("Enter valid amount");
      return;
    }
    const totalOwed = (selectedAgentForPayment.amount || 0) + (selectedAgentForPayment.reimbursement_amount || 0);
    const remainingOwed = totalOwed - (selectedAgentForPayment.paid_amount || 0);
    if (agentPaymentAmount > remainingOwed) {
      alert(`Cannot pay more than owed (${formatCurrency(remainingOwed)})`);
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("agent_payments").insert({
      estimate_id: estimateId,
      agent_id: selectedAgentForPayment.agent_id,
      // Links this payment to the specific assignment row, same as
      // subcontractor_payments.estimate_subcontractor_id below — without
      // this, the Expense page's payout tracking (which joins through
      // this column) can't see payments recorded from this modal and
      // shows a stale "pending" status for an agent already paid here.
      estimate_agent_id: selectedAgentForPayment.id,
      amount: agentPaymentAmount,
      payment_method: agentPaymentMethod,
      payment_date: new Date().toISOString(),
      company_id: companyId,
    });

    if (error) {
      alert("Error recording payment");
    } else {
      await loadAllData();
      onRefresh();
      alert(`Payment of ${formatCurrency(agentPaymentAmount)} recorded!`);
    }
    setShowAgentPaymentModal(false);
    setAgentPaymentAmount(0);
    setSaving(false);
  }

  async function deleteAgentPayment(paymentId: string, agentId: string) {
    if (!confirm("Delete this payment? This will increase the agent's owed amount.")) return;
    setSaving(true);
    await softDeleteAgentPayment(paymentId);
    await loadAllData();
    onRefresh();
    setSaving(false);
    alert("Payment deleted");
  }

  async function updateAgentPayment(paymentId: string, newAmount: number, agentId: string, oldAmount: number) {
    if (newAmount < 0) {
      alert("Amount cannot be negative");
      return;
    }
    if (!companyId) {
      alert("Company not found");
      return;
    }
    setSaving(true);
    await supabase
      .from("agent_payments")
      .update({ amount: newAmount })
      .eq("id", paymentId)
      .eq("company_id", companyId);
    await loadAllData();
    onRefresh();
    setEditingAgentPayment(null);
    setSaving(false);
    alert(`Payment updated from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}`);
  }

  async function updateCompanyPercentage(percentage: CompanyPercentage) {
    setCompanyPercentage(percentage);
    await redistributeAgentEvenly();
    await loadAllData();
    onRefresh();
  }

  if (!isOpen) return null;

  const getCategoryLabel = (category: string) => EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category;
  const getCategoryIcon = (category: string) => EXPENSE_CATEGORIES.find(c => c.value === category)?.icon || "📦";

  // ---- RENDER (JSX) – completely unchanged ----
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Project Financials</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Estimate Total:</span>
              <span className="font-semibold">{formatCurrency(estimateTotal)}</span>
            </div>

            <div className="bg-amber-50 -mx-2 px-3 py-2 rounded-lg border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 mb-2">Profit Split</div>
              <div className="flex gap-3">
                <button
                  onClick={() => updateCompanyPercentage(30)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    companyPercentage === 30 ? "bg-amber-600 text-white" : "bg-white border border-amber-300 text-amber-700"
                  }`}
                >
                  Company 30% / Agent 70%
                </button>
                <button
                  onClick={() => updateCompanyPercentage(60)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    companyPercentage === 60 ? "bg-amber-600 text-white" : "bg-white border border-amber-300 text-amber-700"
                  }`}
                >
                  Company 60% / Agent 40%
                </button>
              </div>
            </div>

            <div className="bg-blue-50 -mx-2 px-3 py-2 rounded-lg border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-800">Subcontractor Committed:</span>
                <span className="text-sm font-bold text-red-600">-{formatCurrency(totalSubAssigned)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-blue-600 mt-1">
                <span>Paid: {formatCurrency(totalSubPaid)}</span>
                <span>Owed: {formatCurrency(totalSubOwed)}</span>
              </div>
            </div>

            <div className="bg-red-50 -mx-2 px-3 py-2 rounded-lg border border-red-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-red-800">Business Expenses:</span>
                <span className="text-sm font-bold text-red-600">-{formatCurrency(totalExpenses)}</span>
              </div>
            </div>

            <div className="border-t my-2"></div>
            <div className="flex justify-between text-sm">
              <span>After Costs:</span>
              <span className="font-semibold">{formatCurrency(afterSubcontractorAndExpenses)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Company ({companyPercentage}%):</span>
              <span className="text-blue-600">-{formatCurrency(companyAmount)}</span>
            </div>
            <div className="border-t my-2"></div>
            <div className="flex justify-between text-base font-bold">
              <span>For Agents ({agentPercentage}%):</span>
              <span className="text-green-700">{formatCurrency(remainingForAgents)}</span>
            </div>
            {assignedAgents.length > 0 && remainingForAgents > 0 && (
              <div className="text-right">
                <button onClick={redistributeByPercentage} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  Split Evenly
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("subcontractors")}
              className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition ${
                activeTab === "subcontractors" ? "bg-green-700 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              <Users size={14} className="inline mr-1" /> Subs ({assignedSubs.length})
            </button>
            <button
              onClick={() => setActiveTab("expenses")}
              className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition ${
                activeTab === "expenses" ? "bg-green-700 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              <Receipt size={14} className="inline mr-1" /> Expenses ({expenses.length})
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition ${
                activeTab === "agents" ? "bg-green-700 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              <Users size={14} className="inline mr-1" /> Agents ({assignedAgents.length})
            </button>
          </div>

          {activeTab === "subcontractors" && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Assign Subcontractor</label>
                  <button onClick={() => setShowNewSubForm(!showNewSubForm)} className="text-xs text-green-600">
                    + New
                  </button>
                </div>

                {showNewSubForm && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                    <input type="text" placeholder="Name *" value={newSub.name} onChange={(e) => setNewSub({ ...newSub, name: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <input type="text" placeholder="Company Name" value={newSub.company_name} onChange={(e) => setNewSub({ ...newSub, company_name: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <input type="tel" placeholder="Phone" value={newSub.phone} onChange={(e) => setNewSub({ ...newSub, phone: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <input type="email" placeholder="Email" value={newSub.email} onChange={(e) => setNewSub({ ...newSub, email: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowNewSubForm(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                      <button onClick={createSubcontractor} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">Create</button>
                    </div>
                  </div>
                )}

                <select value={selectedSubId} onChange={(e) => setSelectedSubId(e.target.value)} className="w-full border rounded-lg p-2 text-sm mb-2">
                  <option value="">Select subcontractor...</option>
                  {subcontractors.filter((s) => !assignedSubs.some((a) => a.subcontractor_id === s.id)).map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>

                <div className="flex gap-2 mb-2">
                  <input type="number" placeholder="Amount (optional)" value={subAmount === null ? "" : subAmount} onChange={(e) => setSubAmount(e.target.value === "" ? null : Number(e.target.value))} className="flex-1 border rounded-lg p-2 text-sm" step="0.01" />
                  <button onClick={assignSubcontractor} disabled={saving} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">Assign</button>
                </div>
                <textarea placeholder="Notes (optional)" value={subNotes} onChange={(e) => setSubNotes(e.target.value)} className="w-full border rounded-lg p-2 text-sm" rows={1} />
              </div>

              {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : assignedSubs.length === 0 ? <div className="text-center py-8 text-gray-400">No subcontractors assigned</div> : (
                <div className="space-y-3">
                  {assignedSubs.map((sub) => (
                    <div key={sub.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{sub.subcontractors?.name}</div>
                          {editingSub === sub.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-gray-500">$</span>
                              <input type="number" value={editSubAmount} onChange={(e) => setEditSubAmount(Number(e.target.value))} className="w-28 border rounded-lg p-1 text-sm" step="0.01" autoFocus />
                              <button onClick={() => updateSubAmount(sub.id, editSubAmount)} className="text-green-600"><Check size={16} /></button>
                              <button onClick={() => setEditingSub(null)} className="text-gray-400"><X size={16} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-semibold text-green-700">{formatCurrency(sub.amount || 0)}</span>
                              <button onClick={() => { setEditingSub(sub.id); setEditSubAmount(sub.amount || 0); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={12} /></button>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">Paid: {formatCurrency(sub.paid_amount || 0)}</div>
                          {sub.notes && <div className="text-xs text-gray-400 mt-1">{sub.notes}</div>}
                        </div>
                        <button onClick={() => removeSubAssignment(sub.id)} className="text-red-500 text-sm px-2">✕</button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setSelectedSubForPayment(sub); setSubPaymentAmount(0); setShowSubPaymentModal(true); }} className="flex-1 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">Record Payment</button>
                        <button onClick={() => { setSelectedSubForHistory(sub); setShowSubPaymentHistory(true); }} className="flex-1 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Payment History</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "expenses" && (
            <div className="space-y-4">
              {!showExpenseForm ? (
                <button onClick={() => setShowExpenseForm(true)} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-green-600 text-sm font-medium hover:bg-green-50">+ Add Expense</button>
              ) : (
                <div className="border rounded-lg p-3 space-y-3">
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="w-full border rounded-lg p-2 text-sm">
                    {EXPENSE_CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>))}
                  </select>
                  <input type="text" placeholder="Description *" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                  <input type="number" placeholder="Amount *" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} className="w-full border rounded-lg p-2 text-sm" step="0.01" />
                  <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                  <textarea placeholder="Notes (optional)" value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} className="w-full border rounded-lg p-2 text-sm" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowExpenseForm(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                    <button onClick={addExpense} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">{saving ? "Adding..." : "Add Expense"}</button>
                  </div>
                </div>
              )}

              {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : expenses.length === 0 ? <div className="text-center py-8 text-gray-400">No expenses recorded</div> : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {expenses.map((exp) => (
                    <div key={exp.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-500">{getCategoryIcon(exp.category)} {getCategoryLabel(exp.category)}</span>
                            <span className="text-xs text-gray-400">{new Date(exp.expense_date).toLocaleDateString()}</span>
                          </div>
                          {editingExpense === exp.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input type="text" defaultValue={exp.description} onBlur={(e) => updateExpense(exp.id, exp.amount, e.target.value)} className="flex-1 border rounded-lg p-1 text-sm" />
                              <input type="number" defaultValue={exp.amount} onBlur={(e) => updateExpense(exp.id, Number(e.target.value), exp.description)} className="w-24 border rounded-lg p-1 text-sm" step="0.01" />
                              <button onClick={() => setEditingExpense(null)} className="text-green-600"><Check size={16} /></button>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium text-gray-800">{exp.description}</div>
                              <div className="text-sm font-semibold text-red-600 mt-1">{formatCurrency(exp.amount)}</div>
                            </>
                          )}
                          {exp.notes && <div className="text-xs text-gray-500 mt-1">{exp.notes}</div>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingExpense(exp.id)} className="text-gray-400 hover:text-blue-500"><Edit2 size={14} /></button>
                          <button onClick={() => deleteExpense(exp.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-sm font-semibold text-red-600 pt-2">Total Expenses: {formatCurrency(totalExpenses)}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === "agents" && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Add Agent</label>
                  <button onClick={() => setShowNewAgentForm(!showNewAgentForm)} className="text-xs text-blue-600">+ New Agent</button>
                </div>

                {showNewAgentForm && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                    <input type="text" placeholder="Name *" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <input type="email" placeholder="Email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <input type="tel" placeholder="Phone" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowNewAgentForm(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                      <button onClick={createAgent} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">Create</button>
                    </div>
                  </div>
                )}

                <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} className="w-full border rounded-lg p-2 text-sm mb-2">
                  <option value="">Select agent...</option>
                  {agents.filter((a) => !assignedAgents.some((assigned) => assigned.agent_id === a.id)).map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <button onClick={assignAgent} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">Add Agent</button>
                </div>
                <textarea placeholder="Notes (optional)" value={agentNotes} onChange={(e) => setAgentNotes(e.target.value)} className="w-full mt-2 border rounded-lg p-2 text-sm" rows={1} />
              </div>

              {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : assignedAgents.length === 0 ? <div className="text-center py-8 text-gray-400">No agents assigned</div> : (
                <>
                  <div className="space-y-3">
                    {assignedAgents.map((agent) => (
                      <div key={agent.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800">{agent.agents?.name}</div>
                            {editingAgent === agent.id ? (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-gray-500">$</span>
                                <input type="number" value={editAgentAmount} onChange={(e) => setEditAgentAmount(Number(e.target.value))} className="w-28 border rounded-lg p-1 text-sm" step="0.01" autoFocus />
                                <button onClick={() => updateAgentAmount(agent.id, editAgentAmount)} className="text-green-600"><Check size={16} /></button>
                                <button onClick={() => setEditingAgent(null)} className="text-gray-400"><X size={16} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-semibold text-green-700">Commission: {formatCurrency(agent.amount || 0)}</span>
                                <button onClick={() => { setEditingAgent(agent.id); setEditAgentAmount(agent.amount || 0); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={12} /></button>
                              </div>
                            )}
                            {(agent.reimbursement_amount || 0) > 0 && (
                              <div className="text-xs text-gray-600 mt-1">Reimbursement: {formatCurrency(agent.reimbursement_amount || 0)}</div>
                            )}
                            {agent.notes && <div className="text-xs text-gray-400 mt-1">{agent.notes}</div>}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Total Owed: {formatCurrency((agent.amount || 0) + (agent.reimbursement_amount || 0))}</span>
                              <span className="text-xs text-gray-500">Paid: {formatCurrency(agent.paid_amount || 0)}</span>
                              <button onClick={() => { setSelectedAgentForHistory(agent); setShowAgentPaymentHistory(true); }} className="text-xs text-blue-500 hover:text-blue-600"><Eye size={12} className="inline" /> History</button>
                            </div>
                            {((agent.amount || 0) + (agent.reimbursement_amount || 0)) > (agent.paid_amount || 0) && (
                              <div className="text-xs text-amber-600 mt-1">Remaining: {formatCurrency(((agent.amount || 0) + (agent.reimbursement_amount || 0)) - (agent.paid_amount || 0))}</div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setSelectedAgentForPayment(agent); setAgentPaymentAmount(((agent.amount || 0) + (agent.reimbursement_amount || 0)) - (agent.paid_amount || 0)); setShowAgentPaymentModal(true); }} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Pay</button>
                            <button onClick={() => removeAgentAssignment(agent.id, agent.agent_id)} className="text-red-500 text-sm px-2">✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Total Commission:</span>
                      <span className="text-green-700">{formatCurrency(totalAgentAssigned)} / {formatCurrency(remainingForAgents)}</span>
                    </div>
                    {remainingToDistribute !== 0 && <div className="text-xs text-orange-600 mt-1">Remaining: {formatCurrency(remainingToDistribute)}</div>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showSubPaymentModal && selectedSubForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="border-b px-5 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Record Payment - {selectedSubForPayment.subcontractors?.name}</h3>
              <button onClick={() => setShowSubPaymentModal(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Amount</label><input type="number" value={subPaymentAmount} onChange={(e) => setSubPaymentAmount(Number(e.target.value))} className="w-full border rounded-lg p-2" step="0.01" autoFocus /></div>
              <div><label className="block text-sm font-medium mb-1">Payment Method</label><select value={subPaymentMethod} onChange={(e) => setSubPaymentMethod(e.target.value)} className="w-full border rounded-lg p-2"><option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank Transfer</option></select></div>
              <div className="flex gap-2 pt-2"><button onClick={() => setShowSubPaymentModal(false)} className="flex-1 py-2 border rounded-lg">Cancel</button><button onClick={recordSubPayment} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg">Record Payment</button></div>
            </div>
          </div>
        </div>
      )}

      {showSubPaymentHistory && selectedSubForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Payments - {selectedSubForHistory.subcontractors?.name}</h3>
              <button onClick={() => setShowSubPaymentHistory(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between text-sm"><span>Total Assigned:</span><span className="font-semibold">{formatCurrency(selectedSubForHistory.amount || 0)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Total Paid:</span><span className="font-semibold text-blue-600">{formatCurrency(selectedSubForHistory.paid_amount || 0)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Remaining:</span><span className="font-semibold text-amber-600">{formatCurrency((selectedSubForHistory.amount || 0) - (selectedSubForHistory.paid_amount || 0))}</span></div>
              </div>
              {selectedSubForHistory.payments?.length === 0 ? <div className="text-center py-8 text-gray-400">No payments</div> : (
                <div className="space-y-2">
                  {selectedSubForHistory.payments?.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          {editingSubPayment === payment.id ? (
                            <div className="flex items-center gap-2"><span>$</span><input type="number" value={editSubPaymentAmount} onChange={(e) => setEditSubPaymentAmount(Number(e.target.value))} className="w-28 border rounded p-1 text-sm" step="0.01" autoFocus /><button onClick={() => updateSubPayment(payment.id, editSubPaymentAmount, selectedSubForHistory.id, payment.amount)} className="text-green-600"><Check size={16} /></button><button onClick={() => setEditingSubPayment(null)} className="text-gray-400"><X size={16} /></button></div>
                          ) : (
                            <div className="font-medium">{formatCurrency(payment.amount)}</div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">{payment.payment_method} • {new Date(payment.created_at).toLocaleDateString()}</div>
                        </div>
                        {editingSubPayment !== payment.id && (
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingSubPayment(payment.id); setEditSubPaymentAmount(payment.amount); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={14} /></button>
                            <button onClick={() => deleteSubPayment(payment.id, selectedSubForHistory.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAgentPaymentModal && selectedAgentForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="border-b px-5 py-4 flex justify-between items-center"><h3 className="text-lg font-semibold">Pay Agent - {selectedAgentForPayment.agents?.name}</h3><button onClick={() => setShowAgentPaymentModal(false)} className="p-1 text-gray-400"><X size={20} /></button></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Amount</label><input type="number" value={agentPaymentAmount} onChange={(e) => setAgentPaymentAmount(Number(e.target.value))} className="w-full border rounded-lg p-2" step="0.01" autoFocus /></div>
              <div><label className="block text-sm font-medium mb-1">Payment Method</label><select value={agentPaymentMethod} onChange={(e) => setAgentPaymentMethod(e.target.value)} className="w-full border rounded-lg p-2"><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="check">Check</option><option value="venmo">Venmo</option></select></div>
              <div className="flex gap-2 pt-2"><button onClick={() => setShowAgentPaymentModal(false)} className="flex-1 py-2 border rounded-lg">Cancel</button><button onClick={recordAgentPayment} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg">Record Payment</button></div>
            </div>
          </div>
        </div>
      )}

      {showAgentPaymentHistory && selectedAgentForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center"><h3 className="text-lg font-semibold">Payment History - {selectedAgentForHistory.agents?.name}</h3><button onClick={() => setShowAgentPaymentHistory(false)} className="p-1 text-gray-400"><X size={20} /></button></div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between text-sm"><span>Commission:</span><span className="font-semibold text-green-700">{formatCurrency(selectedAgentForHistory.amount || 0)}</span></div>
                {(selectedAgentForHistory.reimbursement_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm mt-1"><span>Reimbursement:</span><span className="font-semibold text-amber-700">{formatCurrency(selectedAgentForHistory.reimbursement_amount || 0)}</span></div>
                )}
                <div className="flex justify-between text-sm mt-1"><span>Total Owed:</span><span className="font-semibold text-green-700">{formatCurrency((selectedAgentForHistory.amount || 0) + (selectedAgentForHistory.reimbursement_amount || 0))}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Total Paid:</span><span className="font-semibold text-blue-600">{formatCurrency(selectedAgentForHistory.paid_amount || 0)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Remaining:</span><span className="font-semibold text-amber-600">{formatCurrency(((selectedAgentForHistory.amount || 0) + (selectedAgentForHistory.reimbursement_amount || 0)) - (selectedAgentForHistory.paid_amount || 0))}</span></div>
              </div>
              {selectedAgentForHistory.payments?.length === 0 ? <div className="text-center py-8 text-gray-400">No payments</div> : (
                <div className="space-y-2">
                  {selectedAgentForHistory.payments?.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>{editingAgentPayment === payment.id ? (<div className="flex items-center gap-2"><span>$</span><input type="number" value={editAgentPaymentAmount} onChange={(e) => setEditAgentPaymentAmount(Number(e.target.value))} className="w-28 border rounded p-1 text-sm" step="0.01" autoFocus /><button onClick={() => updateAgentPayment(payment.id, editAgentPaymentAmount, selectedAgentForHistory.agent_id, payment.amount)} className="text-green-600"><Check size={16} /></button><button onClick={() => setEditingAgentPayment(null)} className="text-gray-400"><X size={16} /></button></div>) : (<div className="font-medium">{formatCurrency(payment.amount)} <span className="text-xs font-normal text-gray-500">({payment.payment_type === 'reimbursement' ? 'Reimbursement' : 'Commission'})</span></div>)}<div className="text-xs text-gray-500 mt-1">{payment.payment_method} • {new Date(payment.payment_date).toLocaleDateString()}</div></div>
                        {editingAgentPayment !== payment.id && (<div className="flex gap-1"><button onClick={() => { setEditingAgentPayment(payment.id); setEditAgentPaymentAmount(payment.amount); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={14} /></button><button onClick={() => deleteAgentPayment(payment.id, selectedAgentForHistory.agent_id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button></div>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}