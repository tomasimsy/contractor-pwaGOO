"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { X, Trash2 } from "lucide-react";
import { getCompanyId } from "@/lib/supabase/getCompanyId"; // 👈 import
import toast from "react-hot-toast";


type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  notes: string;
};

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateId: string;
  onRefresh: () => void;
}

const EXPENSE_CATEGORIES = [
  { value: "materials", label: "Materials", icon: "🔨", color: "bg-blue-100 text-blue-700" },
  { value: "equipment", label: "Equipment", icon: "🔧", color: "bg-purple-100 text-purple-700" },
  { value: "permits", label: "Permits", icon: "📋", color: "bg-orange-100 text-orange-700" },
  { value: "travel", label: "Travel", icon: "🚗", color: "bg-cyan-100 text-cyan-700" },
  { value: "labor", label: "Labor", icon: "👷", color: "bg-green-100 text-green-700" },
  { value: "rental", label: "Equipment Rental", icon: "🏗️", color: "bg-yellow-100 text-yellow-700" },
  { value: "other", label: "Other", icon: "📦", color: "bg-gray-100 text-gray-700" },
];

export default function ExpenseModal({ isOpen, onClose, estimateId, onRefresh }: ExpenseModalProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    category: "materials",
    description: "",
    amount: 0,
    expense_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Fetch company_id once when modal opens
  useEffect(() => {
    const fetchCompany = async () => {
      const cid = await getCompanyId();
      setCompanyId(cid);
    };
    if (isOpen) fetchCompany();
  }, [isOpen]);

  // Load expenses only when modal opens and we have companyId
  useEffect(() => {
    if (isOpen && companyId) {
      loadExpenses();
    }
  }, [isOpen, companyId]);

  async function loadExpenses() {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("estimate_expenses")
      .select("*")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId) // 👈 filter by company
      .order("expense_date", { ascending: false });
    if (error) {
      console.error("Load expenses error:", error);
      toast.error("Failed to load expenses");
    } else {
      setExpenses(data || []);
    }
    setLoading(false);
  }

  async function addExpense() {
    if (formData.amount <= 0) {
      alert("Enter an amount");
      return;
    }
    if (!formData.description.trim()) {
      alert("Enter a description");
      return;
    }
    if (!companyId) {
      toast.error("Company not found");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("estimate_expenses").insert({
      estimate_id: estimateId,
      category: formData.category,
      description: formData.description,
      amount: formData.amount,
      expense_date: formData.expense_date,
      notes: formData.notes || null,
      company_id: companyId, // 👈 add company_id
    });

    if (error) {
      console.error("Add expense error:", error);
      toast.error("Error adding expense");
    } else {
      setShowAddForm(false);
      setFormData({
        category: "materials",
        description: "",
        amount: 0,
        expense_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      loadExpenses();
      onRefresh();
      toast.success("Expense added");
    }
    setSaving(false);
  }

  async function deleteExpense(id: string) {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    if (confirm("Delete this expense?")) {
      const { error } = await supabase
        .from("estimate_expenses")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId); // 👈 filter by company
      if (error) {
        console.error("Delete error:", error);
        toast.error("Error deleting expense");
      } else {
        loadExpenses();
        onRefresh();
        toast.success("Expense deleted");
      }
    }
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Business Expenses</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Total Expenses Card */}
          <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Expenses</span>
            <span className="text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</span>
          </div>

          {/* Add Expense Button */}
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-green-600 text-sm font-medium hover:bg-green-50 transition">
              + Add Expense
            </button>
          ) : (
            <div className="border rounded-lg p-3 space-y-3">
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full border rounded-lg p-2 text-sm">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                ))}
              </select>
              <input type="text" placeholder="Description *" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
              <input type="number" placeholder="Amount *" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} className="w-full border rounded-lg p-2 text-sm" step="0.01" />
              <input type="date" value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
              <textarea placeholder="Notes (optional)" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full border rounded-lg p-2 text-sm" rows={2} />
              <div className="flex gap-2">
                <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                <button onClick={addExpense} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">{saving ? "Adding..." : "Add Expense"}</button>
              </div>
            </div>
          )}

          {/* Expenses List */}
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No expenses recorded</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {expenses.map((exp) => {
                const category = EXPENSE_CATEGORIES.find(c => c.value === exp.category);
                return (
                  <div key={exp.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${category?.color}`}>
                            {category?.icon} {category?.label}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(exp.expense_date).toLocaleDateString()}</span>
                        </div>
                        <div className="font-medium text-gray-800">{exp.description}</div>
                        <div className="text-sm font-semibold text-red-600 mt-1">{formatCurrency(exp.amount)}</div>
                        {exp.notes && <div className="text-xs text-gray-500 mt-1">{exp.notes}</div>}
                      </div>
                      <button onClick={() => deleteExpense(exp.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}