"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate, Client, Project, LineItem, Signature } from "@/types";
import { formatCurrency } from "@/lib/utils/formatting";
import { calculateSubtotal, calculateTax, calculateTotal } from "@/lib/utils/calculations";
import SignaturePad from "@/components/signature/SignaturePad";
import ProjectFinancialsModal from "@/components/ProjectFinancialsModal";
import ExpenseModal from "@/components/ExpenseModal";
import Link from "next/link";
import {
  SquarePen, Send, FileText, Users, Receipt, DollarSign, Plus, FileEdit, X, Trash2, ArrowLeft, Target, Sparkles, Flag, TrendingUp
} from "lucide-react";
import toast from "react-hot-toast";
import ProgressModal from "@/components/progress/ProgressModal";
import ProgressDisplay from "@/components/progress/ProgressDisplay";
import ClientSelector from "@/components/forms/ClientSelector";
import { EstimateCamera } from "@/components/ui/EstimateCamera";
import { EstimateImageUploader, EstimateImageView } from "@/components/ui/EstimateImages";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { getCompanyId } from "@/lib/supabase/getCompanyId";

type ProjectWithItems = {
  id: string;
  name: string;
  description: string;
  items: LineItem[];
};

type ChangeOrder = {
  id: string;
  change_order_number: string;
  title: string;
  description: string;
  status: string;
  total_amount: number;
  original_estimate_total: number;
  created_at: string;
  approved_at?: string;
  signed_signature?: string;
};

type ChangeOrderLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  type: "addition" | "deduction";
};

type EstimatePayment = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
};

export default function EstimatePage() {
  const router = useRouter();
  const { id } = useParams();

  // --- state ---
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressRefresh, setProgressRefresh] = useState(0);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<ProjectWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const [estimateId] = useState(() => crypto.randomUUID());
  const [estimateRowCreated, setEstimateRowCreated] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);
  const [pendingChangeOrdersTotal, setPendingChangeOrdersTotal] = useState(0);
  const [setProjectsList] = useState<{ name: string }[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showFinancialsModal, setShowFinancialsModal] = useState(false);
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false);
  const [editingChangeOrder, setEditingChangeOrder] = useState<ChangeOrder | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [changeOrdersTotal, setChangeOrdersTotal] = useState(0);
  const [subcontractorPaid, setSubcontractorPaid] = useState(0);
  const [payments, setPayments] = useState<EstimatePayment[]>([]);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetTotal, setTargetTotal] = useState<number | null>(null);
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
  const [editClientId, setEditClientId] = useState<string>("");
  const [clientList, setClientList] = useState<{ id: string; name: string }[]>([]);
  const [originalSubtotal, setOriginalSubtotal] = useState(0);
  const [revisedTotal, setRevisedTotal] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [remainingBalance, setRemainingBalance] = useState(0);
  const [editTitle, setEditTitle] = useState("");

  const projectsList = useMemo(() => projects.map(p => ({ name: p.name })), [projects]);

  // --- helper to get company_id once ---
  const withCompanyId = async <T,>(fn: (companyId: string) => Promise<T>): Promise<T | null> => {
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found. Please refresh and try again.");
      return null;
    }
    return fn(companyId);
  };

  // --- load data ---
  useEffect(() => {
    loadEstimate();
    loadSubcontractorPaid();
    loadChangeOrders();
    loadPayments();
  }, [id]);

  useEffect(() => {
    const fetchClients = async () => {
      const companyId = await getCompanyId();
      if (!companyId) return;
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (!error && data) setClientList(data);
    };
    fetchClients();
  }, []);

  useEffect(() => {
    const checkExistingInvoice = async () => {
      if (estimate?.id) {
        const companyId = await getCompanyId();
        if (!companyId) return;
        const { data } = await supabase
          .from("invoices")
          .select("id")
          .eq("estimate_id", estimate.id)
          .eq("company_id", companyId)
          .maybeSingle();
        if (data) setExistingInvoiceId(data.id);
      }
    };
    checkExistingInvoice();
  }, [estimate?.id]);

  useEffect(() => {
    if (lastAddedItemId && newItemRefs.current[lastAddedItemId]) {
      newItemRefs.current[lastAddedItemId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      const element = newItemRefs.current[lastAddedItemId];
      element?.classList.add("bg-green-50", "transition-all", "duration-500");
      setTimeout(() => element?.classList.remove("bg-green-50"), 1000);
      setLastAddedItemId(null);
    }
  }, [lastAddedItemId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) setFabOpen(false);
    };
    if (fabOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [fabOpen]);

  async function loadSubcontractorPaid() {
    await withCompanyId(async (companyId) => {
      const { data } = await supabase
        .from("subcontractor_payments")
        .select("amount")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (data) setSubcontractorPaid(data.reduce((sum, p) => sum + (p.amount || 0), 0));
    });
  }

  // Reads through invoice_payments (the table actually written to when a
  // payment is recorded on the Invoice page) instead of estimate_payments,
  // which nothing in the app ever writes — that table was always empty,
  // so this tab silently showed no payments regardless of reality.
  async function loadPayments() {
    await withCompanyId(async (companyId) => {
      const { data: invoiceRows } = await supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", id)
        .eq("company_id", companyId);

      const invoiceIds = (invoiceRows ?? []).map((inv) => inv.id);
      if (invoiceIds.length === 0) {
        setPayments([]);
        setTotalPaid(0);
        return;
      }

      const { data } = await supabase
        .from("invoice_payments")
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false });
      if (data) {
        setPayments(data);
        const paidSum = data.reduce((sum, p) => sum + (p.amount || 0), 0);
        setTotalPaid(paidSum);
      } else {
        setPayments([]);
        setTotalPaid(0);
      }
    });
  }

  async function loadChangeOrders() {
    await withCompanyId(async (companyId) => {
      const { data, error } = await supabase
        .from("change_orders")
        .select("*")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error loading change orders:", error);
        return;
      }
      setChangeOrders(data || []);
      const approvedTotal = (data || [])
        .filter(co => co.status === "approved")
        .reduce((sum, co) => sum + (co.total_amount || 0), 0);
      const pendingTotal = (data || [])
        .filter(co => co.status === "draft" || co.status === "pending")
        .reduce((sum, co) => sum + (co.total_amount || 0), 0);
      setChangeOrdersTotal(approvedTotal);
      setPendingChangeOrdersTotal(pendingTotal);
    });
  }

  async function loadEstimate() {
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      setLoading(false);
      return;
    }
    try {
      const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("id", id)
        .single();
      setEstimate(est);
      setEditDescription(est?.description || "");
      setEditNotes(est?.notes || "");
      setEditTitle(est?.title || "");
      setEditMarkup(est?.markup || 0);
      setEditDiscount(est?.discount || 0);
      setEditTaxRate(est?.tax_rate || 0);

      if (est?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("*")
          .eq("id", est.client_id)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .single();
        setClient(c);
        setEditClientId(est.client_id);
      }

      const { data: items } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null);

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

      const originalSum = items?.reduce((sum, i) => sum + (i.total || 0), 0) || 0;
      setOriginalSubtotal(originalSum);

      const { data: approvedCOs } = await supabase
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("status", "approved");
      const approvedTotal = (approvedCOs || []).reduce((sum, co) => sum + (co.total_amount || 0), 0);
      setChangeOrdersTotal(approvedTotal);

      const revTotal = originalSum + approvedTotal;
      setRevisedTotal(revTotal);
      setDepositAmount(revTotal * 0.5);
      const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      setRemainingBalance(revTotal - paidTotal);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // --- Change Order CRUD with company_id ---
  async function deleteChangeOrder(coId: string, status: string) {
    if (status !== "draft") {
      toast.error("Only draft change orders can be deleted.");
      return;
    }
    if (!confirm("Delete this change order permanently?")) return;
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { error } = await supabase
      .from("change_orders")
      .delete()
      .eq("id", coId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Error deleting change order");
    } else {
      await loadChangeOrders();
      await loadEstimate();
      toast.success("Change order deleted successfully");
    }
  }

  async function submitForApproval(coId: string) {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const { error } = await supabase
      .from("change_orders")
      .update({ status: "pending" })
      .eq("id", coId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Error submitting for approval");
    } else {
      await loadChangeOrders();
      toast.success("Change order submitted for client approval.", {
        duration: 3000,
        position: "top-center",
        icon: "📨",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
    }
  }

  async function approveChangeOrder(coId: string) {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const { error } = await supabase
      .from("change_orders")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", coId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Error approving change order");
      return;
    }

    // Keep estimates.total in sync using the same formula every other
    // recompute of this total uses (originalSubtotal +
    // approvedChangeOrdersTotal — see approve_public_change_order RPC
    // and the public/internal Invoice pages). This page and the
    // invoice page always recompute live and were never affected by
    // this being stale, but list/dashboard views that read
    // estimates.total directly need it kept current too.
    const [{ data: items }, { data: approvedCOs }] = await Promise.all([
      supabase
        .from("estimate_items")
        .select("total")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .eq("status", "approved")
        .is("deleted_at", null),
    ]);
    const newTotal =
      (items || []).reduce((sum, i) => sum + (i.total || 0), 0) +
      (approvedCOs || []).reduce((sum, co) => sum + (co.total_amount || 0), 0);
    await supabase
      .from("estimates")
      .update({ total: newTotal })
      .eq("id", id)
      .eq("company_id", companyId);

    await loadChangeOrders();
    await loadEstimate();
    toast.success("Change order approved! Estimate total updated.");
  }

  async function rejectChangeOrder(coId: string) {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const { error } = await supabase
      .from("change_orders")
      .update({ status: "rejected" })
      .eq("id", coId)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Error rejecting change order");
    } else {
      await loadChangeOrders();
      toast.success("Change order rejected.");
    }
  }

  const saveSignature = async (signature: Signature) => {
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { error } = await supabase
      .from("estimates")
      .update({ signature, status: "approved" })
      .eq("id", id)
      .eq("company_id", companyId);
    if (!error) {
      setEstimate({ ...estimate, signature } as Estimate);
      toast.success("Signature saved successfully!", {
        duration: 3000,
        position: "top-center",
        icon: "✍️",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
    } else {
      toast.error("Error saving signature. Please try again.", {
        duration: 3000,
        position: "top-center",
      });
    }
  };

  const removeSignature = async (estimateId: string) => {
    const companyId = await getCompanyId();
    if (!companyId) throw new Error("Company not found");
    const { error } = await supabase
      .from("estimates")
      .update({ signature: null, status: "pending" })
      .eq("id", estimateId)
      .eq("company_id", companyId);
    if (error) throw error;
  };

  const markAsCompleted = async () => {
    if (!confirm("Mark this estimate as completed? It will be moved to completed list and won't be editable.")) return;
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { error } = await supabase
      .from("estimates")
      .update({ completed_at: new Date().toISOString(), is_completed: true, status: "completed" })
      .eq("id", id)
      .eq("company_id", companyId);
    if (!error) {
      toast.success("Estimate marked as completed!");
      loadEstimate();
      router.push("/estimates/completed");
    } else {
      toast.error("Error marking as completed");
    }
  };

  const convertToInvoice = async () => {
    if (!estimate) return;
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      return;
    }

    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingInvoice) {
      toast(`Invoice already exists.`, {
        icon: "ℹ️",
        style: {
          background: "#e0f2fe",
          color: "#0369a1",
          border: "1px solid #7dd3fc",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
      router.push(`/invoices/${existingInvoice.id}`);
      return;
    }

    if (!confirm("Convert this estimate to an invoice? This will lock the estimate.")) return;
    setConverting(true);

    try {
      const invoiceNumber = estimate.estimate_number;

      const { data: duplicateInvoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("invoice_number", invoiceNumber)
        .eq("company_id", companyId)
        .maybeSingle();
      if (duplicateInvoice) {
        toast.error(`Invoice #${invoiceNumber} already exists`);
        setConverting(false);
        router.push(`/invoices/${duplicateInvoice.id}`);
        return;
      }

      const { data: items, error: itemsFetchError } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (itemsFetchError || !items || items.length === 0) {
        toast.error("No items found on this estimate");
        setConverting(false);
        return;
      }

      const { data: approvedCOs } = await supabase
        .from("change_orders")
        .select("*")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("status", "approved");
      const changeOrdersTotalAmount = (approvedCOs || []).reduce((sum, co) => sum + (co.total_amount || 0), 0) || 0;

      const originalSubtotal = calculateSubtotal(items);
      const originalTax = calculateTax(originalSubtotal, estimate.tax_rate || 0);
      const originalTotal = calculateTotal(originalSubtotal, estimate.markup || 0, estimate.discount || 0, originalTax);
      const finalTotal = originalTotal + changeOrdersTotalAmount;

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          estimate_id: id,
          client_id: estimate.client_id,
          invoice_number: invoiceNumber,
          description: estimate.description,
          subtotal: originalSubtotal + changeOrdersTotalAmount,
          markup: estimate.markup || 0,
          discount: estimate.discount || 0,
          tax: originalTax,
          total: finalTotal,
          remaining_balance: finalTotal,
          amount_paid: 0,
          notes: estimate.notes,
          signature: estimate.signature,
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          company_id: companyId,
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
        company_id: companyId,
      }));
      await supabase.from("invoice_items").insert(itemsToCopy);

      if (approvedCOs && approvedCOs.length) {
        const coItems = approvedCOs.map((co) => ({
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

      await supabase
        .from("estimates")
        .update({ status: "converted" })
        .eq("id", id)
        .eq("company_id", companyId);
      toast.success("Invoice created successfully!");
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Error creating invoice");
    } finally {
      setConverting(false);
    }
  };

  const projectsWithTotals = useMemo(() => {
    return projects.map(project => ({
      name: project.name,
      total: project.items.reduce((sum, item) => sum + (item.total || 0), 0)
    }));
  }, [projects]);

  const overallTotal = useMemo(() => {
    return projectsWithTotals.reduce((sum, p) => sum + p.total, 0);
  }, [projectsWithTotals]);

  // --- Edit mode functions ---
  const addEditItem = (projectId: string) => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      category: "Material",
      name: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      taxable: false,
      total: 0,
    };
    setEditProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, items: [...p.items, newItem] } : p))
    );
    setLastAddedItemId(newItem.id);
  };

  const updateEditItem = (projectId: string, itemId: string, field: string, value: any) => {
    setEditProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          items: p.items.map((item) => {
            if (item.id !== itemId) return item;
            const updated = { ...item, [field]: value };
            if (field === "quantity" || field === "unit_price") updated.total = updated.quantity * updated.unit_price;
            return updated;
          }),
        };
      })
    );
  };

  const removeEditItem = (projectId: string, itemId: string) => {
    setEditProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const newItems = p.items.filter((i) => i.id !== itemId);
        return { ...p, items: newItems.length ? newItems : [{ ...createEmptyItem() }] };
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

  const distributeToTargetTotal = async () => {
    if (!targetTotal || targetTotal <= 0) {
      toast.error("Please enter a valid target total");
      return;
    }

    const currentTotal = editSubtotal;
    const difference = targetTotal - currentTotal;

    if (difference === 0) {
      toast("Target total is already equal to current total", { icon: "ℹ️" });
      return;
    }

    const allLineItems = editProjects.flatMap((p) => p.items);
    if (allLineItems.length === 0) {
      toast.error("No items to distribute to");
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
    toast.success(`Total updated to ${formatCurrency(targetTotal)}`);

    await saveEdit(updatedProjects);
  };

  const addProject = () => {
    setEditProjects((prev) => [...prev, { id: crypto.randomUUID(), name: "", description: "", items: [createEmptyItem()] }]);
  };

  const removeProject = (projectId: string) => {
    if (editProjects.length === 1) return;
    setEditProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const updateProject = (projectId: string, field: string, value: any) => {
    setEditProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, [field]: value } : p)));
  };

  const saveEdit = async (projectsToSave?: ProjectWithItems[]) => {
    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const projects = projectsToSave || editProjects;
    setSaving(true);
    try {
      const allItems = projects.flatMap((p) => p.items);
      const subtotal = calculateSubtotal(allItems);
      const tax = calculateTax(subtotal, editTaxRate);

      // Same formula as approveChangeOrder/approve_public_change_order —
      // without this, saving an item edit overwrites `total` with just
      // the item-based number and silently wipes out any already-
      // approved change order's contribution.
      const { data: approvedCOs } = await supabase
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", id)
        .eq("company_id", companyId)
        .eq("status", "approved")
        .is("deleted_at", null);
      const approvedChangeOrdersTotal = (approvedCOs || []).reduce(
        (sum, co) => sum + (co.total_amount || 0),
        0
      );

      const total = calculateTotal(subtotal, editMarkup, editDiscount, tax) + approvedChangeOrdersTotal;

      const { error: updateError } = await supabase
        .from("estimates")
        .update({
          client_id: editClientId,
          title: editTitle || null,     
          description: editDescription || null,
          notes: editNotes || null,
          markup: editMarkup,
          discount: editDiscount,
          tax_rate: editTaxRate,
          subtotal,
          total,
        })
        .eq("id", id)
        .eq("company_id", companyId);
      if (updateError) throw updateError;

      await supabase.from("estimate_items").delete().eq("estimate_id", id).eq("company_id", companyId);
      const itemsToInsert = projects.flatMap((p) =>
        p.items.map((item) => ({
          estimate_id: id,
          project_name: p.name,
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
      if (itemsToInsert.length) {
        const { error: itemsError } = await supabase.from("estimate_items").insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      toast.success("Estimate updated successfully!");
      setIsEditMode(false);
      setEditProjects(projects);
      loadEstimate();
    } catch (err) {
      console.error(err);
      toast.error("Error saving changes");
    } finally {
      setSaving(false);
    }
  };

  // --- calculations ---
  const viewSubtotal = calculateSubtotal(projects.flatMap((p) => p.items));
  const viewTax = calculateTax(viewSubtotal, estimate?.tax_rate || 0);
  const viewTotal = calculateTotal(viewSubtotal, estimate?.markup || 0, estimate?.discount || 0, viewTax);

  const editAllItems = editProjects.flatMap((p) => p.items);
  const editSubtotal = calculateSubtotal(editAllItems);
  const editTax = calculateTax(editSubtotal, editTaxRate);
  const editTotal = calculateTotal(editSubtotal, editMarkup, editDiscount, editTax);

  const currentSubtotal = isEditMode ? editSubtotal : originalSubtotal;
  const currentRevisedTotal = isEditMode ? editTotal + changeOrdersTotal : revisedTotal;
  const currentRemainingBalance = currentRevisedTotal - totalPaid;
  const currentDepositAmount = currentRevisedTotal * 0.5;

  const sendSMSLink = async () => {
    let currentClient = client;
    if (!currentClient?.phone && estimate?.client_id) {
      const { data: freshClient } = await supabase
        .from("clients")
        .select("*")
        .eq("id", estimate.client_id)
        .is("deleted_at", null)
        .single();
      if (freshClient) currentClient = freshClient;
    }
    const phoneNumber = currentClient?.phone;
    if (!phoneNumber) {
      toast.error("No phone number on file. Please add a phone number to this client first.");
      return;
    }
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/estimates/${id}`;
    const totalAmount = projects.reduce((sum, p) => sum + p.items.reduce((s, i) => s + (i.total || 0), 0), 0);
    const message = encodeURIComponent(
      `Hello ${currentClient?.name || "Customer"}! Please review and sign your estimate: ${documentUrl}\n\n` +
        `Estimate #${estimate?.estimate_number}\n` +
        `Total: $${totalAmount.toFixed(2)}\n\n` +
        `Click the link above to view and sign. Thank you!`
    );
    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      invoiced: "bg-blue-100 text-blue-800",
    };
    return styles[status] || "bg-gray-100";
  };

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 text-slate-800 antialiased text-xs">
      {/* Target Total Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl shadow-slate-900/10 border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                <Target size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Set Target Total</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">Current Structure: <span className="font-mono font-semibold text-slate-700">{formatCurrency(editTotal)}</span></p>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">$</span>
              <input
                type="number"
                value={targetTotal || ""}
                onChange={(e) => setTargetTotal(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white text-sm transition-all"
                placeholder="0.00"
                step="0.01"
                autoFocus
              />
            </div>
            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2.5 mb-5 flex items-center gap-2 font-medium">
              <Sparkles size={14} className="text-emerald-500 shrink-0" />
              <span>Difference will be distributed across {editProjects.flatMap((p) => p.items).length} items</span>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowTargetModal(false)} className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl transition-colors">Cancel</button>
              <button onClick={distributeToTargetTotal} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm shadow-emerald-600/10 transition-colors">Apply Matrix</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Order Modal */}
      {showChangeOrderModal && (
        <ChangeOrderModal
          estimateId={id as string}
          estimateTotal={estimate?.total || 0}
          existingOrder={editingChangeOrder}
          onClose={() => {
            setShowChangeOrderModal(false);
            setEditingChangeOrder(null);
          }}
          onSaved={async () => {
            await loadChangeOrders();
            await loadEstimate();
            setShowChangeOrderModal(false);
            setEditingChangeOrder(null);
          }}
        />
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-50 max-w-3xl mx-auto w-full px-4 pt-3 pb-2 bg-slate-50/95 backdrop-blur-md">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3 flex flex-col gap-2.5 relative overflow-hidden transition-all">
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 border border-slate-100 bg-white shadow-3xs transition-all active:scale-95 shrink-0">
                <ArrowLeft size={14} />
              </button>
              <div className="min-w-0">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Customer</span>
                {isEditMode ? (
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full bg-emerald-700/80 border border-emerald-600 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white placeholder:text-slate-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40 transition-all"
                  >
                    <option value="">Select a client…</option>
                    {clientList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <h3 className="text-xs font-black text-slate-800 tracking-tight truncate">
                      {client?.name || "Unassigned Account"}
                    </h3>
                    {client?.email && (
                      <p className="text-[10px] text-slate-400 font-medium truncate hidden sm:block mt-0.5">{client.email}</p>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 min-w-0 justify-self-end w-full max-w-[180px] sm:max-w-none">
              <div className="min-w-0 text-left sm:text-right sm:ml-auto">
                <div className="flex items-center sm:justify-end gap-1.5 flex-wrap">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Estimate</span>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border tracking-wide uppercase scale-90 origin-left sm:origin-right ${
                    estimate?.signature ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                    estimate?.status === "converted" ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}>
                    {estimate?.signature ? "✓ Signed" : estimate?.status === "converted" ? "Converted" : "● Pending"}
                  </span>
                </div>
                <p className="text-xs font-bold font-mono text-slate-600 block tracking-tight truncate mt-0.5">
                  #{estimate?.estimate_number || id?.slice(0, 8)}
                </p>
              </div>
              <div className="shrink-0">
                {!isEditMode && !estimate?.signature && estimate?.status !== "converted" && (
                  <button onClick={() => setIsEditMode(true)} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50/60 rounded-xl border border-slate-200/60 bg-white shadow-3xs transition-all active:scale-95 flex items-center gap-1 text-xs font-bold">
                    <SquarePen size={13} />
                    <span className="hidden sm:inline pr-0.5">Modify</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          {isEditMode && (
            <div className="mt-0.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-1.5 flex items-center justify-between gap-4 animate-in slide-in-from-top-1 duration-150 relative overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <p className="text-[11px] font-bold text-amber-900 truncate">Workspace Locked <span className="font-medium text-amber-700/90 hidden xs:inline">(Modifying Matrix)</span></p>
              </div>
              <div className="flex gap-1.5 shrink-0 scale-95 origin-right">
                <button onClick={() => setIsEditMode(false)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-3xs">Cancel</button>
                <button onClick={() => saveEdit()} disabled={saving} className="rounded-lg bg-slate-950 px-3 py-1 text-[11px] font-black text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">{saving ? "Saving..." : "Save Edit"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
          <div className="max-w-3xl mx-auto p-4 space-y-4">
  {/* Title */}
  {isEditMode ? (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">
        Estimate Title <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className="w-full text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none"
        placeholder="e.g., Roof Repair - 123 Main St"
        required
      />
    </div>
  ) : (
    estimate?.title && (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/70 p-3 relative overflow-hidden">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Title</span>
        <p className="text-sm font-semibold text-slate-800">{estimate.title}</p>
      </div>
    )
  )}
          </div>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Project Description Scope */}
        {isEditMode ? (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200/70 p-3.5 space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <FileText size={12} /> Project Scope Objective
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full min-h-[100px] text-xs leading-relaxed text-slate-800 focus:outline-none bg-slate-50/50 border border-slate-200 rounded-xl p-3 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/5 transition-all resize-none"
              rows={4}
              placeholder="Enter primary target objectives and scope detail..."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/70 relative overflow-hidden">
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-slate-300" />
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">Project Scope Objective</span>
            <p className="text-xs leading-relaxed font-medium text-slate-600 whitespace-pre-wrap capitalize">
              {estimate?.description || "No specific scope definition provided."}
            </p>
          </div>
        )}

        {/* Progress Display */}
        <ProgressDisplay
          estimateId={id as string}
          projects={projectsWithTotals}
          hasPayment={totalPaid > 0}
          paymentNote={formatCurrency(totalPaid)}
          totalPaid={totalPaid}
          overallTotal={overallTotal}
          refreshKey={progressRefresh}
        />

        {/* Camera Uploader */}
        {estimate && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
            <EstimateCamera estimateId={estimate.id} onUploaded={() => setGalleryRefresh((n) => n + 1)} />
          </div>
        )}

        {/* Projects */}
        <div className="space-y-3.5">
          {(isEditMode ? editProjects : projects).map((project, projectIdx) => (
            <div key={project.id} className="bg-white rounded-xl shadow-xs border border-slate-200/70 overflow-hidden group">
              <div className="bg-slate-900 text-white px-3.5 py-2 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-950/60 border border-emerald-900/50 px-2 py-0.5 rounded font-mono tracking-tight shrink-0">
                    STAGE {String(projectIdx + 1).padStart(2, '0')}
                  </span>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(e) => updateProject(project.id, "name", e.target.value)}
                    placeholder="Name this project stage..."
                    className={`flex-1 text-white placeholder:text-slate-500 text-xs font-black focus:outline-none truncate ${
                      isEditMode
                        ? "bg-slate-500/60 border border-slate-600/60 rounded-lg px-3.5 py-1.5 focus:border-slate-200 focus:ring-1 focus:ring-slate-300/40 transition-all"
                        : "bg-transparent"
                    }`}
                    disabled={!isEditMode}
                  />
                </div>
                {isEditMode && editProjects.length > 1 && (
                  <button onClick={() => removeProject(project.id)} className="text-slate-500 hover:text-rose-400 p-1 transition-colors rounded-lg hover:bg-white/5">
                    <X size={14} />
                  </button>
                )}
              </div>

              {isEditMode ? (
                <div className="px-3 pt-3">
                  <textarea
                    value={project.description || ""}
                    onChange={(e) => updateProject(project.id, "description", e.target.value)}
                    rows={1}
                    placeholder="Stage operational notes or conditions (optional)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 focus:bg-white transition-all resize-none"
                  />
                </div>
              ) : (
                project.description && (
                  <div className="px-4 pt-2.5 text-[11px] text-slate-400 font-medium italic flex items-center gap-1.5 border-b border-slate-50 pb-1">
                    <span className="text-slate-300 shrink-0">↳</span>
                    <span>{project.description}</span>
                  </div>
                )
              )}

              <div className="px-3.5 py-2 divide-y divide-slate-100">
                {project.items.map((item, itemIdx) => (
                  <div key={item.id} ref={(el) => { newItemRefs.current[item.id] = el; }} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1.5 animate-in fade-in duration-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-slate-300 w-4 text-right shrink-0">{String(itemIdx + 1).padStart(2, '0')}</span>
                        <div className="flex-1 min-w-0">
                          {isEditMode ? (
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateEditItem(project.id, item.id, "name", e.target.value)}
                              placeholder="Item allocation title"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-300 transition-colors placeholder:text-slate-400"
                            />
                          ) : (
                            <div className="truncate font-bold text-slate-800 tracking-tight text-xs capitalize">{item.name}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 text-slate-500 font-medium text-[11px]">
                          {isEditMode ? (
                            <div className="flex items-center gap-1 border border-slate-200 bg-slate-50/50 rounded-lg px-2 py-0.5 focus-within:bg-white focus-within:border-slate-300 transition-all">
                              <span className="text-[8px] text-slate-400 font-extrabold uppercase">Qty</span>
                              <input
                                type="number"
                                value={item.quantity === 0 ? "" : item.quantity}
                                onChange={(e) => updateEditItem(project.id, item.id, "quantity", Number(e.target.value) || 0)}
                                className="w-9 text-center bg-transparent focus:outline-none font-bold text-slate-800 text-xs"
                                placeholder="0"
                              />
                            </div>
                          ) : (
                            <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold tracking-tight">{item.quantity} <span className="text-[9px] text-slate-400 font-medium uppercase">units</span></span>
                          )}
                          <span className="text-slate-300 font-light mx-0.5">×</span>
                          {isEditMode ? (
                            <div className="flex items-center gap-1 border border-slate-200 bg-slate-50/50 rounded-lg px-2 py-0.5 focus-within:bg-white focus-within:border-slate-300 transition-all">
                              <span className="text-[8px] text-slate-400 font-extrabold">$</span>
                              <input
                                type="number"
                                value={item.unit_price === 0 ? "" : item.unit_price}
                                onChange={(e) => updateEditItem(project.id, item.id, "unit_price", Number(e.target.value) || 0)}
                                className="w-16 text-right bg-transparent focus:outline-none font-mono font-bold text-slate-800 text-xs"
                                placeholder="0.00"
                                step="0.01"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-slate-600 font-semibold">{formatCurrency(item.unit_price)}</span>
                          )}
                        </div>
                        <div className="w-20 text-right font-black font-mono text-slate-800 text-xs tracking-tight">
                          {formatCurrency(isEditMode ? (item.quantity * item.unit_price) : (item.total || 0))}
                        </div>
                        {isEditMode && (
                          <button onClick={() => removeEditItem(project.id, item.id)} className="p-1 text-slate-300 hover:text-rose-500 rounded-md transition-colors hover:bg-slate-50">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {item.description && !isEditMode && (
                      <div className="text-[11px] text-slate-400 pl-6 font-medium italic leading-relaxed">— {item.description}</div>
                    )}
                  </div>
                ))}
              </div>

              {isEditMode && (
                <div className="flex justify-start px-3.5 pb-3 pt-1">
                  <button type="button" onClick={() => addEditItem(project.id)} className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100/60 px-3 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-all active:scale-95">
                    <Plus size={10} strokeWidth={3} /> Add Line Allocation
                  </button>
                </div>
              )}

              <div className="bg-slate-50/70 px-4 py-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Stage Composite Subtotal</span>
                <span className="font-black font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200/60 shadow-3xs">
                  {formatCurrency(isEditMode ? calculateSubtotal(project.items) : project.items.reduce((sum, i) => sum + (i.total || 0), 0))}
                </span>
              </div>
            </div>
          ))}
        </div>

        {isEditMode && (
          <button onClick={addProject} className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-emerald-300 bg-white text-slate-600 hover:text-emerald-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-2xs group active:scale-99">
            <Plus size={14} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
            <span>Append Project Structural Stage</span>
          </button>
        )}

        {/* Change Orders List */}
        {!isEditMode && changeOrders.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-blue-100 shadow-sm shadow-blue-50/50 p-4 space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 relative z-10">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <h3 className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Project Change Order</h3>
              </div>
              <button
                onClick={() => {
                  setEditingChangeOrder(null);
                  setShowChangeOrderModal(true);
                }}
                className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors"
              >
                + New Change Order
              </button>
            </div>
            <div className="space-y-2 relative z-10">
              {changeOrders.map((co) => (
                <div key={co.id} className={`p-3 rounded-xl flex justify-between items-center gap-3 border transition-all ${
                  co.status === "pending" ? "border-amber-200 bg-amber-50/40 shadow-3xs" :
                  co.status === "approved" ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100 bg-slate-50/40"
                }`}>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-slate-800 text-xs truncate max-w-[180px] flex items-center gap-1.5">
                        <span className="text-[9px] font-mono font-medium text-slate-400 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50">{co.change_order_number}</span>
                        <span className="truncate">{co.title}</span>
                      </div>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider ${
                        co.status === "pending" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                        co.status === "approved" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                        co.status === "rejected" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                        "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}>
                        {co.status}
                      </span>
                    </div>
                    {co.description && <p className="text-[11px] text-slate-400 line-clamp-1 font-medium italic pl-1">— {co.description}</p>}
                  </div>
                  <div className="text-right whitespace-nowrap shrink-0 flex flex-col items-end gap-1.5">
                    <span className={`text-xs font-black font-mono tracking-tight ${co.total_amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {co.total_amount >= 0 ? "+" : "-"}{formatCurrency(Math.abs(co.total_amount))}
                    </span>
                    <div className="flex justify-end gap-1.5 text-[10px]">
                      {co.status === "draft" && (
                        <>
                          <button onClick={() => { setEditingChangeOrder(co); setShowChangeOrderModal(true); }} className="text-blue-600 hover:underline font-bold">Edit</button>
                          <button onClick={() => submitForApproval(co.id)} className="text-emerald-600 hover:underline font-bold">Submit</button>
                          <button onClick={() => deleteChangeOrder(co.id, co.status)} className="text-rose-500 hover:underline font-bold">Delete</button>
                        </>
                      )}
                      {co.status === "pending" && (
                        <>
                          <button onClick={() => approveChangeOrder(co.id)} className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded-md hover:bg-emerald-700 transition-colors shadow-2xs">Approve</button>
                          <button onClick={() => rejectChangeOrder(co.id)} className="text-rose-500 hover:underline font-bold">Reject</button>
                        </>
                      )}
                      {co.status === "rejected" && (
                        <button onClick={() => { setEditingChangeOrder(co); setShowChangeOrderModal(true); }} className="text-blue-600 hover:underline font-bold">Edit & Resubmit</button>
                      )}
                      {co.status === "approved" && (
                        <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-0.5">✓ Applied</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial Summary Card */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-950 flex flex-col gap-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-36 w-36 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex-1 text-xs space-y-1.5">
            <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 mb-1.5 flex justify-between items-center">
              <span>Financial Summary</span>
              {isEditMode && (
                <button onClick={() => setShowTargetModal(true)} className="text-[9px] font-extrabold text-emerald-400 underline hover:text-emerald-300 flex items-center gap-0.5">
                  🎯 Set Target Total
                </button>
              )}
            </div>
            <div className="space-y-1 font-mono text-slate-400 text-[11px]">
              <div className="flex justify-between">
                <span>Original Estimate Subtotal</span>
                <span className="text-slate-200">{formatCurrency(currentSubtotal)}</span>
              </div>
              {changeOrdersTotal !== 0 && (
                <div className="flex justify-between text-blue-400">
                  <span>Approved Change Orders</span>
                  <span>+{formatCurrency(changeOrdersTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                <span><strong>Revised Total</strong></span>
                <span className="text-slate-200 font-semibold">{formatCurrency(currentRevisedTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Deposit (50% of Revised Total)</span>
                <span className="text-emerald-300">{formatCurrency(currentDepositAmount)}</span>
              </div>
              {totalPaid > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Payments Received</span>
                  <span>-{formatCurrency(totalPaid)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-800 pt-1 mt-1 text-sm font-bold">
                <span>Current Balance Due</span>
                <span className="text-white">{formatCurrency(currentRemainingBalance)}</span>
              </div>
              {pendingChangeOrdersTotal !== 0 && (
                <>
                  <div className="flex justify-between text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded -mx-2">
                    <span>Pending Change Orders</span>
                    <span>+{formatCurrency(pendingChangeOrdersTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-yellow-700 pt-1 mt-1 text-sm font-bold text-yellow-300 bg-yellow-900/20 px-2 py-1 rounded -mx-2">
                    <span>Potential Balance Due</span>
                    <span>{formatCurrency(currentRemainingBalance + pendingChangeOrdersTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200/60 flex justify-between items-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Payment History</span>
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200/60 px-1.5 py-0.5 rounded shadow-3xs">{payments.length} Payment(s)</span>
            </div>
            <div className="divide-y divide-slate-100 px-3.5">
              {payments.map((p) => (
                <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100/40 shrink-0"><Receipt size={12} /></div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-800 font-mono">{formatCurrency(p.amount)}</div>
                      <div className="text-[10px] font-medium text-slate-400 mt-0.5 capitalize flex items-center gap-1.5">
                        <span>● {p.method}</span>
                        <span className="text-slate-200">|</span>
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature Block */}
        {!isEditMode && (
          <div className="bg-white rounded-xl p-3.5 shadow-xs border border-slate-200/70">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={12} className="text-slate-300" /> Authorized Customer Endorsement
            </div>
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-1 shadow-inner">
              <SignaturePad
                onSave={saveSignature}
                onRemove={removeSignature}
                isCompleted={estimate?.is_completed}
                existingSignature={estimate?.signature}
                buttonText="Need Customer Signature"
                showRemoveButton={true}
                estimateId={id as string}
                onRefresh={loadEstimate}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        {isEditMode ? (
          <div className="bg-white rounded-xl p-3 shadow-xs border border-slate-200/70 focus-within:border-slate-300 transition-all">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Memos & Terms for Client</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full text-xs text-slate-700 focus:outline-none bg-slate-50/50 rounded-lg p-2 resize-none"
              rows={2}
              placeholder="Enter terms, valid days, or schedule notes for the client..."
            />
          </div>
        ) : (
          estimate?.notes && (
            <div className="bg-white rounded-xl p-3.5 shadow-xs border border-slate-200/70 text-xs text-slate-500 relative overflow-hidden">
              <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px] block mb-1">Terms & Conditions Note</span>
              <p className="text-slate-600 font-medium leading-relaxed italic">{estimate.notes}</p>
            </div>
          )
        )}

        {/* Convert / Complete Buttons */}
        {!isEditMode && estimate?.signature && (
          <div className="space-y-2.5 pt-2 border-t border-slate-200/60">
            {existingInvoiceId ? (
              <button onClick={() => router.push(`/invoices/${existingInvoiceId}`)} className="w-full py-2.5 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1.5">
                <span>View Related Live Invoice (Already Generated)</span>
              </button>
            ) : (
              <button onClick={convertToInvoice} disabled={converting} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs tracking-wide transition-all shadow-md shadow-emerald-600/10 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <span>{converting ? "Processing Ledger..." : "Convert Scope to Invoice Asset"}</span>
              </button>
            )}
            {estimate?.status !== "completed" && (
              <button onClick={markAsCompleted} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1.5">
                <span>Mark Project Cycle as Completed</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      {!isEditMode && (
        <div className="fixed bottom-21 right-6 z-50" onMouseEnter={() => setFabOpen(true)} onMouseLeave={() => setFabOpen(false)}>
          <div className={`absolute bottom-full right-0 pb-3 flex flex-col items-end gap-1.5 transition-all duration-200 transform origin-bottom ${
            fabOpen ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-4 pointer-events-none"
          }`}>
            {!estimate?.signature && (
              <button onClick={() => { setIsEditMode(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
                <SquarePen size={12} /> <span>Edit</span>
              </button>
            )}
            <button
              onClick={() => {
                setEditingChangeOrder(null);
                setShowChangeOrderModal(true);
                setFabOpen(false);
              }}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors whitespace-nowrap"
            >
              <FileEdit size={12} /> <span>Change Order</span>
            </button>
            <button onClick={() => { setShowFinancialsModal(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
              <DollarSign size={12} /> <span>Project Payments</span>
            </button>
            <button onClick={() => { setShowExpenseModal(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
              <Receipt size={12} /> <span> Expense</span>
            </button>
            <button onClick={() => { sendSMSLink(); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
              <Send size={12} /> <span>SMS</span>
            </button>
            <Link href={`/api/estimates/${id}/pdf`} target="_blank" onClick={() => setFabOpen(false)} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
              <FileText size={12} /> <span>PDF</span>
            </Link>
            <button
              onClick={() => setShowProgressModal(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md border border-slate-100 hover:bg-emerald-500 transition-colors"
            >
              <TrendingUp size={12} className="text-white" />
              <span> Project Progress</span>
            </button>
          </div>
          <button onClick={() => setFabOpen(!fabOpen)} className="h-12 w-12 rounded-full bg-emerald-600 text-white shadow-xl hover:bg-emerald-500 transition-all duration-150 flex items-center justify-center active:scale-95">
            <Plus size={20} className={`transition-transform duration-200 ${fabOpen ? "rotate-45" : "rotate-0"}`} />
          </button>
        </div>
      )}

      <ProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        estimateId={id as string}
        projects={projects.map(p => ({ name: p.name }))}
        onSaved={() => {
          loadEstimate();
          setProgressRefresh(prev => prev + 1);
        }}
      />

      <ProjectFinancialsModal
        isOpen={showFinancialsModal}
        onClose={() => setShowFinancialsModal(false)}
        estimateId={id as string}
        estimateTotal={revisedTotal}
        onRefresh={() => {
          loadSubcontractorPaid();
          loadEstimate();
        }}
      />

      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        estimateId={id as string}
        onRefresh={() => loadEstimate()}
      />
    </div>
  );
}

// =============== Change Order Modal (with company_id) ===============
function ChangeOrderModal({
  estimateId,
  estimateTotal,
  existingOrder,
  onClose,
  onSaved,
}: {
  estimateId: string;
  estimateTotal: number;
  existingOrder: ChangeOrder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<ChangeOrderLineItem[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, total: 0, type: "addition" },
  ]);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompany = async () => {
      const cid = await getCompanyId();
      setCompanyId(cid);
    };
    fetchCompany();
  }, []);

  useEffect(() => {
    if (existingOrder) {
      setTitle(existingOrder.title);
      setDescription(existingOrder.description || "");
      loadLineItems(existingOrder.id);
    }
  }, [existingOrder]);

  async function loadLineItems(coId: string) {
    if (!companyId) return;
    const { data } = await supabase
      .from("change_order_line_items")
      .select("*")
      .eq("change_order_id", coId)
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (data && data.length) {
      const items = data.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        type: item.type,
      }));
      setLineItems(items);
    }
  }

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, total: 0, type: "addition" },
    ]);
  };

  const updateLineItem = (id: string, field: string, value: any) => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") updated.total = updated.quantity * updated.unit_price;
        return updated;
      })
    );
  };

  const removeLineItem = (id: string) => {
    setLineItems((items) => items.filter((item) => item.id !== id));
  };

  const calculateTotalChange = () => {
    return lineItems.reduce((sum, item) => sum + (item.type === "addition" ? item.total : -item.total), 0);
  };

  const revisedTotal = estimateTotal + calculateTotalChange();

  const handleSave = async () => {
    if (!title.trim()) {
      alert("Please enter a title");
      return;
    }
    if (lineItems.length === 0 || lineItems.every((i) => i.total === 0)) {
      alert("Add at least one line item with a value");
      return;
    }
    if (!companyId) {
      alert("Company not found. Please refresh.");
      return;
    }

    setSaving(true);
    const totalChange = calculateTotalChange();

    try {
      if (existingOrder) {
        const { error: updateError } = await supabase
          .from("change_orders")
          .update({
            title,
            description,
            total_amount: totalChange,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingOrder.id)
          .eq("company_id", companyId);
        if (updateError) throw updateError;

        await supabase
          .from("change_order_line_items")
          .delete()
          .eq("change_order_id", existingOrder.id)
          .eq("company_id", companyId);

        const itemsToInsert = lineItems.map((item) => ({
          change_order_id: existingOrder.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.quantity * item.unit_price,
          type: item.type,
          company_id: companyId,
        }));
        if (itemsToInsert.length) {
          const { error: itemsError } = await supabase.from("change_order_line_items").insert(itemsToInsert);
          if (itemsError) throw itemsError;
        }
      } else {
        const { data: estimateData, error: estError } = await supabase
          .from("estimates")
          .select("total")
          .eq("id", estimateId)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .single();
        if (estError || !estimateData) {
          alert("Could not fetch estimate data. Please try again.");
          setSaving(false);
          return;
        }

        const { count } = await supabase
          .from("change_orders")
          .select("id", { count: "exact", head: true })
          .eq("estimate_id", estimateId)
          .eq("company_id", companyId)
          .is("deleted_at", null);

        const coNumber = `CO-${(count || 0) + 1}`;

        const { data: newCo, error: createError } = await supabase
          .from("change_orders")
          .insert({
            estimate_id: estimateId,
            change_order_number: coNumber,
            title,
            description,
            original_estimate_total: estimateData.total,
            total_amount: totalChange,
            status: "draft",
            company_id: companyId,
          })
          .select()
          .single();
        if (createError) throw createError;

        const itemsToInsert = lineItems.map((item) => ({
          change_order_id: newCo.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.quantity * item.unit_price,
          type: item.type,
          company_id: companyId,
        }));
        if (itemsToInsert.length) {
          const { error: itemsError } = await supabase.from("change_order_line_items").insert(itemsToInsert);
          if (itemsError) throw itemsError;
        }
      }
      onSaved();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error saving change order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">{existingOrder ? "Edit Change Order" : "New Change Order"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border rounded-lg p-2 text-sm"
              placeholder="e.g., Additional framing work"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full border rounded-lg p-2 text-sm"
              placeholder="Optional details..."
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button onClick={addLineItem} className="text-xs text-green-600 flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between mb-2">
                    <select
                      value={item.type}
                      onChange={(e) => updateLineItem(item.id, "type", e.target.value)}
                      className="text-xs border rounded px-2 py-1"
                    >
                      <option value="addition">➕ Addition</option>
                      <option value="deduction">➖ Deduction</option>
                    </select>
                    <button onClick={() => removeLineItem(item.id)} className="text-red-500"><Trash2 size={14} /></button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    className="w-full border rounded p-2 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500">Quantity</label>
                      <input
                        type="number"
                        value={item.quantity === 0 ? "" : item.quantity}
                        onChange={(e) => updateLineItem(item.id, "quantity", Number(e.target.value) || 0)}
                        className="w-full border rounded p-2 text-sm"
                        step="1"
                        min="0"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500">Unit Price ($)</label>
                      <input
                        type="number"
                        value={item.unit_price === 0 ? "" : item.unit_price}
                        onChange={(e) => updateLineItem(item.id, "unit_price", Number(e.target.value) || 0)}
                        className="w-full border rounded p-2 text-sm"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div className="flex-1 text-right">
                      <label className="text-[10px] text-gray-500">Total</label>
                      <div className="text-sm font-semibold mt-1">{formatCurrency(item.total)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span>Original Estimate Total:</span>
              <span>{formatCurrency(estimateTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Total Change:</span>
              <span className={calculateTotalChange() >= 0 ? "text-green-600" : "text-red-600"}>
                {calculateTotalChange() >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(calculateTotalChange()))}
              </span>
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
              <span>Revised Total:</span>
              <span>{formatCurrency(revisedTotal)}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button onClick={onClose} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm">
              {saving ? "Saving..." : existingOrder ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}