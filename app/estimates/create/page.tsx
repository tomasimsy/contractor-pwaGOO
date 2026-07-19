"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { LineItem } from "@/types";
import ClientSelector from "@/components/forms/ClientSelector";
import {
  calculateSubtotal,
  calculateTax,
  calculateTotal,
} from "@/lib/utils/calculations";
import { formatCurrency } from "@/lib/utils/formatting";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { generateEstimateNumber } from "@/lib/utils/estimateNumber";
import toast from "react-hot-toast";
import { Upload, X, Loader2, Images, ZoomIn } from "lucide-react";

import { EstimateCamera } from "@/components/ui/EstimateCamera";
import { EstimateImageUploader, EstimateImageView } from "@/components/ui/EstimateImages";

type Project = {
  id: string;
  name: string;
  description: string;
  items: LineItem[];
};

export default function CreateEstimate() {
  const router = useRouter();
  const newItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetTotal, setTargetTotal] = useState<number | null>(null);

  const [estimateId] = useState(() => crypto.randomUUID());
  const [estimateRowCreated, setEstimateRowCreated] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const [title, setTitle] = useState("");

  // ---- NEW: store company ID after fetching ----
  const [companyId, setCompanyId] = useState<string | null>(null);

  const BRAND_GREEN = "#0e542c";
  const BRAND_GREEN_LIGHT = "#e8f5e9";

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

  const createProject = (): Project => ({
    id: crypto.randomUUID(),
    name: "",
    description: "",
    items: [createEmptyItem()],
  });

  const [projects, setProjects] = useState<Project[]>([createProject()]);
  const [saving, setSaving] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);

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

  // ---- CREATE DRAFT ESTIMATE with company_id (clean pattern) ----
  useEffect(() => {
    if (!clientId || estimateRowCreated) return;

    const createDraft = async () => {
      // Get logged-in user
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error("You must be logged in to create an estimate.");
        return;
      }

      // Get user's company
      const {
        data: profile,
        error: profileError
      } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.company_id) {
        console.error("Missing company profile:", profileError);
        toast.error("Your account is not assigned to a company.");
        return;
      }

      const companyId = profile.company_id;

      // Create estimate with company_id
      const { error } = await supabase
        .from("estimates")
        .upsert(
          {
            id: estimateId,
            client_id: clientId,
            status: "pending",
            company_id: companyId,
          },
          { onConflict: "id" }
        );

      if (error) {
        console.error("Failed to create draft estimate:", error);
        toast.error("Failed to create draft estimate.");
        return;
      }

      setCompanyId(companyId);
      setEstimateRowCreated(true);
    };

    createDraft();
  }, [clientId, estimateId, estimateRowCreated]);

  const allItems = projects.flatMap((project) =>
    project.items.map((item) => ({
      ...item,
      project_name: project.name,
    }))
  );

  const subtotal = calculateSubtotal(allItems);
  const tax = calculateTax(subtotal, 0);
  const total = calculateTotal(subtotal, 0, 0, tax);

  const distributeToTargetTotal = () => {
    if (!targetTotal || targetTotal <= 0) {
      toast.error("Please enter a valid target total");
      return;
    }

    const currentTotal = subtotal;
    const difference = targetTotal - currentTotal;
    
    if (difference === 0) {
      toast('Target total is already equal to current total', { icon: 'ℹ️' });
      return;
    }

    const allLineItems = projects.flatMap(p => p.items);
    
    if (allLineItems.length === 0) {
      toast.error("No items to distribute to");
      return;
    }

    const distributionPerItem = difference / allLineItems.length;
    
    const updatedProjects = projects.map(project => ({
      ...project,
      items: project.items.map(item => {
        const newUnitPrice = Math.max(0, item.unit_price + distributionPerItem);
        return {
          ...item,
          unit_price: newUnitPrice,
          total: item.quantity * newUnitPrice
        };
      })
    }));

    setProjects(updatedProjects);
    setTargetTotal(null);
    setShowTargetModal(false);
    toast.success(`Total updated to ${formatCurrency(targetTotal)}`);
  };

  const addProject = () => {
    setProjects((prev) => [...prev, createProject()]);
  };

  const removeProject = (projectId: string) => {
    if (projects.length === 1) return;
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
  };

  const updateProject = (projectId: string, field: keyof Project, value: any) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, [field]: value } : project
      )
    );
  };

  const addItemToProject = (projectId: string) => {
    const newItem = createEmptyItem();
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, items: [...project.items, newItem] }
          : project
      )
    );
    setLastAddedItemId(newItem.id);
  };

  const updateItemInProject = (
    projectId: string,
    itemId: string,
    field: keyof LineItem,
    value: any
  ) => {
    setProjects((prev) =>
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

  const removeItemFromProject = (projectId: string, itemId: string) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const newItems = project.items.filter((item) => item.id !== itemId);
        return { ...project, items: newItems.length ? newItems : [createEmptyItem()] };
      })
    );
  };

  const saveEstimate = async () => {
    if (!clientId) {
      toast.error("Please select a client");
      return;
    }

    if (projects.some((project) =>
      project.items.some((item) => !item.name.trim())
    )) {
      toast.error("All line items must have a name");
      return;
    }

    // Ensure company_id is available
    if (!companyId) {
      toast.error("Company not found. Please refresh and try again.");
      return;
    }

    const estimateNumber = await generateEstimateNumber();
    setSaving(true);

    // Upsert estimate with company_id
    const { data: estimate, error } = await supabase
      .from("estimates")
      .upsert(
        {
          id: estimateId,
          client_id: clientId,
          estimate_number: estimateNumber,
          description: description || null,
          notes: notes || null,
          title: title || null,     
          subtotal,
          total,
          status: "pending",
          company_id: companyId,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      toast.error("Error creating estimate: " + error.message);
      setSaving(false);
      return;
    }

    // Insert line items with company_id
    const itemsToInsert = projects.flatMap((project) =>
      project.items.map((item) => ({
        estimate_id: estimate.id,
        project_name: project.name || null,
        project_description: project.description || null,
        category: item.category,
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        taxable: item.taxable,
        total: item.quantity * item.unit_price,
        company_id: companyId,
      }))
    );

    const { error: itemsError } = await supabase
      .from("estimate_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error(itemsError);
      toast.error("Error saving items: " + itemsError.message);
    } else {
      toast.success(`Estimate #${estimateNumber} created!`);
      router.push(`/estimates/${estimate.id}`);
    }

    setSaving(false);
  };

  return (
    <ProtectedRoute>
      {/* Target Total Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-2">- Set Target Total</h3>
            <p className="text-xs text-gray-500 mb-3">
              Current: {formatCurrency(total)}
            </p>
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
              Difference will be split across {projects.flatMap(p => p.items).length} items
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTargetModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={distributeToTargetTotal}
                className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-100 pb-20">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => router.back()} className="text-gray-600 text-xl">
              ←
            </button>
            <h1 className="text-base font-semibold text-gray-800">New Estimate</h1>
            <button
              onClick={saveEstimate}
              disabled={saving}
              className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Client */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <ClientSelector
            selectedId={clientId}
            onSelect={setClientId}
            companyId={companyId}   // 👈 pass the company ID
          />
          </div>

          {/* Title */}
<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
  <div className="flex items-center gap-1 mb-0.5">
    <label htmlFor="title" className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
      Estimate Title
    </label>
    <span className="text-red-500 text-xs">*</span>
  </div>
  <input
    id="title"
    type="text"
    value={title}
    onChange={(e) => setTitle(e.target.value)}
    className="w-full text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none"
    placeholder="Title... Roof Repair - 123 Main St"
    required
  />
</div>

          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[100px] text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none capitalize"
              rows={5}
              placeholder="Work Description..."
            />
          </div>

{/* Camera Uploader */}
<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
  {estimateRowCreated ? (
    <>
      <EstimateCamera
        estimateId={estimateId}
        onUploaded={() => setGalleryRefresh((n) => n + 1)}
      />
      <EstimateImageUploader
        estimateId={estimateId}
        onUploaded={() => setGalleryRefresh((n) => n + 1)}
      />
    </>
  ) : (
    <p className="text-xs text-gray-400">Select a client above to enable photo uploads.</p>
  )}
</div>

          {/* Projects */}
          <div className="space-y-3">
            {projects.map((project, projectIdx) => (
              <div key={project.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                {/* Project Header - Green Accent */}
                <div className="bg-green-700 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-semibold text-green-100 bg-green-800/50 px-2 py-0.5 rounded">
                        Project {projectIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={project.name}
                        onChange={(e) => updateProject(project.id, "name", e.target.value)}
                        placeholder="Project name"
                        className="flex-1 bg-white/20 text-white placeholder:text-green-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                      />
                    </div>
                    {projects.length > 1 && (
                      <button
                        onClick={() => removeProject(project.id)}
                        className="text-green-200 hover:text-white text-lg px-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Project Description */}
                <div className="px-3 pt-2">
                  <textarea
                    value={project.description}
                    onChange={(e) => updateProject(project.id, "description", e.target.value)}
                    rows={1}
                    placeholder="Project description (optional)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 resize-none transition-all capitalize"
                  />
                </div>

                {/* Items */}
                <div className="px-3 space-y-2">
                  {project.items.map((item, itemIdx) => (
                    <div
                      key={item.id}
                      ref={(el) => { newItemRefs.current[item.id] = el; }}
                      className="bg-gray-50 rounded-lg p-2 border border-gray-200"
                    >
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 w-5">{itemIdx + 1}.</span>
                          <div className="flex-1">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateItemInProject(project.id, item.id, "name", e.target.value)}
                              placeholder="Item name"
                              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 placeholder:text-gray-400 transition-all capitalize"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeItemFromProject(project.id, item.id)}
                          className="text-red-400 text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>

                      {item.description && (
                        <textarea
                          value={item.description}
                          onChange={(e) => updateItemInProject(project.id, item.id, "description", e.target.value)}
                          rows={1}
                          placeholder="Description"
                          className="w-full text-xs text-gray-500 bg-transparent focus:outline-none mb-2 resize-none"
                        />
                      )}

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
                          <span className="text-[10px] text-gray-400">Qty</span>
                          <input
                            type="number"
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value);
                              updateItemInProject(project.id, item.id, "quantity", val);
                            }}
                            className="w-12 text-sm text-gray-700 text-center focus:outline-none bg-transparent"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
                          <span className="text-[10px] text-gray-400">$</span>
                          <input
                            type="number"
                            value={item.unit_price === 0 ? "" : item.unit_price}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value);
                              updateItemInProject(project.id, item.id, "unit_price", val);
                            }}
                            className="w-20 text-sm text-gray-700 text-right focus:outline-none bg-transparent"
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                        <div className="flex-1 text-right text-sm font-medium text-gray-700">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Item Button - Green */}
                <div className="flex justify-center my-1">
                  <button
                    onClick={() => addItemToProject(project.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-green-300 text-green-600 text-xs font-medium hover:bg-green-50 transition-all duration-200"
                  >
                    <span className="text-base">+</span>
                    Add Item
                  </button>
                </div>

                {/* Project Total - Green Accent */}
                <div className="bg-green-50 px-3 py-2 border-t border-green-100 flex justify-between items-center">
                  <span className="text-xs text-green-700 font-medium">Project Total</span>
                  <span className="text-sm font-bold text-green-800">
                    {formatCurrency(calculateSubtotal(project.items))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add Project Button - Green */}
          <button
            onClick={addProject}
            className="w-full py-3 rounded-xl border-1 border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-all duration-200"
          >
            + Add Project
          </button>

          {/* Summary - Green Accent */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-500">Summary</span>
              <button
                onClick={() => setShowTargetModal(true)}
                className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded hover:bg-green-200 transition"
              >
                - Set Target Total
              </button>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium text-gray-700">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold mt-2 pt-2 border-t border-gray-100">
              <span>Total</span>
              <span className="text-green-700">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 transition-all duration-200 focus-within:border-green-500 focus-within:shadow-md">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none"
              rows={2}
              placeholder="Notes for client (optional)..."
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}