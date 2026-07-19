"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { X, Trash2, Edit2, Check, DollarSign, AlertCircle } from "lucide-react";

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
  notes: string;
  subcontractor_id: string;
  subcontractors?: Subcontractor;
};

type Payment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes: string;
};

interface SubcontractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateId: string;
  onRefresh: () => void;
}

export default function SubcontractorModal({ isOpen, onClose, estimateId, onRefresh }: SubcontractorModalProps) {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [assignedSubs, setAssignedSubs] = useState<AssignedSub[]>([]);
  const [showNewSubForm, setShowNewSubForm] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [subAmount, setSubAmount] = useState<number | null>(null);
  const [subNotes, setSubNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  
  // Payment modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignedSub | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  
  // New subcontractor form
  const [newSub, setNewSub] = useState({
    name: "",
    company_name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: subs } = await supabase.from("subcontractors").select("*").order("name");
      if (subs) setSubcontractors(subs);
      
      const { data: assigned } = await supabase
        .from("estimate_subcontractors")
        .select("*, subcontractors(*)")
        .eq("estimate_id", estimateId);
      if (assigned) setAssignedSubs(assigned);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createSubcontractor() {
    if (!newSub.name.trim()) {
      alert("Name is required");
      return;
    }
    
    const { data, error } = await supabase
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
    } else {
      alert("Error creating subcontractor");
    }
  }

  async function assignSubcontractor() {
    if (!selectedSubId) {
      alert("Select a subcontractor");
      return;
    }
    
    const alreadyAssigned = assignedSubs.some(s => s.subcontractor_id === selectedSubId);
    if (alreadyAssigned) {
      alert("This subcontractor is already assigned");
      return;
    }
    
    const amountToSave = subAmount && subAmount > 0 ? subAmount : 0;
    
   // Insert into estimate_subcontractors
  const { data: newAssignment, error: assignError } = await supabase
    .from("estimate_subcontractors")
    .insert({
      estimate_id: estimateId,
      subcontractor_id: selectedSubId,
      amount: amountToSave,
      notes: subNotes || null,
    })
    .select()
    .single();
  
  if (assignError) {
    alert("Error: " + assignError.message);
    return;
  }
  
  // ALSO record a payment if amount was entered
  if (amountToSave > 0 && newAssignment) {
    const { error: paymentError } = await supabase
      .from("subcontractor_payments")
      .insert({
        estimate_subcontractor_id: newAssignment.id,
        amount: amountToSave,
        payment_method: "cash",
      });
    
    if (paymentError) {
      console.error("Payment record error:", paymentError);
    } else {
      console.log("Payment recorded for:", amountToSave);
    }
  }
  
  setSelectedSubId("");
  setSubAmount(null);
  setSubNotes("");
  loadData();
  onRefresh(); // This will update subcontractorPaid in parent
  alert(amountToSave > 0 ? "Subcontractor assigned and payment recorded!" : "Subcontractor assigned");
}

  async function updateAssignmentAmount(assignmentId: string, newAmount: number) {
    if (newAmount < 0) {
      alert("Amount cannot be negative");
      return;
    }
    
    const { error } = await supabase
      .from("estimate_subcontractors")
      .update({ amount: newAmount })
      .eq("id", assignmentId);
    
    if (!error) {
      setEditingAssignment(null);
      loadData();
      onRefresh();
    } else {
      alert("Error updating amount");
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm("Remove this subcontractor from this estimate?")) return;
    
    const { error } = await supabase
      .from("estimate_subcontractors")
      .delete()
      .eq("id", assignmentId);
    
    if (!error) {
      loadData();
      onRefresh();
    }
  }

  async function clearAllAmounts() {
    if (!confirm("Set all subcontractor amounts to $0?")) return;
    
    for (const sub of assignedSubs) {
      await supabase
        .from("estimate_subcontractors")
        .update({ amount: 0 })
        .eq("id", sub.id);
    }
    
    loadData();
    onRefresh();
    setShowClearAllConfirm(false);
  }

  async function deleteAllAssignments() {
    if (!confirm("WARNING: Remove ALL subcontractors from this estimate?")) return;
    
    for (const sub of assignedSubs) {
      await supabase
        .from("estimate_subcontractors")
        .delete()
        .eq("id", sub.id);
    }
    
    loadData();
    onRefresh();
  }

  async function loadPayments(assignmentId: string) {
    const { data } = await supabase
      .from("subcontractor_payments")
      .select("*")
      .eq("estimate_subcontractor_id", assignmentId)
      .order("payment_date", { ascending: false });
    
    if (data) setPayments(data);
  }

  async function recordPayment() {
    if (!selectedAssignment) return;
    if (paymentAmount <= 0) {
      alert("Enter a valid amount");
      return;
    }
    console.log("Recording payment of:", paymentAmount);
    setSaving(true);
    
    try {
      const { error: paymentError } = await supabase
        .from("subcontractor_payments")
        .insert({
          estimate_subcontractor_id: selectedAssignment.id,
          amount: paymentAmount,
          payment_method: paymentMethod,
        });
      
      if (paymentError) throw paymentError;
      
      const newTotal = (selectedAssignment.amount || 0) + paymentAmount;
      await supabase
        .from("estimate_subcontractors")
        .update({ amount: newTotal })
        .eq("id", selectedAssignment.id);
      
      setShowPaymentModal(false);
      setPaymentAmount(0);
      setPaymentMethod("cash");
      loadData();
      onRefresh();
      alert(`Payment of ${formatCurrency(paymentAmount)} recorded!`);
    } catch (err) {
      alert("Error recording payment");
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(paymentId: string, amount: number) {
    if (!confirm("Delete this payment?")) return;
    
    try {
      await supabase.from("subcontractor_payments").delete().eq("id", paymentId);
      
      const newTotal = (selectedAssignment?.amount || 0) - amount;
      await supabase
        .from("estimate_subcontractors")
        .update({ amount: Math.max(0, newTotal) })
        .eq("id", selectedAssignment?.id);
      
      loadPayments(selectedAssignment!.id);
      loadData();
      onRefresh();
    } catch (err) {
      alert("Error deleting payment");
    }
  }

  const totalAssigned = assignedSubs.reduce((sum, a) => sum + (a.amount || 0), 0);
  const hasAnyAmounts = assignedSubs.some(s => (s.amount || 0) > 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Subcontractors</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Cost</span>
              <span className="text-xl font-bold text-gray-800">{formatCurrency(totalAssigned)}</span>
            </div>
            {assignedSubs.length > 0 && (
              <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
                {hasAnyAmounts && (
                  <button onClick={() => setShowClearAllConfirm(true)} className="flex-1 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition flex items-center justify-center gap-1">
                    <AlertCircle size={12} /> Clear All
                  </button>
                )}
                <button onClick={deleteAllAssignments} className="flex-1 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition flex items-center justify-center gap-1">
                  <Trash2 size={12} /> Remove All
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Assign Subcontractor</label>
              <button onClick={() => setShowNewSubForm(!showNewSubForm)} className="text-xs text-green-600">+ New</button>
            </div>
            
            {showNewSubForm && (
  <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">

    <input
      type="text"
      placeholder="Name *"
      value={newSub.name}
      onChange={(e) =>
        setNewSub({ ...newSub, name: e.target.value })
      }
      className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
    />

    <input
      type="text"
      placeholder="Company Name"
      value={newSub.company_name}
      onChange={(e) =>
        setNewSub({ ...newSub, company_name: e.target.value })
      }
      className="w-full border rounded-lg p-2 text-sm"
    />

    <input
      type="tel"
      placeholder="Phone"
      value={newSub.phone}
      onChange={(e) =>
        setNewSub({ ...newSub, phone: e.target.value })
      }
      className="w-full border rounded-lg p-2 text-sm"
    />

    <input
      type="email"
      placeholder="Email"
      value={newSub.email}
      onChange={(e) =>
        setNewSub({ ...newSub, email: e.target.value })
      }
      className="w-full border rounded-lg p-2 text-sm"
    />

    <div className="flex gap-2">
      <button
        onClick={() => setShowNewSubForm(false)}
        className="flex-1 py-2 border rounded-lg text-sm"
      >
        Cancel
      </button>

      <button
        onClick={createSubcontractor}
        className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800 transition"
      >
        Create
      </button>
    </div>
  </div>
)}
            
            <select value={selectedSubId} onChange={(e) => setSelectedSubId(e.target.value)} className="w-full border rounded-lg p-2 text-sm mb-2">
              <option value="">Select subcontractor...</option>
              {subcontractors.filter(s => !assignedSubs.some(a => a.subcontractor_id === s.id)).map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
            
            <div className="flex gap-2 mb-2">
              <input type="number" placeholder="Amount (optional)" value={subAmount === null ? "" : subAmount} onChange={(e) => setSubAmount(e.target.value === "" ? null : Number(e.target.value))} className="flex-1 border rounded-lg p-2 text-sm" step="0.01" />
              <button onClick={assignSubcontractor} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">Assign</button>
            </div>
            
            <p className="text-[10px] text-gray-400 mb-1">Leave amount blank to add later</p>
            <textarea placeholder="Notes (optional)" value={subNotes} onChange={(e) => setSubNotes(e.target.value)} className="w-full border rounded-lg p-2 text-sm" rows={1} />
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
                      {sub.subcontractors?.company_name && <div className="text-xs text-gray-500">{sub.subcontractors.company_name}</div>}
                      
                      {editingAssignment === sub.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm text-gray-500">$</span>
                          <input type="number" value={editAmount} onChange={(e) => setEditAmount(Number(e.target.value))} className="w-28 border rounded-lg p-1 text-sm" step="0.01" autoFocus />
                          <button onClick={() => updateAssignmentAmount(sub.id, editAmount)} className="text-green-600"><Check size={16} /></button>
                          <button onClick={() => setEditingAssignment(null)} className="text-gray-400"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-sm font-semibold ${(sub.amount || 0) === 0 ? 'text-gray-400' : 'text-green-700'}`}>
                            {(sub.amount || 0) === 0 ? 'No amount set' : formatCurrency(sub.amount || 0)}
                          </span>
                          <button onClick={() => { setEditingAssignment(sub.id); setEditAmount(sub.amount || 0); }} className="text-gray-400 hover:text-blue-500"><Edit2 size={12} /></button>
                          {(sub.amount || 0) > 0 && <button onClick={() => updateAssignmentAmount(sub.id, 0)} className="text-gray-400 hover:text-red-500 text-xs">Clear</button>}
                        </div>
                      )}
                      {sub.notes && <div className="text-xs text-gray-400 mt-1">{sub.notes}</div>}
                    </div>
                    <button onClick={() => removeAssignment(sub.id)} className="text-red-500 text-sm px-2">✕</button>
                  </div>
                  
                  <button onClick={() => { setSelectedAssignment(sub); loadPayments(sub.id); setShowPaymentModal(true); }} className="w-full mt-2 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition flex items-center justify-center gap-1">
                    <DollarSign size={12} /> Record Payment
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showClearAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[65] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold mb-2">Clear All Amounts?</h3>
            <p className="text-sm text-gray-500 mb-4">Set all subcontractor amounts to $0?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearAllConfirm(false)} className="flex-1 py-2 border rounded-lg">Cancel</button>
              <button onClick={clearAllAmounts} className="flex-1 py-2 bg-yellow-600 text-white rounded-lg">Clear All</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="border-b px-5 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Record Payment - {selectedAssignment.subcontractors?.name}</h3>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {payments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Payment History</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center bg-white rounded-lg p-2 border">
                        <div><div className="font-medium">{formatCurrency(p.amount)}</div><div className="text-xs text-gray-500">{p.payment_method} • {new Date(p.payment_date).toLocaleDateString()}</div></div>
                        <button onClick={() => deletePayment(p.id, p.amount)} className="text-red-500 text-xs">Delete</button>
                      </div>
                    ))}
                    <div className="text-right text-sm font-medium text-green-600 pt-1">Total Paid: {formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0))}</div>
                  </div>
                </div>
              )}
              <div><label className="block text-sm font-medium mb-1">Amount</label><input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} className="w-full border rounded-lg p-2" step="0.01" placeholder="0.00" autoFocus /></div>
              <div><label className="block text-sm font-medium mb-1">Payment Method</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border rounded-lg p-2"><option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank Transfer</option><option value="credit_card">Credit Card</option></select></div>
              <div className="flex gap-2 pt-2"><button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 border rounded-lg">Cancel</button><button onClick={recordPayment} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg disabled:opacity-50">{saving ? "Recording..." : "Record Payment"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}