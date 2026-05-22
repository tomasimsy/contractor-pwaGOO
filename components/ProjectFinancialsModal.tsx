"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { X, Trash2, Edit2, Check, DollarSign, Users, Plus, Receipt } from "lucide-react";

type Subcontractor = {
  id: string;
  name: string;
  company_name: string;
  phone: string;
  email: string;
};

type AssignedSub = {
  id: string;
  amount: number;
  paid_amount: number;
  notes: string;
  subcontractor_id: string;
  subcontractors?: Subcontractor;
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

type AssignedAgent = {
  id: string;
  amount: number;
  paid_amount: number;  // Add this
  notes: string;
  agent_id: string;
  agents?: Agent;
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
  const [activeTab, setActiveTab] = useState<"subcontractors" | "expenses" | "agents">("subcontractors");

  // Subcontractor state
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [assignedSubs, setAssignedSubs] = useState<AssignedSub[]>([]);
  const [showNewSubForm, setShowNewSubForm] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [subAmount, setSubAmount] = useState<number | null>(null);
  const [subNotes, setSubNotes] = useState("");
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubAmount, setEditSubAmount] = useState(0);
  const [showSubPaymentModal, setShowSubPaymentModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<AssignedSub | null>(null);
  const [subPaymentAmount, setSubPaymentAmount] = useState(0);
  const [subPaymentMethod, setSubPaymentMethod] = useState("cash");

  // Expense state
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

  // Agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<AssignedAgent[]>([]);
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editAgentAmount, setEditAgentAmount] = useState(0);
  // Add after other state declarations
const [showAgentPaymentHistory, setShowAgentPaymentHistory] = useState(false);
const [selectedAgentForHistory, setSelectedAgentForHistory] = useState<AssignedAgent | null>(null);
const [agentPayments, setAgentPayments] = useState<any[]>([]);
const [editingAgentPayment, setEditingAgentPayment] = useState<string | null>(null);
const [editPaymentAmount, setEditPaymentAmount] = useState(0);

  // New item forms
  const [newSub, setNewSub] = useState({ name: "", company_name: "", phone: "", email: "" });
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Calculations
  const totalSubAssigned = assignedSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalSubPaid = assignedSubs.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
  const totalSubOwed = totalSubAssigned - totalSubPaid;
  
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  const companyPercentage = 30;
  const afterSubcontractorAndExpenses = estimateTotal - totalSubPaid - totalExpenses;
  const companyAmount = (afterSubcontractorAndExpenses * companyPercentage) / 100;
  const remainingForAgents = afterSubcontractorAndExpenses - companyAmount;
  const totalAgentAssigned = assignedAgents.reduce((sum, a) => sum + (a.amount || 0), 0);
  const remainingToDistribute = remainingForAgents - totalAgentAssigned;


  // Add agent payment modals after other state declarations
const [showAgentPaymentModal, setShowAgentPaymentModal] = useState(false);
const [selectedAgentForPayment, setSelectedAgentForPayment] = useState<AssignedAgent | null>(null);
const [agentPaymentAmount, setAgentPaymentAmount] = useState(0);
const [agentPaymentMethod, setAgentPaymentMethod] = useState("bank_transfer");

  useEffect(() => {
    if (isOpen) loadAllData();
  }, [isOpen]);

  async function loadAllData() {
    setLoading(true);
    try {
      // Load subcontractors
      const { data: subs } = await supabase.from("subcontractors").select("*").order("name");
      if (subs) setSubcontractors(subs);

      // Load assigned subcontractors with payments
      const { data: assigned } = await supabase
        .from("estimate_subcontractors")
        .select("*, subcontractors(*)")
        .eq("estimate_id", estimateId);

      if (assigned) {
        const subsWithPayments = await Promise.all(
          assigned.map(async (sub) => {
            const { data: payments } = await supabase
              .from("subcontractor_payments")
              .select("amount")
              .eq("estimate_subcontractor_id", sub.id);
            const paidAmount = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
            return { ...sub, paid_amount: paidAmount };
          })
        );
        setAssignedSubs(subsWithPayments);
      }

      
      // Load expenses
      const { data: expenseData } = await supabase
        .from("estimate_expenses")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("expense_date", { ascending: false });
      if (expenseData) setExpenses(expenseData);

      // Load agents
      const { data: ags } = await supabase.from("agents").select("*").order("name");
      if (ags) setAgents(ags);

      // Load assigned agents
      const { data: assignedAgentsData } = await supabase
        .from("estimate_agents")
        .select("*, agents(*)")
        .eq("estimate_id", estimateId);
          if (assignedAgentsData) {
      const agentsWithPayments = await Promise.all(
        assignedAgentsData.map(async (agent) => {
          const { data: payments } = await supabase
            .from("agent_payments")
            .select("amount")
            .eq("agent_id", agent.agent_id)
            .eq("estimate_id", estimateId);
          const paidAmount = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
          return { ...agent, paid_amount: paidAmount };
        })
      );
      setAssignedAgents(agentsWithPayments);
    }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Subcontractor functions
  async function createSubcontractor() {
    if (!newSub.name.trim()) {
      alert("Name is required");
      return;
    }
    const { data } = await supabase
      .from("subcontractors")
      .insert({
        name: newSub.name,
        company_name: newSub.company_name || null,
        phone: newSub.phone || null,
        email: newSub.email || null,
      })
      .select()
      .single();
    if (data) {
      setSubcontractors([data, ...subcontractors]);
      setSelectedSubId(data.id);
      setShowNewSubForm(false);
      setNewSub({ name: "", company_name: "", phone: "", email: "" });
      alert("Subcontractor created!");
    }
  }


  async function loadAgentPayments(agentId: string) {
  const { data } = await supabase
    .from("agent_payments")
    .select("*")
    .eq("estimate_id", estimateId)
    .eq("agent_id", agentId)
    .order("payment_date", { ascending: false });
  
  if (data) setAgentPayments(data);
  return data?.reduce((sum, p) => sum + p.amount, 0) || 0;
}

async function deleteAgentPayment(paymentId: string, amount: number, agentId: string) {
  if (!confirm("Delete this payment? This will increase the agent's owed amount.")) return;
  
  // Delete the payment
  await supabase.from("agent_payments").delete().eq("id", paymentId);
  
  // Refresh the agent's paid amount
  const newTotalPaid = await loadAgentPayments(agentId);
  
  // Update the assigned agent's paid_amount in state
  setAssignedAgents(prev => prev.map(agent => 
    agent.agent_id === agentId 
      ? { ...agent, paid_amount: newTotalPaid }
      : agent
  ));
  
  // Refresh the payment list
  if (selectedAgentForHistory) {
    await loadAgentPayments(selectedAgentForHistory.agent_id);
  }
  
  alert("Payment deleted. Agent's owed amount has been adjusted.");
  onRefresh();
}

async function updateAgentPayment(paymentId: string, newAmount: number, agentId: string, oldAmount: number) {
  if (newAmount < 0) {
    alert("Amount cannot be negative");
    return;
  }
  
  // Update the payment
  await supabase
    .from("agent_payments")
    .update({ amount: newAmount })
    .eq("id", paymentId);
  
  // Refresh totals
  const newTotalPaid = await loadAgentPayments(agentId);
  
  // Update the assigned agent's paid_amount in state
  setAssignedAgents(prev => prev.map(agent => 
    agent.agent_id === agentId 
      ? { ...agent, paid_amount: newTotalPaid }
      : agent
  ));
  
  setEditingAgentPayment(null);
  
  // Refresh the payment list
  if (selectedAgentForHistory) {
    await loadAgentPayments(selectedAgentForHistory.agent_id);
  }
  
  alert(`Payment updated from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}`);
  onRefresh();
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

    const amountToSave = subAmount && subAmount > 0 ? subAmount : 0;

    const { data: newSub, error } = await supabase
      .from("estimate_subcontractors")
      .insert({
        estimate_id: estimateId,
        subcontractor_id: selectedSubId,
        amount: amountToSave,
        notes: subNotes || null,
      })
      .select()
      .single();

    if (!error && newSub && amountToSave > 0) {
      await supabase.from("subcontractor_payments").insert({
        estimate_subcontractor_id: newSub.id,
        amount: amountToSave,
        payment_method: "cash",
      });
    }

    setSelectedSubId("");
    setSubAmount(null);
    setSubNotes("");
    loadAllData();
    onRefresh();
    alert(amountToSave > 0 ? "Subcontractor assigned with payment!" : "Subcontractor assigned");
  }

  async function updateSubAmount(subId: string, newAmount: number) {
    if (newAmount < 0) return;
    await supabase.from("estimate_subcontractors").update({ amount: newAmount }).eq("id", subId);
    setEditingSub(null);
    loadAllData();
    onRefresh();
  }

  async function removeSubAssignment(subId: string) {
    if (!confirm("Remove this subcontractor?")) return;
    await supabase.from("estimate_subcontractors").delete().eq("id", subId);
    loadAllData();
    onRefresh();
  }

  async function recordSubPayment() {
    if (!selectedSub || subPaymentAmount <= 0) {
      alert("Enter a valid amount");
      return;
    }
    setSaving(true);

    await supabase.from("subcontractor_payments").insert({
      estimate_subcontractor_id: selectedSub.id,
      amount: subPaymentAmount,
      payment_method: subPaymentMethod,
    });

    const newPaidAmount = (selectedSub.paid_amount || 0) + subPaymentAmount;
    await supabase.from("estimate_subcontractors").update({ amount: newPaidAmount }).eq("id", selectedSub.id);

    setShowSubPaymentModal(false);
    setSubPaymentAmount(0);
    loadAllData();
    onRefresh();
    setSaving(false);
    alert(`Payment of ${formatCurrency(subPaymentAmount)} recorded!`);
  }

  // Expense functions
  async function addExpense() {
    if (expenseForm.amount <= 0) {
      alert("Enter an amount");
      return;
    }
    if (!expenseForm.description.trim()) {
      alert("Enter a description");
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
    });

    if (!error) {
      setExpenseForm({
        category: "materials",
        description: "",
        amount: 0,
        expense_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setShowExpenseForm(false);
      loadAllData();
      onRefresh();
    } else {
      alert("Error adding expense");
    }
    setSaving(false);
  }

  async function updateExpense(expenseId: string, newAmount: number, newDescription: string) {
    await supabase
      .from("estimate_expenses")
      .update({ amount: newAmount, description: newDescription })
      .eq("id", expenseId);
    setEditingExpense(null);
    loadAllData();
    onRefresh();
  }

  async function deleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    await supabase.from("estimate_expenses").delete().eq("id", expenseId);
    loadAllData();
    onRefresh();
  }

  // Agent functions
  async function createAgent() {
    if (!newAgent.name.trim()) {
      alert("Name is required");
      return;
    }
    const { data } = await supabase
      .from("agents")
      .insert({
        name: newAgent.name,
        email: newAgent.email || null,
        phone: newAgent.phone || null,
      })
      .select()
      .single();
    if (data) {
      setAgents([data, ...agents]);
      setSelectedAgentId(data.id);
      setShowNewAgentForm(false);
      setNewAgent({ name: "", email: "", phone: "" });
      alert("Agent created!");
    }
  }

  async function assignAgent() {
    if (!selectedAgentId) return;
    if (assignedAgents.some((a) => a.agent_id === selectedAgentId)) {
      alert("Agent already assigned");
      return;
    }

    await supabase.from("estimate_agents").insert({
      estimate_id: estimateId,
      agent_id: selectedAgentId,
      amount: 0,
      notes: agentNotes || null,
    });

    setSelectedAgentId("");
    setAgentNotes("");
    await redistributeAgentEvenly();
    loadAllData();
    onRefresh();
  }

  async function redistributeAgentEvenly() {
    const count = assignedAgents.length;
    if (count === 0 || remainingForAgents <= 0) return;
    const equalShare = remainingForAgents / count;

    for (const agent of assignedAgents) {
      await supabase.from("estimate_agents").update({ amount: equalShare }).eq("id", agent.id);
    }
    loadAllData();
    onRefresh();
  }

  async function updateAgentAmount(agentId: string, newAmount: number) {
    if (newAmount < 0) return;
    await supabase.from("estimate_agents").update({ amount: newAmount }).eq("id", agentId);

    const otherTotal = assignedAgents.filter((a) => a.id !== agentId).reduce((sum, a) => sum + (a.amount || 0), 0);
    const remaining = remainingForAgents - (newAmount + otherTotal);
    if (remaining > 0 && assignedAgents.length > 1) {
      const lastAgent = assignedAgents.find((a) => a.id !== agentId);
      if (lastAgent) {
        await supabase
          .from("estimate_agents")
          .update({ amount: (lastAgent.amount || 0) + remaining })
          .eq("id", lastAgent.id);
      }
    }
    setEditingAgent(null);
    loadAllData();
    onRefresh();
  }

  async function removeAgentAssignment(agentId: string) {
    if (!confirm("Remove this agent?")) return;
    await supabase.from("estimate_agents").delete().eq("id", agentId);
    await redistributeAgentEvenly();
    loadAllData();
    onRefresh();
  }

  if (!isOpen) return null;

  const getCategoryLabel = (category: string) => {
    return EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const getCategoryIcon = (category: string) => {
    return EXPENSE_CATEGORIES.find(c => c.value === category)?.icon || "📦";
  };


async function recordAgentPayment() {
  if (!selectedAgentForPayment || agentPaymentAmount <= 0) {
    alert("Enter a valid amount");
    return;
  }
  
  setSaving(true);
  
  // Record payment
  const { error } = await supabase.from("agent_payments").insert({
    estimate_id: estimateId,
    agent_id: selectedAgentForPayment.agent_id,
    amount: agentPaymentAmount,
    payment_method: agentPaymentMethod,
  });
  
  if (!error) {
    setShowAgentPaymentModal(false);
    setAgentPaymentAmount(0);
    alert(`Payment of ${formatCurrency(agentPaymentAmount)} recorded for ${selectedAgentForPayment.agents?.name}`);
    loadAllData(); // Refresh to show updated paid amounts
    onRefresh();
  } else {
    alert("Error recording payment");
  }
  
  setSaving(false);
}

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Project Financials</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Summary Card */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Estimate Total:</span>
              <span className="font-semibold">{formatCurrency(estimateTotal)}</span>
            </div>

            <div className="bg-amber-50 -mx-2 px-3 py-2 rounded-lg border border-amber-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-amber-800">Subcontractor Paid:</span>
                <span className="text-sm font-bold text-red-600">-{formatCurrency(totalSubPaid)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-amber-600 mt-1">
                <span>Assigned: {formatCurrency(totalSubAssigned)}</span>
                <span>Owed: {formatCurrency(totalSubOwed)}</span>
              </div>
            </div>

            <div className="bg-red-50 -mx-2 px-3 py-2 rounded-lg border border-red-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-red-800">Business Expenses:</span>
                <span className="text-sm font-bold text-red-600">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="text-[10px] text-red-600 mt-1">Materials, equipment, permits, etc.</div>
            </div>

            <div className="border-t my-2"></div>
            <div className="flex justify-between text-sm">
              <span>After Costs:</span>
              <span className="font-semibold">{formatCurrency(afterSubcontractorAndExpenses)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Company (30%):</span>
              <span className="text-blue-600">-{formatCurrency(companyAmount)}</span>
            </div>
            <div className="border-t my-2"></div>
            <div className="flex justify-between text-base font-bold">
              <span>For Agents:</span>
              <span className="text-green-700">{formatCurrency(remainingForAgents)}</span>
            </div>
          </div>

          {/* Tab Buttons */}
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

          {/* SUBCONTRACTORS TAB */}
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
                    <input
                      type="text"
                      placeholder="Name *"
                      value={newSub.name}
                      onChange={(e) => setNewSub({ ...newSub, name: e.target.value })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Company Name"
                      value={newSub.company_name}
                      onChange={(e) => setNewSub({ ...newSub, company_name: e.target.value })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={newSub.phone}
                      onChange={(e) => setNewSub({ ...newSub, phone: e.target.value })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newSub.email}
                      onChange={(e) => setNewSub({ ...newSub, email: e.target.value })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setShowNewSubForm(false)} className="flex-1 py-2 border rounded-lg text-sm">
                        Cancel
                      </button>
                      <button onClick={createSubcontractor} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">
                        Create
                      </button>
                    </div>
                  </div>
                )}

                <select
                  value={selectedSubId}
                  onChange={(e) => setSelectedSubId(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm mb-2"
                >
                  <option value="">Select subcontractor...</option>
                  {subcontractors
                    .filter((s) => !assignedSubs.some((a) => a.subcontractor_id === s.id))
                    .map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                </select>

                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Amount (optional)"
                    value={subAmount === null ? "" : subAmount}
                    onChange={(e) => setSubAmount(e.target.value === "" ? null : Number(e.target.value))}
                    className="flex-1 border rounded-lg p-2 text-sm"
                    step="0.01"
                  />
                  <button onClick={assignSubcontractor} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">
                    Assign
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Leave amount blank to add later</p>
                <textarea
                  placeholder="Notes (optional)"
                  value={subNotes}
                  onChange={(e) => setSubNotes(e.target.value)}
                  className="w-full mt-2 border rounded-lg p-2 text-sm"
                  rows={1}
                />
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : assignedSubs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No subcontractors assigned</div>
              ) : (
                <div className="space-y-3">
                  {assignedSubs.map((sub) => (
                    <div key={sub.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{sub.subcontractors?.name}</div>
                          {editingSub === sub.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-gray-500">$</span>
                              <input
                                type="number"
                                value={editSubAmount}
                                onChange={(e) => setEditSubAmount(Number(e.target.value))}
                                className="w-28 border rounded-lg p-1 text-sm"
                                step="0.01"
                                autoFocus
                              />
                              <button onClick={() => updateSubAmount(sub.id, editSubAmount)} className="text-green-600">
                                <Check size={16} />
                              </button>
                              <button onClick={() => setEditingSub(null)} className="text-gray-400">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-semibold text-green-700">{formatCurrency(sub.amount || 0)}</span>
                              <button
                                onClick={() => {
                                  setEditingSub(sub.id);
                                  setEditSubAmount(sub.amount || 0);
                                }}
                                className="text-gray-400 hover:text-blue-500"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">Paid: {formatCurrency(sub.paid_amount || 0)}</div>
                          {sub.notes && <div className="text-xs text-gray-400 mt-1">{sub.notes}</div>}
                        </div>
                        <button onClick={() => removeSubAssignment(sub.id)} className="text-red-500 text-sm px-2">
                          ✕
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSub(sub);
                          setShowSubPaymentModal(true);
                        }}
                        className="w-full mt-2 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                      >
                        Record Payment
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* EXPENSES TAB */}
          {activeTab === "expenses" && (
            <div className="space-y-4">
              {!showExpenseForm ? (
                <button
                  onClick={() => setShowExpenseForm(true)}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-green-600 text-sm font-medium hover:bg-green-50 transition"
                >
                  + Add Expense
                </button>
              ) : (
                <div className="border rounded-lg p-3 space-y-3">
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Description *"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Amount *"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 text-sm"
                    step="0.01"
                  />
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm"
                  />
                  <textarea
                    placeholder="Notes (optional)"
                    value={expenseForm.notes}
                    onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowExpenseForm(false)} className="flex-1 py-2 border rounded-lg text-sm">
                      Cancel
                    </button>
                    <button onClick={addExpense} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">
                      {saving ? "Adding..." : "Add Expense"}
                    </button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No expenses recorded</div>
              ) : (
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
                              <input
                                type="text"
                                defaultValue={exp.description}
                                onBlur={(e) => updateExpense(exp.id, exp.amount, e.target.value)}
                                className="flex-1 border rounded-lg p-1 text-sm"
                              />
                              <input
                                type="number"
                                defaultValue={exp.amount}
                                onBlur={(e) => updateExpense(exp.id, Number(e.target.value), exp.description)}
                                className="w-24 border rounded-lg p-1 text-sm"
                                step="0.01"
                              />
                              <button onClick={() => setEditingExpense(null)} className="text-green-600">
                                <Check size={16} />
                              </button>
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
                          <button onClick={() => setEditingExpense(exp.id)} className="text-gray-400 hover:text-blue-500">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => deleteExpense(exp.id)} className="text-gray-400 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-sm font-semibold text-red-600 pt-2">
                    Total Expenses: {formatCurrency(totalExpenses)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AGENTS TAB */}
{activeTab === "agents" && (
  <div className="space-y-4">
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-700">Add Agent</label>
        <button onClick={() => setShowNewAgentForm(!showNewAgentForm)} className="text-xs text-blue-600">
          + New Agent
        </button>
      </div>

      {showNewAgentForm && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
          <input
            type="text"
            placeholder="Name *"
            value={newAgent.name}
            onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
            className="w-full border rounded-lg p-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={newAgent.email}
            onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
            className="w-full border rounded-lg p-2 text-sm"
          />
          <input
            type="tel"
            placeholder="Phone"
            value={newAgent.phone}
            onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
            className="w-full border rounded-lg p-2 text-sm"
          />
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowNewAgentForm(false)} className="flex-1 py-2 border rounded-lg text-sm">
              Cancel
            </button>
            <button onClick={createAgent} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">
              Create
            </button>
          </div>
        </div>
      )}

      <select
        value={selectedAgentId}
        onChange={(e) => setSelectedAgentId(e.target.value)}
        className="w-full border rounded-lg p-2 text-sm mb-2"
      >
        <option value="">Select agent...</option>
        {agents
          .filter((a) => !assignedAgents.some((assigned) => assigned.agent_id === a.id))
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
      </select>

      <div className="flex gap-2">
        <button onClick={assignAgent} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">
          Add Agent
        </button>
      </div>
      <textarea
        placeholder="Notes (optional)"
        value={agentNotes}
        onChange={(e) => setAgentNotes(e.target.value)}
        className="w-full mt-2 border rounded-lg p-2 text-sm"
        rows={1}
      />
    </div>

    {loading ? (
      <div className="text-center py-8 text-gray-400">Loading...</div>
    ) : assignedAgents.length === 0 ? (
      <div className="text-center py-8 text-gray-400">No agents assigned</div>
    ) : (
      <>
        {/* Split Evenly Button */}
        {assignedAgents.length > 0 && remainingForAgents > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-blue-800">Split Remaining Amount</div>
                <div className="text-xs text-blue-600">
                  {formatCurrency(remainingForAgents)} to split among {assignedAgents.length} agents
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Split ${formatCurrency(remainingForAgents)} evenly among ${assignedAgents.length} agents?`)) return;
                  
                  const equalShare = remainingForAgents / assignedAgents.length;
                  
                  for (const agent of assignedAgents) {
                    await supabase
                      .from("estimate_agents")
                      .update({ amount: equalShare })
                      .eq("id", agent.id);
                  }
                  
                  await loadAllData();
                  onRefresh();
                  alert(`Split ${formatCurrency(remainingForAgents)} evenly among ${assignedAgents.length} agents!`);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Split Evenly
              </button>
            </div>
            <div className="text-xs text-blue-500 mt-2">
              Each agent gets: {formatCurrency(remainingForAgents / assignedAgents.length)}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {assignedAgents.map((agent) => (
            <div key={agent.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{agent.agents?.name}</div>
                  {editingAgent === agent.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        value={editAgentAmount}
                        onChange={(e) => setEditAgentAmount(Number(e.target.value))}
                        className="w-28 border rounded-lg p-1 text-sm"
                        step="0.01"
                        autoFocus
                      />
                      <button onClick={() => updateAgentAmount(agent.id, editAgentAmount)} className="text-green-600">
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditingAgent(null)} className="text-gray-400">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-green-700">Earns: {formatCurrency(agent.amount || 0)}</span>
                      <button
                        onClick={() => {
                          setEditingAgent(agent.id);
                          setEditAgentAmount(agent.amount || 0);
                        }}
                        className="text-gray-400 hover:text-blue-500"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  {agent.notes && <div className="text-xs text-gray-400 mt-1">{agent.notes}</div>}
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">Paid: {formatCurrency(agent.paid_amount || 0)}</span>
                    <button
                      onClick={() => {
                        setSelectedAgentForHistory(agent);
                        loadAgentPayments(agent.agent_id);
                        setShowAgentPaymentHistory(true);
                      }}
                      className="text-xs text-blue-500 hover:text-blue-600"
                    >
                      View History
                    </button>
                  </div>
                  
                  {(agent.amount || 0) > (agent.paid_amount || 0) && (
                    <div className="text-xs text-amber-600 mt-1">
                      Owed: {formatCurrency((agent.amount || 0) - (agent.paid_amount || 0))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setSelectedAgentForPayment(agent);
                      setAgentPaymentAmount((agent.amount || 0) - (agent.paid_amount || 0));
                      setShowAgentPaymentModal(true);
                    }}
                    className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                    disabled={(agent.amount || 0) - (agent.paid_amount || 0) <= 0}
                  >
                    Pay
                  </button>
                  <button onClick={() => removeAgentAssignment(agent.id)} className="text-red-500 text-sm px-2">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {assignedAgents.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total Commission:</span>
              <span className="text-green-700">
                {formatCurrency(totalAgentAssigned)} / {formatCurrency(remainingForAgents)}
              </span>
            </div>
            {remainingToDistribute !== 0 && (
              <div className="text-xs text-orange-600 mt-1">Remaining: {formatCurrency(remainingToDistribute)}</div>
            )}
          </div>
        )}
      </>
    )}
  </div>
)}
        </div>
      </div>

      {/* Subcontractor Payment Modal */}
      {showSubPaymentModal && selectedSub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="border-b px-5 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Record Payment - {selectedSub.subcontractors?.name}</h3>
              <button onClick={() => setShowSubPaymentModal(false)} className="p-1 text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="number"
                  value={subPaymentAmount}
                  onChange={(e) => setSubPaymentAmount(Number(e.target.value))}
                  className="w-full border rounded-lg p-2"
                  step="0.01"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Method</label>
                <select
                  value={subPaymentMethod}
                  onChange={(e) => setSubPaymentMethod(e.target.value)}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowSubPaymentModal(false)} className="flex-1 py-2 border rounded-lg">
                  Cancel
                </button>
                <button onClick={recordSubPayment} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg disabled:opacity-50">
                  {saving ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


{/* Agent Payment History Modal */}
{showAgentPaymentHistory && selectedAgentForHistory && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[65] p-4">
    <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Payment History - {selectedAgentForHistory.agents?.name}</h3>
        <button onClick={() => setShowAgentPaymentHistory(false)} className="p-1 text-gray-400">
          <X size={20} />
        </button>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex justify-between text-sm">
            <span>Total Earned:</span>
            <span className="font-semibold text-green-700">{formatCurrency(selectedAgentForHistory.amount || 0)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span>Total Paid:</span>
            <span className="font-semibold text-blue-600">{formatCurrency(selectedAgentForHistory.paid_amount || 0)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span>Remaining:</span>
            <span className="font-semibold text-amber-600">{formatCurrency((selectedAgentForHistory.amount || 0) - (selectedAgentForHistory.paid_amount || 0))}</span>
          </div>
        </div>
        
        {agentPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No payments recorded</div>
        ) : (
          <div className="space-y-2">
            {agentPayments.map((payment) => (
              <div key={payment.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {editingAgentPayment === payment.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">$</span>
                        <input
                          type="number"
                          value={editPaymentAmount}
                          onChange={(e) => setEditPaymentAmount(Number(e.target.value))}
                          className="w-28 border rounded-lg p-1 text-sm"
                          step="0.01"
                          autoFocus
                        />
                        <button
                          onClick={() => updateAgentPayment(payment.id, editPaymentAmount, selectedAgentForHistory.agent_id, payment.amount)}
                          className="text-green-600"
                        >
                          <Check size={16} />
                        </button>
                        <button onClick={() => setEditingAgentPayment(null)} className="text-gray-400">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="font-medium">{formatCurrency(payment.amount)}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {payment.payment_method} • {new Date(payment.payment_date).toLocaleDateString()}
                    </div>
                    {payment.notes && <div className="text-xs text-gray-400 mt-1">{payment.notes}</div>}
                  </div>
                  {editingAgentPayment !== payment.id && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingAgentPayment(payment.id);
                          setEditPaymentAmount(payment.amount);
                        }}
                        className="text-gray-400 hover:text-blue-500"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => deleteAgentPayment(payment.id, payment.amount, selectedAgentForHistory.agent_id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
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

      {/* Agent Payment Modal */}
{showAgentPaymentModal && selectedAgentForPayment && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-xl w-full max-w-md">
      <div className="border-b px-5 py-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pay Agent - {selectedAgentForPayment.agents?.name}</h3>
        <button onClick={() => setShowAgentPaymentModal(false)} className="p-1 text-gray-400">
          <X size={20} />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
          <input
            type="number"
            value={agentPaymentAmount}
            onChange={(e) => setAgentPaymentAmount(Number(e.target.value))}
            className="w-full border rounded-lg p-2"
            step="0.01"
            placeholder="0.00"
            autoFocus
          />
          <div className="text-xs text-gray-400 mt-1">Earns: {formatCurrency(selectedAgentForPayment.amount || 0)}</div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Payment Method</label>
          <select
            value={agentPaymentMethod}
            onChange={(e) => setAgentPaymentMethod(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="venmo">Venmo</option>
            <option value="zelle">Zelle</option>
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => setShowAgentPaymentModal(false)} className="flex-1 py-2 border rounded-lg">
            Cancel
          </button>
          <button onClick={recordAgentPayment} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg disabled:opacity-50">
            {saving ? "Processing..." : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}