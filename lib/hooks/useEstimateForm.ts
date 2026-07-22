"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase/client";
import { getCompanyIdOrNull } from "@/lib/supabase/getCompanyId";
import type { Client, LineItem, Signature } from "@/types";
import {
  getEstimateFormData,
  saveEstimate,
  type FormProject,
  type FormChangeOrder,
  type FormAssignedSubcontractor,
  type FormAssignedAgent,
  type FormPayment,
} from "@/lib/queries/estimates";
import {
  createChangeOrder,
  updateChangeOrder,
  submitChangeOrder,
  approveChangeOrder as approveChangeOrderShared,
  rejectChangeOrder as rejectChangeOrderShared,
  deleteChangeOrder as deleteChangeOrderShared,
  computeRevisedEstimateTotal,
  type NewChangeOrderInput,
} from "@/lib/queries/changeOrders";
import {
  calculateSubtotal,
  calculateTax,
  calculateRevisedTotal,
  calculateRemainingBalance,
} from "@/lib/utils/calculations";

export type EstimateFormMode = "create" | "edit";

function createEmptyItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    category: "Material",
    name: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    taxable: false,
    total: 0,
  };
}

function createEmptyProject(): FormProject {
  return { id: crypto.randomUUID(), name: "", description: "", items: [createEmptyItem()] };
}

/**
 * The engine behind components/estimates/EstimateForm.tsx. One hook, two
 * modes — replaces the separate state models that used to live
 * independently in app/estimates/create/page.tsx and
 * app/estimates/[id]/page.tsx. There is no separate "view mode" vs "edit
 * mode" render toggle here (that's what produced the old dual
 * revised-total-formula bug): the form is always in an editable state:
 * fields are simply pre-populated in edit mode. Sections that only make
 * sense once an estimate exists (change orders, payment history,
 * convert-to-invoice) are additional sections gated on `mode === "edit"`,
 * not a different rendering mode of the same fields.
 */
export function useEstimateForm({ mode, estimateId }: { mode: EstimateFormMode; estimateId?: string }) {
  const router = useRouter();

  // Create mode pre-generates a stable id up front so EstimateCamera/
  // EstimateImages (which need a real, persisted estimate_id as an FK and
  // storage-path prefix) can start working before the final Save — see
  // ensureDraftRow below. Edit mode already has a real id from the route.
  const [createDraftId] = useState(() => crypto.randomUUID());
  const formId = mode === "create" ? createDraftId : (estimateId as string);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [draftRowCreated, setDraftRowCreated] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const [clientId, setClientId] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [markup, setMarkup] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [estimateNumber, setEstimateNumber] = useState<string | null>(null);

  const [projects, setProjects] = useState<FormProject[]>([createEmptyProject()]);
  const [changeOrders, setChangeOrders] = useState<FormChangeOrder[]>([]);
  const [assignedSubcontractors, setAssignedSubcontractors] = useState<FormAssignedSubcontractor[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<FormAssignedAgent[]>([]);
  const [payments, setPayments] = useState<FormPayment[]>([]);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);

  // --- company id, once ---
  useEffect(() => {
    getCompanyIdOrNull().then((cid) => {
      if (!cid) {
        toast.error("Company not found. Please refresh and try again.");
        return;
      }
      setCompanyId(cid);
    });
  }, []);

  // --- edit mode: load everything in one call ---
  const loadEstimate = useCallback(async () => {
    if (mode !== "edit" || !estimateId || !companyId) return;
    setLoading(true);
    try {
      const data = await getEstimateFormData(estimateId, companyId);
      if (!data.estimate) {
        setNotFound(true);
        return;
      }
      setClientId(data.estimate.client_id || "");
      setClient(data.client);
      setTitle(data.estimate.title || "");
      setDescription(data.estimate.description || "");
      setNotes(data.estimate.notes || "");
      setMarkup(data.estimate.markup || 0);
      setDiscount(data.estimate.discount || 0);
      setTaxRate(data.estimate.tax_rate || 0);
      setDepositAmount(data.estimate.deposit_amount || 0);
      setSignature(data.estimate.signature || null);
      setStatus(data.estimate.status || "pending");
      setEstimateNumber(data.estimate.estimate_number || null);
      setProjects(data.projects.length > 0 ? data.projects : [createEmptyProject()]);
      setChangeOrders(data.changeOrders);
      setAssignedSubcontractors(data.assignedSubcontractors);
      setAssignedAgents(data.assignedAgents);
      setPayments(data.payments);
      setExistingInvoiceId(data.existingInvoiceId);
    } catch (err) {
      console.error(err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [mode, estimateId, companyId]);

  useEffect(() => {
    loadEstimate();
  }, [loadEstimate]);

  // --- create mode: photo-draft-row pattern (unchanged from the old
  // create page) — as soon as a client is picked, upsert a bare draft row
  // under the pre-generated id so EstimateCamera/EstimateImages have a
  // real FK to attach photos to before the user ever clicks Save. ---
  useEffect(() => {
    if (mode !== "create" || !clientId || draftRowCreated || !companyId) return;
    (async () => {
      const { error } = await supabase.from("estimates").upsert(
        { id: createDraftId, client_id: clientId, status: "pending", company_id: companyId },
        { onConflict: "id" }
      );
      if (error) {
        console.error("Failed to create draft estimate:", error);
        toast.error("Failed to prepare estimate for photo uploads.");
        return;
      }
      setDraftRowCreated(true);
    })();
  }, [mode, clientId, draftRowCreated, companyId, createDraftId]);

  const photosEnabled = mode === "edit" ? true : draftRowCreated;

  // An estimate the customer has already signed, or that's been
  // converted/completed, shouldn't have its scope/pricing silently
  // changed out from under them — mirrors the old page's "Modify" button
  // gating (!estimate?.signature && status !== 'converted').
  const isLocked = mode === "edit" && (!!signature || status === "converted" || status === "completed");

  // --- derived calculations — the single source of truth for every
  // number this form displays. No separate "view" vs "edit" formula. ---
  const allItems = useMemo(
    () => projects.flatMap((p) => p.items.map((item) => ({ ...item, project_name: p.name }))),
    [projects]
  );
  const subtotal = useMemo(() => calculateSubtotal(allItems), [allItems]);
  const tax = useMemo(() => calculateTax(subtotal, taxRate), [subtotal, taxRate]);
  const approvedChangeOrderTotal = useMemo(
    () => changeOrders.filter((co) => co.status === "approved").reduce((sum, co) => sum + co.total_amount, 0),
    [changeOrders]
  );
  const pendingChangeOrderTotal = useMemo(
    () =>
      changeOrders
        .filter((co) => co.status === "draft" || co.status === "pending")
        .reduce((sum, co) => sum + co.total_amount, 0),
    [changeOrders]
  );
  const revisedTotal = useMemo(
    () => calculateRevisedTotal(subtotal, markup, discount, tax, approvedChangeOrderTotal),
    [subtotal, markup, discount, tax, approvedChangeOrderTotal]
  );
  const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments]);
  const remainingBalance = useMemo(() => calculateRemainingBalance(revisedTotal, totalPaid), [revisedTotal, totalPaid]);

  // --- project / line item mutators ---
  const addProject = useCallback(() => setProjects((prev) => [...prev, createEmptyProject()]), []);

  const removeProject = useCallback((projectId: string) => {
    setProjects((prev) => (prev.length === 1 ? prev : prev.filter((p) => p.id !== projectId)));
  }, []);

  const updateProject = useCallback((projectId: string, field: "name" | "description", value: string) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, [field]: value } : p)));
  }, []);

  const addItem = useCallback((projectId: string) => {
    const newItem = createEmptyItem();
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, items: [...p.items, newItem] } : p)));
    return newItem.id;
  }, []);

  const updateItem = useCallback((projectId: string, itemId: string, field: keyof LineItem, value: any) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          items: p.items.map((item) => {
            if (item.id !== itemId) return item;
            const updated = { ...item, [field]: value } as LineItem;
            if (field === "quantity" || field === "unit_price") updated.total = updated.quantity * updated.unit_price;
            return updated;
          }),
        };
      })
    );
  }, []);

  const removeItem = useCallback((projectId: string, itemId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const newItems = p.items.filter((i) => i.id !== itemId);
        return { ...p, items: newItems.length ? newItems : [createEmptyItem()] };
      })
    );
  }, []);

  // Local-state-only until Save — standardized on Create's existing
  // behavior (Edit used to auto-persist immediately, which was harder to
  // undo before committing).
  const distributeToTargetTotal = useCallback(
    (targetTotal: number) => {
      if (!targetTotal || targetTotal <= 0) {
        toast.error("Please enter a valid target total");
        return;
      }
      const difference = targetTotal - subtotal;
      if (difference === 0) {
        toast("Target total is already equal to current total", { icon: "ℹ️" });
        return;
      }
      const allLineItems = projects.flatMap((p) => p.items);
      if (allLineItems.length === 0) {
        toast.error("No items to distribute to");
        return;
      }
      const distributionPerItem = difference / allLineItems.length;
      setProjects((prev) =>
        prev.map((project) => ({
          ...project,
          items: project.items.map((item) => {
            const newUnitPrice = Math.max(0, item.unit_price + distributionPerItem);
            return { ...item, unit_price: newUnitPrice, total: item.quantity * newUnitPrice };
          }),
        }))
      );
    },
    [projects, subtotal]
  );

  // --- save (single path, both modes — see lib/queries/estimates.ts) ---
  const save = useCallback(async (): Promise<{ id: string; estimateNumber: string | null } | null> => {
    if (!clientId) {
      toast.error("Please select a client");
      return null;
    }
    if (projects.some((p) => p.items.some((i) => !i.name.trim()))) {
      toast.error("All line items must have a name");
      return null;
    }
    if (!companyId) {
      toast.error("Company not found. Please refresh and try again.");
      return null;
    }
    setSaving(true);
    try {
      const result = await saveEstimate(
        { clientId, title, description, notes, markup, discount, taxRate, depositAmount, projects },
        mode,
        companyId,
        formId
      );
      toast.success(mode === "create" ? `Estimate #${result.estimateNumber} created!` : "Estimate updated successfully!");
      if (mode === "edit") await loadEstimate();
      return result;
    } catch (err: any) {
      console.error(err);
      toast.error("Error saving estimate: " + (err.message || "Unknown error"));
      return null;
    } finally {
      setSaving(false);
    }
  }, [clientId, projects, companyId, title, description, notes, markup, discount, taxRate, depositAmount, mode, formId, loadEstimate]);

  // --- change orders — delegates fully to the shared lib/queries/changeOrders.ts
  // module (create/update/submit/approve/reject/delete). No more page-local
  // duplicate CRUD against change_orders/change_order_line_items. ---
  const saveChangeOrder = useCallback(
    async (input: NewChangeOrderInput, existingId?: string, existingStatus: "draft" | "rejected" = "draft") => {
      if (!companyId) {
        toast.error("Company not found");
        return false;
      }
      try {
        if (existingId) {
          await updateChangeOrder(existingId, companyId, input, existingStatus);
          toast.success("Change order updated");
        } else {
          await createChangeOrder(formId, companyId, input);
          toast.success("Change order created");
        }
        await loadEstimate();
        return true;
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Error saving change order");
        return false;
      }
    },
    [companyId, formId, loadEstimate]
  );

  const submitChangeOrderForApproval = useCallback(
    async (coId: string) => {
      if (!companyId) return;
      try {
        await submitChangeOrder(coId, companyId);
        await loadEstimate();
        toast.success("Change order submitted for client approval.");
      } catch (err) {
        console.error(err);
        toast.error("Error submitting for approval");
      }
    },
    [companyId, loadEstimate]
  );

  const approveChangeOrderAction = useCallback(
    async (coId: string) => {
      if (!companyId) return;
      try {
        await approveChangeOrderShared(coId, companyId, formId);
        await loadEstimate();
        toast.success("Change order approved! Estimate total updated.");
      } catch (err) {
        console.error(err);
        toast.error("Error approving change order");
      }
    },
    [companyId, formId, loadEstimate]
  );

  const rejectChangeOrderAction = useCallback(
    async (coId: string) => {
      if (!companyId) return;
      try {
        await rejectChangeOrderShared(coId, companyId);
        await loadEstimate();
        toast.success("Change order rejected.");
      } catch (err) {
        console.error(err);
        toast.error("Error rejecting change order");
      }
    },
    [companyId, loadEstimate]
  );

  const deleteChangeOrderAction = useCallback(
    async (coId: string, coStatus: string) => {
      if (coStatus !== "draft") {
        toast.error("Only draft change orders can be deleted.");
        return;
      }
      if (!companyId) return;
      try {
        await deleteChangeOrderShared(coId, companyId);
        await loadEstimate();
        toast.success("Change order deleted successfully");
      } catch (err) {
        console.error(err);
        toast.error("Error deleting change order");
      }
    },
    [companyId, loadEstimate]
  );

  // --- signature ---
  const saveSignature = useCallback(
    async (sig: Signature) => {
      if (!companyId) {
        toast.error("Company not found");
        return;
      }
      const { error } = await supabase
        .from("estimates")
        .update({ signature: sig, status: "approved" })
        .eq("id", formId)
        .eq("company_id", companyId);
      if (error) {
        toast.error("Error saving signature. Please try again.");
        return;
      }
      setSignature(sig);
      setStatus("approved");
      toast.success("Signature saved successfully!");
    },
    [companyId, formId]
  );

  const removeSignature = useCallback(async () => {
    if (!companyId) throw new Error("Company not found");
    const { error } = await supabase
      .from("estimates")
      .update({ signature: null, status: "pending" })
      .eq("id", formId)
      .eq("company_id", companyId);
    if (error) throw error;
    setSignature(null);
    setStatus("pending");
  }, [companyId, formId]);

  // --- lifecycle actions ---
  const markAsCompleted = useCallback(async () => {
    if (!confirm("Mark this estimate as completed? It will be moved to completed list and won't be editable.")) return;
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { error } = await supabase
      .from("estimates")
      .update({ completed_at: new Date().toISOString(), is_completed: true, status: "completed" })
      .eq("id", formId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Error marking as completed");
      return;
    }
    toast.success("Estimate marked as completed!");
    router.push("/estimates/completed");
  }, [companyId, formId, router]);

  const convertToInvoice = useCallback(async () => {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", formId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingInvoice) {
      toast("Invoice already exists.", { icon: "ℹ️" });
      router.push(`/invoices/${existingInvoice.id}`);
      return;
    }

    if (!confirm("Convert this estimate to an invoice? This will lock the estimate.")) return;
    setConverting(true);
    try {
      const invoiceNumber = estimateNumber;

      const { data: duplicateInvoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("invoice_number", invoiceNumber)
        .eq("company_id", companyId)
        .maybeSingle();
      if (duplicateInvoice) {
        toast.error(`Invoice #${invoiceNumber} already exists`);
        router.push(`/invoices/${duplicateInvoice.id}`);
        return;
      }

      const { data: items, error: itemsFetchError } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", formId)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (itemsFetchError || !items || items.length === 0) {
        toast.error("No items found on this estimate");
        return;
      }

      const { data: approvedCOs } = await supabase
        .from("change_orders")
        .select("*")
        .eq("estimate_id", formId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("status", "approved");
      const changeOrdersTotalAmount = (approvedCOs || []).reduce((sum: number, co: any) => sum + (co.total_amount || 0), 0);

      // Same shared formula as change-order approval — replaces the
      // independent subtotal/tax/total re-derivation this used to carry.
      const { itemsSubtotal, revisedTotal: finalTotal } = await computeRevisedEstimateTotal(formId, companyId);
      const originalTax = calculateTax(itemsSubtotal, taxRate);

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          estimate_id: formId,
          client_id: clientId,
          invoice_number: invoiceNumber,
          description,
          subtotal: itemsSubtotal + changeOrdersTotalAmount,
          markup,
          discount,
          tax: originalTax,
          total: finalTotal,
          remaining_balance: finalTotal,
          amount_paid: 0,
          notes,
          signature,
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          company_id: companyId,
        })
        .select()
        .single();
      if (invoiceError) throw invoiceError;

      const itemsToCopy = items.map((item: any) => ({
        invoice_id: invoice.id,
        project_name: item.project_name || "Main Project",
        category: item.category,
        name: item.name,
        description: item.description || "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        taxable: item.taxable,
        total: item.total,
        company_id: companyId,
      }));
      await supabase.from("invoice_items").insert(itemsToCopy);

      if (approvedCOs && approvedCOs.length) {
        const coItems = approvedCOs.map((co: any) => ({
          invoice_id: invoice.id,
          project_name: "Change Orders",
          category: "Change Order",
          name: co.title,
          description: co.description || `Change order ${co.change_order_number}`,
          quantity: 1,
          unit_price: co.total_amount,
          taxable: false,
          total: co.total_amount,
          company_id: companyId,
        }));
        await supabase.from("invoice_items").insert(coItems);
      }

      await supabase.from("estimates").update({ status: "converted" }).eq("id", formId).eq("company_id", companyId);
      toast.success("Invoice created successfully!");
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Error creating invoice");
    } finally {
      setConverting(false);
    }
  }, [companyId, formId, estimateNumber, taxRate, clientId, description, markup, discount, notes, signature, router]);

  const sendSMSLink = useCallback(async () => {
    let currentClient = client;
    if (!currentClient?.phone && clientId) {
      const { data: freshClient } = await supabase.from("clients").select("*").eq("id", clientId).is("deleted_at", null).single();
      if (freshClient) currentClient = freshClient;
    }
    const phoneNumber = currentClient?.phone;
    if (!phoneNumber) {
      toast.error("No phone number on file. Please add a phone number to this client first.");
      return;
    }
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/estimates/${formId}`;
    const message = encodeURIComponent(
      `Hello ${currentClient?.name || "Customer"}! Please review and sign your estimate: ${documentUrl}\n\n` +
        `Estimate #${estimateNumber}\n` +
        `Total: $${revisedTotal.toFixed(2)}\n\n` +
        `Click the link above to view and sign. Thank you!`
    );
    window.location.href = `sms:${phoneNumber}?body=${message}`;
  }, [client, clientId, formId, estimateNumber, revisedTotal]);

  return {
    mode,
    formId,
    companyId,
    loading,
    notFound,
    saving,
    converting,
    isLocked,
    photosEnabled,
    galleryRefresh,
    bumpGallery: () => setGalleryRefresh((n) => n + 1),

    clientId,
    setClientId,
    client,
    title,
    setTitle,
    description,
    setDescription,
    notes,
    setNotes,
    markup,
    setMarkup,
    discount,
    setDiscount,
    taxRate,
    setTaxRate,
    depositAmount,
    setDepositAmount,
    signature,
    status,
    estimateNumber,

    projects,
    addProject,
    removeProject,
    updateProject,
    addItem,
    updateItem,
    removeItem,
    distributeToTargetTotal,

    subtotal,
    tax,
    approvedChangeOrderTotal,
    pendingChangeOrderTotal,
    revisedTotal,
    totalPaid,
    remainingBalance,

    changeOrders,
    saveChangeOrder,
    submitChangeOrderForApproval,
    approveChangeOrder: approveChangeOrderAction,
    rejectChangeOrder: rejectChangeOrderAction,
    deleteChangeOrder: deleteChangeOrderAction,

    assignedSubcontractors,
    assignedAgents,
    payments,
    existingInvoiceId,

    save,
    saveSignature,
    removeSignature,
    markAsCompleted,
    convertToInvoice,
    sendSMSLink,
  };
}

export type UseEstimateFormReturn = ReturnType<typeof useEstimateForm>;
