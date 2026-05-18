"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate, Client, Project, LineItem, Signature } from "@/types";
import { formatCurrency } from "@/lib/utils/formatting";
import { calculateSubtotal, calculateTax, calculateTotal } from "@/lib/utils/calculations";
import Header from "@/components/ui/Header";
import Card from "@/components/ui/Card";
import SignaturePad from "@/components/signature/SignaturePad";
import Link from "next/link";
import { generateInvoiceNumber } from "@/lib/utils/invoiceNumber";
import { SquarePen, Send, FileText } from "lucide-react";

export default function EstimatePage() {
const router = useRouter();
const { id } = useParams();
const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [client, setClient] = useState<Client | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
      const [loading, setLoading] = useState(true);
      const [converting, setConverting] = useState(false);

      // Edit mode states
      const [isEditMode, setIsEditMode] = useState(false);
      const [editDescription, setEditDescription] = useState("");
      const [editNotes, setEditNotes] = useState("");
      const [editMarkup, setEditMarkup] = useState(0);
      const [editDiscount, setEditDiscount] = useState(0);
      const [editTaxRate, setEditTaxRate] = useState(0);
      const [editProjects, setEditProjects] = useState<Project[]>([]);
        const [saving, setSaving] = useState(false);
        const [fabOpen, setFabOpen] = useState(false);

        useEffect(() => {
        loadEstimate();
        }, [id]);

        async function loadEstimate() {
        try {
        const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .single();
        setEstimate(est);

        // Set edit values
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

        const projectMap: Record<string, Project> = {};
          items?.forEach((item) => {
          const projectName = item.project_name || "Main Project";
          if (!projectMap[projectName]) {
          projectMap[projectName] = {
          id: crypto.randomUUID(),
          name: projectName,
          line_items: [],
          };
          }
          projectMap[projectName].line_items.push(item);
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

          // Edit mode item functions
          const addEditItem = (projectId: string) => {
          setEditProjects(prev => prev.map(project => {
          if (project.id !== projectId) return project;
          return {
          ...project,
          line_items: [...project.line_items, {
          id: crypto.randomUUID(),
          category: "Material",
          name: "",
          description: "",
          quantity: 1,
          unit_price: 0,
          taxable: false,
          total: 0
          }]
          };
          }));
          };

          const updateEditItem = (projectId: string, itemId: string, field: string, value: any) => {
          setEditProjects(prev => prev.map(project => {
          if (project.id !== projectId) return project;
          return {
          ...project,
          line_items: project.line_items.map(item => {
          if (item.id !== itemId) return item;
          const updated = { ...item, [field]: value };
          updated.total = updated.quantity * updated.unit_price;
          return updated;
          })
          };
          }));
          };

          const removeEditItem = (projectId: string, itemId: string) => {
          setEditProjects(prev => prev.map(project => {
          if (project.id !== projectId) return project;
          return {
          ...project,
          line_items: project.line_items.filter(item => item.id !== itemId)
          };
          }));
          };

          const saveEdit = async () => {
          setSaving(true);

          try {
          // Flatten all items for calculation
          const allItems = editProjects.flatMap(p => p.line_items);
          const subtotal = calculateSubtotal(allItems);
          const tax = calculateTax(subtotal, editTaxRate);
          const total = calculateTotal(subtotal, editMarkup, editDiscount, tax);

          // Update estimate
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

          // Delete existing items
          await supabase.from("estimate_items").delete().eq("estimate_id", id);

          // Insert updated items
          const itemsToInsert = editProjects.flatMap(project =>
          project.line_items.map(item => ({
          estimate_id: id,
          project_name: project.name,
          category: item.category,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          taxable: item.taxable,
          total: item.quantity * item.unit_price
          }))
          );

          if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from("estimate_items").insert(itemsToInsert);
          if (itemsError) throw itemsError;
          }

          alert("Estimate updated successfully!");
          setIsEditMode(false);
          loadEstimate(); // Reload fresh data
          } catch (err) {
          console.error(err);
          alert("Error saving changes");
          } finally {
          setSaving(false);
          }
          };

          // Calculate totals for view mode
          const viewSubtotal = calculateSubtotal(projects.flatMap(p => p.line_items));
          const viewTax = calculateTax(viewSubtotal, estimate?.tax_rate || 0);
          const viewTotal = calculateTotal(viewSubtotal, estimate?.markup || 0, estimate?.discount || 0, viewTax);

          // Calculate totals for edit mode
          const editAllItems = editProjects.flatMap(p => p.line_items);
          const editSubtotal = calculateSubtotal(editAllItems);
          const editTax = calculateTax(editSubtotal, editTaxRate);
          const editTotal = calculateTotal(editSubtotal, editMarkup, editDiscount, editTax);

          // Add this function in your component for SMS
          const sendSMSLink = () => {
          const phoneNumber = client?.phone;
          if (!phoneNumber) {
          alert("No phone number on file. Please add a phone number to this client first.");
          return;
          }

          const baseUrl = window.location.origin;
          const documentUrl = `${baseUrl}/public/estimates/${id}`;
          const total = projects.reduce((sum, p) =>
          sum + p.line_items.reduce((s, i) => s + (i.total || 0), 0), 0);

          const message = encodeURIComponent(
          `Hello ${client?.name}! Please review and sign your estimate: ${documentUrl}\n\n` +
          `Estimate #${estimate?.estimate_number }\n` +
          `Total: $${total.toFixed(2)}\n\n` +
          `Click the link above to view and sign. Thank you!`
          );

          window.location.href = `sms:${phoneNumber}?body=${message}`;
          };

          // Add this function to convert estimate to invoice
          const convertToInvoice = async () => {
          if (!estimate) return;

          setConverting(true);

          try {
          const invoiceNumber = estimate.estimate_number;

          const { data: invoice, error } = await supabase
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
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
          })
          .select()
          .single();

          if (error) throw error;

          // copy items (YOU WERE MISSING THIS BEFORE)
          const itemsToCopy = projects.flatMap((p) =>
          p.line_items.map((item) => ({
          invoice_id: invoice.id,
          project_name: p.name,
          category: item.category,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          taxable: item.taxable,
          total: item.total,
          }))
          );

          await supabase.from("invoice_items").insert(itemsToCopy);

          await supabase
          .from("estimates")
          .update({ status: "converted" })
          .eq("id", id);

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
          <div className="min-h-screen bg-[#f6f7f9] pb-24">
            <Header title={`Estimate #${id?.slice(0, 8)}`} backLink="/estimates" rightAction={null} />

            {/* EDIT MODE */}
            {isEditMode && (
            <div className="sticky top-14 z-20 mx-auto mt-3 max-w-4xl px-4">
              <div
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
                <div className="text-xs font-medium text-amber-700">
                  Editing Estimate
                </div>

                <div className="flex gap-2">
                  <button onClick={()=> setIsEditMode(false)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600
                    hover:bg-gray-50"
                    >
                    Cancel
                  </button>

                  <button onClick={saveEdit} disabled={saving}
                    className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-black">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
            )}

            <div className="mx-auto max-w-4xl space-y-3 p-4">

              {/* TOP BAR */}
              <div
                className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Estimate
                  </div>
                  <div className="text-sm font-semibold text-gray-800">
                    #{estimate?.estimate_number || id?.slice(0, 8)}
                  </div>
                </div>

                <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${ estimate?.signature
                  ? "bg-green-100 text-green-700" : estimate?.status==="converted" ? "bg-purple-100 text-purple-700"
                  : "bg-yellow-100 text-yellow-700" }`}>
                  {estimate?.signature
                  ? "Signed"
                  : estimate?.status === "converted"
                  ? "Converted"
                  : "Pending"}
                </span>
              </div>

              {/* CLIENT */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Client
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-800">
                    {client?.name || "No Client"}
                  </div>

                  {client?.phone && (
                  <div className="text-xs text-gray-500">{client.phone}</div>
                  )}

                  {client?.email && (
                  <div className="text-xs text-gray-500">{client.email}</div>
                  )}
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Description
                </div>

                {isEditMode ? (
                <textarea value={editDescription} onChange={(e)=> setEditDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-gray-400"
          placeholder="Description..."
        />
      ) : (
        <p className="text-sm leading-6 text-gray-600">
          {estimate?.description || "No description"}
        </p>
      )}
    </div>

    {/* ITEMS */}
    {(isEditMode ? editProjects : projects).map((project) => (
      <div
        key={project.id}
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">
            {project.name}
          </div>

          {isEditMode && (
            <button
              onClick={() => addEditItem(project.id)}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-200"
            >
              + Add Item
            </button>
          )}
        </div>

        <div className="space-y-3">
          {project.line_items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3"
            >
              {isEditMode ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) =>
                        updateEditItem(
                          project.id,
                          item.id,
                          "name",
                          e.target.value
                        )
                      }
                      placeholder="Item"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
                    />

                    <button
                      onClick={() =>
                        removeEditItem(project.id, item.id)
                      }
                      className="rounded-lg bg-red-50 px-3 text-red-500"
                    >
                      ✕
                    </button>
                  </div>

                  <textarea
                    value={item.description || ""}
                    onChange={(e) =>
                      updateEditItem(
                        project.id,
                        item.id,
                        "description",
                        e.target.value
                      )
                    }
                    rows={1}
                    placeholder="Description"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
                  />

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateEditItem(
                          project.id,
                          item.id,
                          "quantity",
                          Number(e.target.value)
                        )
                      }
                      className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />

                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) =>
                        updateEditItem(
                          project.id,
                          item.id,
                          "unit_price",
                          Number(e.target.value)
                        )
                      }
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />

                    <div className="flex items-center text-sm font-medium text-gray-700">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {item.name}
                    </div>

                    {item.description && (
                      <div className="mt-1 text-xs leading-5 text-gray-500">
                        {item.description}
                      </div>
                    )}

                    <div className="mt-1 text-[11px] text-gray-400">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unit_price)}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-gray-800">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ))}

    {/* SUMMARY */}
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Summary
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(viewSubtotal)}</span>
        </div>

        {estimate?.markup && estimate.markup > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Markup</span>
    <span>+{formatCurrency(estimate.markup)}</span>
  </div>
)}

        {estimate?.discount && estimate.discount > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Discount</span>
    <span>-{formatCurrency(estimate.discount)}</span>
  </div>
)}

 

        <div className="flex justify-between text-gray-600">
          <span>Tax</span>
          <span>{formatCurrency(viewTax)}</span>
        </div>

        <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900">
          <span>Total</span>
          <span>{formatCurrency(viewTotal)}</span>
        </div>
      </div>
    </div>

    {/* SIGNATURE */}
    {!isEditMode && (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Customer Signature
        </div>

        <SignaturePad
          onSave={saveSignature}
          existingSignature={estimate?.signature}
          buttonText="Sign Estimate"
        />
      </div>
    )}

    {/* NOTES */}
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Notes
      </div>

      {isEditMode ? (
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          rows={3}
          placeholder="Notes..."
          className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none"
        />
      ) : (
        <p className="text-sm leading-6 text-gray-600">
          {estimate?.notes || "No notes"}
        </p>
      )}
    </div>

    {/* CONVERT */}
    {!isEditMode &&
      estimate?.signature &&
      estimate?.status !== "converted" && (
        <button
  onClick={convertToInvoice}
  disabled={converting}
  className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-black disabled:opacity-50"
>
  {converting ? "Converting..." : "Convert to Invoice"}
</button>
      )}
  </div>

  {/* FLOATING ACTION BUTTON */}



{/* FLOATING ACTION BUTTON */}
<div className="
  fixed bottom-24 right-6 z-50
  sm:bottom-6 sm:right-6
  md:right-[max(24px,calc((100vw-768px)/2+24px))]
  flex flex-col items-end gap-3
">
  {/* ACTIONS STACK */}
  <div className="flex flex-col items-end gap-2">

    {/* EDIT */}
    <button
      onClick={() => {
        setIsEditMode(true);
        setFabOpen(false);
      }}
      className={`flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-green-900 text-sm shadow-md border border-gray-200 hover:bg-gray-50
        transition-all duration-200 origin-bottom-right
        ${fabOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95 pointer-events-none h-0 overflow-hidden"}
      `}
    >
       <SquarePen size={14} /> Edit
    </button>

    {/* SMS */}
    <button
  onClick={sendSMSLink}
  className="bg-gold text-navy p-2 rounded-lg"
  title="Send via SMS"
>
  📱 Send SMS
</button>

    {/* PDF */}
{/* PDF */}
<Link
  href={`/api/estimates/${id}/pdf`}
  target="_blank"
  rel="noopener noreferrer"
>
  <button className="flex items-center gap-2 rounded-xl text-green-900 bg-white px-3 py-2 text-sm shadow-md border border-gray-200 hover:bg-gray-50">
    <FileText size={14}/> PDF
  </button>
</Link>
    
  </div>

  {/* MAIN FAB */}
  <button
    onClick={() => setFabOpen(!fabOpen)}
    className="h-14 w-14 rounded-full bg-green-900 text-white shadow-lg hover:bg-black transition-all duration-200 flex items-center justify-center active:scale-95"
  >
    <span className={`text-xl transition-transform duration-300 ${fabOpen ? "rotate-45" : "rotate-0"}`}>
      +
    </span>
  </button>
</div>


</div>



  );
}