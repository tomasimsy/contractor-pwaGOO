"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate, Client, Project, LineItem, Signature } from "@/types";
import { formatCurrency } from "@/lib/utils/formatting";
import { calculateSubtotal, calculateTax, calculateTotal } from "@/lib/utils/calculations";
import Header from "@/components/ui/Header";
import SignaturePad from "@/components/signature/SignaturePad";
 import ProjectFinancialsModal from "@/components/ProjectFinancialsModal";
import ExpenseModal from "@/components/ExpenseModal";
import Link from "next/link";
import { SquarePen, Send, FileText, Users, Receipt, DollarSign } from "lucide-react";

type ProjectWithItems = {
  id: string;
  name: string;
  description: string;
  items: LineItem[];
};

export default function EstimatePage() {
  const router = useRouter();
  const { id } = useParams();
  
  // Core state
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<ProjectWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  
  // Modal states
   const [showExpenseModal, setShowExpenseModal] = useState(false);
   const [showFinancialsModal, setShowFinancialsModal] = useState(false);
  // Financial tracking
  const [subcontractorPaid, setSubcontractorPaid] = useState(0);
  
  // Target total state
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetTotal, setTargetTotal] = useState<number | null>(null);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMarkup, setEditMarkup] = useState(0);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editTaxRate, setEditTaxRate] = useState(0);
  const [editProjects, setEditProjects] = useState<ProjectWithItems[]>([]);
  const [saving, setSaving] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const newItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Load all data
  useEffect(() => {
    loadEstimate();
    loadSubcontractorPaid();
  }, [id]);

  // Auto-scroll to newly added item
  useEffect(() => {
    if (lastAddedItemId && newItemRefs.current[lastAddedItemId]) {
      newItemRefs.current[lastAddedItemId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      const element = newItemRefs.current[lastAddedItemId];
      element?.classList.add("bg-green-50", "transition-all", "duration-500");
      setTimeout(() => {
        element?.classList.remove("bg-green-50");
      }, 1000);
      setLastAddedItemId(null);
    }
  }, [lastAddedItemId]);

  // Click outside handler for FAB
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setFabOpen(false);
      }
    };
    if (fabOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [fabOpen]);

  // Load subcontractor paid amount
async function loadSubcontractorPaid() {
  const { data } = await supabase
    .from("subcontractor_payments")
    .select("amount")
    .eq("estimate_id", id);
  
  if (data) {
    const total = data.reduce((sum, p) => sum + (p.amount || 0), 0);
    setSubcontractorPaid(total);
    console.log("🔵 loadSubcontractorPaid - Total paid to subcontractors:", total);
   }
}

  // Load estimate data
  async function loadEstimate() {
    try {
      const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .single();
      setEstimate(est);

      setEditDescription(est?.description || "");
      setEditNotes(est?.notes || "");
      setEditMarkup(est?.markup || 0);
      setEditDiscount(est?.discount || 0);
      setEditTaxRate(est?.tax_rate || 0);

      if (est?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("*")
          .eq("id", est.client_id)
          .single();
        setClient(c);
      }

      const { data: items } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id);

      const projectMap: Record<string, ProjectWithItems> = {};
      items?.forEach((item) => {
        const projectName = item.project_name || "Main Project";
        if (!projectMap[projectName]) {
          projectMap[projectName] = {
            id: crypto.randomUUID(),
            name: projectName,
            description: item.project_description || "",
            items: [],
          };
        }
        projectMap[projectName].items.push(item);
      });
      const projectsArray = Object.values(projectMap);
      setProjects(projectsArray);
      setEditProjects(JSON.parse(JSON.stringify(projectsArray)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Signature functions
  const saveSignature = async (signature: Signature) => {
    const { error } = await supabase
      .from("estimates")
      .update({ signature, status: "approved" })
      .eq("id", id);
    if (!error) {
      setEstimate({ ...estimate, signature } as Estimate);
      alert("Signature saved!");
    }
  };

const removeSignature = async () => {
  if (!confirm("Remove the signature? The estimate will need to be resigned.")) return;
  
  const { error } = await supabase
    .from("estimates")
    .update({ signature: null, status: "pending" })
    .eq("id", id);
  
  if (!error) {
    setEstimate((prev) => (prev ? { ...prev, signature: null, status: "pending" } : prev));
    alert("Signature removed. Customer will need to sign again.");
    loadEstimate();
  } else {
    alert("Error removing signature");
  }
};

  // Edit mode functions
  const addEditItem = (projectId: string) => {
    const newItem = {
      id: crypto.randomUUID(),
      category: "Material" as "Material",
      name: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      taxable: false,
      total: 0,
    };
    setEditProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, items: [...project.items, newItem] } : project
      )
    );
    setLastAddedItemId(newItem.id);
  };

  const updateEditItem = (projectId: string, itemId: string, field: string, value: any) => {
    setEditProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          items: project.items.map((item) => {
            if (item.id !== itemId) return item;
            const updated = { ...item, [field]: value };
            if (field === "quantity" || field === "unit_price") {
              updated.total = updated.quantity * updated.unit_price;
            }
            return updated;
          }),
        };
      })
    );
  };

  const removeEditItem = (projectId: string, itemId: string) => {
    setEditProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const newItems = project.items.filter((item) => item.id !== itemId);
        return { ...project, items: newItems.length ? newItems : [{ ...createEmptyItem() }] };
      })
    );
  };

  const createEmptyItem = (): LineItem => ({
    id: crypto.randomUUID(),
    category: "Material",
    name: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    taxable: false,
    total: 0,
  });

  const distributeToTargetTotal = () => {
    if (!targetTotal || targetTotal <= 0) {
      alert("Please enter a valid target total");
      return;
    }

    const currentTotal = editSubtotal;
    const difference = targetTotal - currentTotal;

    if (difference === 0) {
      alert("Target total is already equal to current total");
      return;
    }

    const allLineItems = editProjects.flatMap((p) => p.items);
    if (allLineItems.length === 0) {
      alert("No items to distribute to");
      return;
    }

    const distributionPerItem = difference / allLineItems.length;

    const updatedProjects = editProjects.map((project) => ({
      ...project,
      items: project.items.map((item) => {
        const newUnitPrice = Math.max(0, item.unit_price + distributionPerItem);
        return {
          ...item,
          unit_price: newUnitPrice,
          total: item.quantity * newUnitPrice,
        };
      }),
    }));

    setEditProjects(updatedProjects);
    setTargetTotal(null);
    setShowTargetModal(false);
    alert(`Total updated to ${formatCurrency(targetTotal)}`);
  };

  const addProject = () => {
    setEditProjects((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        items: [createEmptyItem()],
      },
    ]);
  };

  const removeProject = (projectId: string) => {
    if (editProjects.length === 1) return;
    setEditProjects((prev) => prev.filter((project) => project.id !== projectId));
  };

  const updateProject = (projectId: string, field: string, value: any) => {
    setEditProjects((prev) =>
      prev.map((project) => (project.id === projectId ? { ...project, [field]: value } : project))
    );
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const allItems = editProjects.flatMap((p) => p.items);
      const subtotal = calculateSubtotal(allItems);
      const tax = calculateTax(subtotal, editTaxRate);
      const total = calculateTotal(subtotal, editMarkup, editDiscount, tax);

      const { error: updateError } = await supabase
        .from("estimates")
        .update({
          description: editDescription || null,
          notes: editNotes || null,
          markup: editMarkup,
          discount: editDiscount,
          tax_rate: editTaxRate,
          subtotal: subtotal,
          total: total,
        })
        .eq("id", id);

      if (updateError) throw updateError;

      await supabase.from("estimate_items").delete().eq("estimate_id", id);

      const itemsToInsert = editProjects.flatMap((project) =>
        project.items.map((item) => ({
          estimate_id: id,
          project_name: project.name,
          category: item.category,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          taxable: item.taxable,
          total: item.quantity * item.unit_price,
        }))
      );

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from("estimate_items").insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      alert("Estimate updated successfully!");
      setIsEditMode(false);
      loadEstimate();
    } catch (err) {
      console.error(err);
      alert("Error saving changes");
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  const viewSubtotal = calculateSubtotal(projects.flatMap((p) => p.items));
  const viewTax = calculateTax(viewSubtotal, estimate?.tax_rate || 0);
  const viewTotal = calculateTotal(viewSubtotal, estimate?.markup || 0, estimate?.discount || 0, viewTax);

  const editAllItems = editProjects.flatMap((p) => p.items);
  const editSubtotal = calculateSubtotal(editAllItems);
  const editTax = calculateTax(editSubtotal, editTaxRate);
  const editTotal = calculateTotal(editSubtotal, editMarkup, editDiscount, editTax);

  // Send SMS
  const sendSMSLink = async () => {
    let currentClient = client;
    if (!currentClient?.phone && estimate?.client_id) {
      const { data: freshClient } = await supabase
        .from("clients")
        .select("*")
        .eq("id", estimate.client_id)
        .single();
      if (freshClient) {
        currentClient = freshClient;
        setClient(freshClient);
      }
    }
    const phoneNumber = currentClient?.phone;
    if (!phoneNumber) {
      alert("No phone number on file. Please add a phone number to this client first.");
      return;
    }
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/estimates/${id}`;
    const totalAmount = projects.reduce(
      (sum, p) => sum + p.items.reduce((s, i) => s + (i.total || 0), 0),
      0
    );
    const message = encodeURIComponent(
      `Hello ${currentClient?.name || "Customer"}! Please review and sign your estimate: ${documentUrl}\n\n` +
        `Estimate #${estimate?.estimate_number}\n` +
        `Total: $${totalAmount.toFixed(2)}\n\n` +
        `Click the link above to view and sign. Thank you!`
    );
    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };

  // Convert to invoice
  const convertToInvoice = async () => {
    if (!estimate) return;
    if (!confirm("Convert this estimate to an invoice? This will lock the estimate.")) return;
    setConverting(true);

    try {
      const invoiceNumber = estimate.estimate_number;
      const { data: items, error: itemsFetchError } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id);

      if (itemsFetchError || !items || items.length === 0) {
        alert("No items found on this estimate");
        setConverting(false);
        return;
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          estimate_id: id,
          client_id: estimate.client_id,
          invoice_number: invoiceNumber,
          description: estimate.description,
          subtotal: viewSubtotal,
          markup: estimate.markup || 0,
          discount: estimate.discount || 0,
          tax: viewTax,
          total: viewTotal,
          remaining_balance: viewTotal,
          amount_paid: 0,
          notes: estimate.notes,
          signature: estimate.signature,
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const itemsToCopy = items.map((item) => ({
        invoice_id: invoice.id,
        project_name: item.project_name || "Main Project",
        category: item.category,
        name: item.name,
        description: item.description || "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        taxable: item.taxable,
        total: item.total,
      }));

      await supabase.from("invoice_items").insert(itemsToCopy);
      await supabase.from("estimates").update({ status: "converted", invoice_id: invoice.id }).eq("id", id);

      alert("Invoice created successfully!");
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      console.error(err);
      alert("Error creating invoice");
    } finally {
      setConverting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Target Total Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Set Target Total</h3>
            <p className="text-xs text-gray-500 mb-3">Current: {formatCurrency(editTotal)}</p>
            <input
              type="number"
              value={targetTotal || ""}
              onChange={(e) => setTargetTotal(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg p-2 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Enter desired total"
              step="0.01"
              autoFocus
            />
            <div className="text-[11px] text-gray-400 mb-4">
              Difference will be split across {editProjects.flatMap((p) => p.items).length} items
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTargetModal(false)} className="flex-1 py-2 border rounded-lg">Cancel</button>
              <button onClick={distributeToTargetTotal} className="flex-1 py-2 bg-green-700 text-white rounded-lg">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="text-gray-600 text-xl">←</button>
          <h1 className="text-base font-semibold text-gray-800">
            Estimate #{estimate?.estimate_number || id?.slice(0, 8)}
          </h1>
          {!isEditMode && !estimate?.signature && estimate?.status !== "converted" && (
            <button onClick={() => setIsEditMode(true)} className="text-green-700 text-lg">✏️</button>
          )}
        </div>
      </div>

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="sticky top-14 z-20 mx-auto mt-3 max-w-4xl px-4">
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
            <div className="text-xs font-medium text-amber-700">Editing Estimate</div>
            <div className="flex gap-2">
              <button onClick={() => setIsEditMode(false)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="rounded-xl bg-green-700 px-3 py-1.5 text-xs text-white hover:bg-green-800">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Status */}
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500">Status</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            estimate?.signature ? "bg-green-100 text-green-700" :
            estimate?.status === "converted" ? "bg-purple-100 text-purple-700" : "bg-yellow-100 text-yellow-700"
          }`}>
            {estimate?.signature ? "Signed" : estimate?.status === "converted" ? "Converted" : "Pending"}
          </span>
        </div>

        {/* Client */}
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <div className="text-[11px] text-gray-500 mb-2">Client</div>
          <div className="text-sm font-semibold text-gray-800">{client?.name || "No Client"}</div>
          {client?.phone && <div className="text-xs text-gray-500">{client.phone}</div>}
          {client?.email && <div className="text-xs text-gray-500">{client.email}</div>}
        </div>

        {/* Description */}
        {isEditMode ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none" rows={2} placeholder="Description..." />
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="text-[11px] text-gray-500 mb-1">Description</div>
            <p className="text-[10px] text-gray-600 capitalize">{estimate?.description || "No description"}</p>
          </div>
        )}

        {/* Projects */}
        <div className="space-y-3">
          {(isEditMode ? editProjects : projects).map((project, projectIdx) => (
            <div key={project.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
              <div className="bg-green-700 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] font-semibold text-green-100 bg-green-800/50 px-2 py-0.5 rounded">Project {projectIdx + 1}</span>
                    <input type="text" value={project.name} onChange={(e) => updateProject(project.id, "name", e.target.value)} placeholder="Project name" className="flex-1 bg-white/20 text-white placeholder:text-green-200 rounded-lg px-3 py-1.5 text-[10px] font-medium focus:outline-none focus:ring-2 focus:ring-white/50" disabled={!isEditMode} />
                  </div>
                  {isEditMode && editProjects.length > 1 && (
                    <button onClick={() => removeProject(project.id)} className="text-green-200 hover:text-white text-lg px-2">✕</button>
                  )}
                </div>
              </div>

              {/* Project Description */}
              {isEditMode ? (
                <div className="px-3 pt-2">
                  <textarea value={project.description} onChange={(e) => updateProject(project.id, "description", e.target.value)} rows={1} placeholder="Project description (optional)" className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 resize-none transition-all" />
                </div>
              ) : (
                project.description && <div className="px-3 pt-2 text-xs text-gray-500">{project.description}</div>
              )}

              {/* Items */}
              <div className="px-3 pb-2 space-y-2">
                {project.items.map((item, itemIdx) => (
                  <div key={item.id} ref={(el) => { newItemRefs.current[item.id] = el; }} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1 flex items-center gap-1">
                        <span className="text-[10px] text-gray-400 w-5">{itemIdx + 1}.</span>
                        {isEditMode ? (
                          <div className="flex-1">
                            <input type="text" value={item.name} onChange={(e) => updateEditItem(project.id, item.id, "name", e.target.value)} placeholder="Item name" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 placeholder:text-gray-400 transition-all" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-medium text-gray-700">{item.name}</span>
                        )}
                      </div>
                      {isEditMode && (
                        <button onClick={() => removeEditItem(project.id, item.id)} className="text-red-400 text-xs px-1">✕</button>
                      )}
                    </div>

                    {item.description && !isEditMode && <div className="text-xs text-gray-500 mb-2">{item.description}</div>}

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200">
                        <span className="text-[10px] text-gray-400">Qty</span>
                        {isEditMode ? (
                          <input type="number" value={item.quantity === 0 ? "" : item.quantity} onChange={(e) => { const val = e.target.value === "" ? 0 : Number(e.target.value); updateEditItem(project.id, item.id, "quantity", val); }} className="w-12 text-sm text-gray-700 text-center focus:outline-none bg-transparent" placeholder="0" />
                        ) : (
                          <span className="text-sm text-gray-700">{item.quantity}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200">
                        <span className="text-[10px] text-gray-400">$</span>
                        {isEditMode ? (
                          <input type="number" value={item.unit_price === 0 ? "" : item.unit_price} onChange={(e) => { const val = e.target.value === "" ? 0 : Number(e.target.value); updateEditItem(project.id, item.id, "unit_price", val); }} className="w-20 text-sm text-gray-700 text-right focus:outline-none bg-transparent" placeholder="0.00" step="0.01" />
                        ) : (
                          <span className="text-sm text-gray-700">{formatCurrency(item.unit_price)}</span>
                        )}
                      </div>
                      <div className="flex-1 text-right text-sm font-medium text-gray-700">
                        {formatCurrency(item.quantity * item.unit_price)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Item Button */}
              {isEditMode && (
                <div className="flex justify-center my-1">
                  <button onClick={() => addEditItem(project.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-green-300 text-green-600 text-xs font-medium hover:bg-green-50 transition-all duration-200">
                    <span className="text-base">+</span> Add Item
                  </button>
                </div>
              )}

              {/* Project Total */}
              <div className="bg-green-50 px-3 py-2 border-t border-green-100 flex justify-between items-center">
                <span className="text-xs text-green-700 font-medium">Project Total</span>
                <span className="text-sm font-bold text-green-800">
                  {formatCurrency(isEditMode ? calculateSubtotal(project.items) : project.items.reduce((sum, i) => sum + (i.total || 0), 0))}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Project Button */}
        {isEditMode && (
          <button onClick={addProject} className="w-full py-3 rounded-xl border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-all duration-200">
            + Add Project
          </button>
        )}

        {/* Summary */}
        {isEditMode ? (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-500">Summary</span>
              <button onClick={() => setShowTargetModal(true)} className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded hover:bg-green-200 transition">🎯 Set Target Total</button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-700">{formatCurrency(editSubtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Tax ({editTaxRate}%)</span><span>{formatCurrency(editTax)}</span></div>
              <div className="flex justify-between text-base font-semibold mt-2 pt-2 border-t border-gray-100"><span>Total</span><span className="text-green-700">{formatCurrency(editTotal)}</span></div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="text-[11px] text-gray-500 mb-2">Summary</div>
            <div className="flex justify-between text-base font-semibold mt-2 pt-2 border-t border-gray-100"><span>Total</span><span className="text-green-700">{formatCurrency(viewTotal)}</span></div>
          </div>
        )}

        {/* Signature */}
        {!isEditMode && (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="text-[11px] text-gray-500 mb-2">Customer Signature</div>
<SignaturePad
  onSave={saveSignature}
  onRemove={removeSignature}  // ← This must be passed
  existingSignature={estimate?.signature}
  buttonText="Sign & Approve Estimate"
  showRemoveButton={true}  // ← This must be true
/>          </div>
        )}

        {/* Notes */}
        {isEditMode ? (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 focus-within:border-green-500 focus-within:shadow-md">
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none" rows={2} placeholder="Notes for client..." />
          </div>
        ) : (
          estimate?.notes && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="text-[11px] text-gray-500 mb-1">Notes</div>
              <p className="text-xs text-gray-600">{estimate.notes}</p>
            </div>
          )
        )}

        {/* Convert Button */}
        {!isEditMode && estimate?.signature && estimate?.status !== "converted" && (
          <button onClick={convertToInvoice} disabled={converting} className="w-full py-3 rounded-xl bg-green-700 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition">
            {converting ? "Converting..." : "Convert to Invoice"}
          </button>
        )}
      </div>

      {/* FAB */}
      {!isEditMode && (
        <div ref={fabRef} className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3">
          <div className={`flex flex-col items-end gap-2 transition-all duration-200 origin-bottom-right ${fabOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95 pointer-events-none"}`}>
            
            {/* Edit Button */}
            {!estimate?.signature && (
              <button onClick={() => { setIsEditMode(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50 transition">
                <SquarePen size={14} /> Edit
              </button>
            )}
            
            <button onClick={() => { setShowFinancialsModal(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50 transition">
  <DollarSign size={14} /> Financials
</button>
            
            {/* Expenses Button */}
            <button onClick={() => { setShowExpenseModal(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50 transition">
              <Receipt size={14} /> Expenses
            </button>
            
            {/* SMS Button */}
            <button onClick={() => { sendSMSLink(); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50 transition">
              <Send size={14} /> Send SMS
            </button>
            
            {/* PDF Button */}
            <Link href={`/api/estimates/${id}/pdf`} target="_blank" onClick={() => setFabOpen(false)}>
              <button className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50 transition">
                <FileText size={14} /> PDF
              </button>
            </Link>
          </div>
          
          <button onClick={() => setFabOpen(!fabOpen)} className="h-14 w-14 rounded-full bg-green-700 text-white shadow-lg hover:bg-green-800 transition-all duration-200 flex items-center justify-center active:scale-95">
            <span className={`text-2xl font-bold transition-transform duration-300 ${fabOpen ? "rotate-45" : "rotate-0"}`}>+</span>
          </button>
        </div>
      )}


    <ProjectFinancialsModal
  isOpen={showFinancialsModal}
  onClose={() => setShowFinancialsModal(false)}
  estimateId={id as string}
  estimateTotal={viewTotal}
  onRefresh={() => {
    loadSubcontractorPaid();
    loadEstimate();
  }}
/>

      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        estimateId={id as string}
        onRefresh={() => {
          loadEstimate();
        }}
      />
    </div>
  );
}