"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X, Plus, Trash2, Target } from "lucide-react";
import { useEstimateForm, type UseEstimateFormReturn } from "@/lib/hooks/useEstimateForm";
import type { FormProject, FormChangeOrder } from "@/lib/queries/estimates";
import type { NewChangeOrderInput } from "@/lib/queries/changeOrders";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import { supabase } from "@/lib/supabase/client";
import ClientSelector from "@/components/forms/ClientSelector";
import { EstimateCamera } from "@/components/ui/EstimateCamera";
import SignaturePad from "@/components/signature/SignaturePad";

/**
 * The unified Estimate Create/Edit form. All state, calculation, and
 * persistence logic lives in useEstimateForm — this file is purely the UI
 * layer rendering that hook's return value. Keeps the visual language of
 * the old app/estimates/create/page.tsx (green-accented, card-based,
 * mobile-first) while adding the sections that only apply once an
 * estimate exists (change orders, assignments, signature, payments,
 * lifecycle actions) gated on mode === "edit".
 */
export default function EstimateForm({
  mode,
  estimateId,
}: {
  mode: "create" | "edit";
  estimateId?: string;
}) {
  const router = useRouter();
  const form = useEstimateForm({ mode, estimateId });

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetTotalInput, setTargetTotalInput] = useState("");
  const [showCOSheet, setShowCOSheet] = useState(false);
  const [editingCO, setEditingCO] = useState<FormChangeOrder | null>(null);

  if (mode === "edit" && form.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-400">Loading estimate...</p>
      </div>
    );
  }

  if (mode === "edit" && form.notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-8">
        <div className="text-center space-y-3">
          <p className="text-slate-600 font-semibold">Estimate not found</p>
          <p className="text-slate-400 text-sm">It may have been deleted, or the link may be incorrect.</p>
          <Link href="/estimates" className="text-emerald-600 hover:text-emerald-700 text-sm font-medium underline">
            Back to Estimates
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    const result = await form.save();
    if (result && mode === "create") {
      router.push(`/estimates/${result.id}`);
    }
  };

  const handleDownloadPdf = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    window.open(`/api/estimates/${form.formId}/pdf?token=${session?.access_token ?? ""}`, "_blank");
  };

  const openNewChangeOrder = () => {
    setEditingCO(null);
    setShowCOSheet(true);
  };

  const openEditChangeOrder = (co: FormChangeOrder) => {
    setEditingCO(co);
    setShowCOSheet(true);
  };

  const saveDisabled = form.saving || (mode === "edit" && form.isLocked);
  const saveLabel = form.saving ? "Saving..." : mode === "create" ? "Save" : "Update";

  return (
    <div className="min-h-screen bg-gray-100 pb-44 lg:pb-10">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-gray-600 text-xl"
          >
            ←
          </button>
          <h1 className="text-base font-semibold text-gray-800">{mode === "create" ? "New Estimate" : "Edit Estimate"}</h1>
          <button
            onClick={handleSave}
            disabled={saveDisabled}
            className="hidden lg:inline-flex bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 min-h-[44px] items-center justify-center hover:bg-green-800 transition-colors"
          >
            {saveLabel}
          </button>
          <div className="lg:hidden w-8" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 lg:p-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-3 min-w-0">
          {/* Client */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <ClientSelector selectedId={form.clientId} onSelect={form.setClientId} companyId={form.companyId} />
            {form.clientId && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Property Address</div>
                {form.client?.address ? (
                  <p className="text-sm text-gray-700 break-words">{form.client.address}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No address on file.</p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">Manage in Client record</p>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
            <div className="flex items-center gap-1 mb-0.5">
              <label htmlFor="estimate-title" className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Estimate Title
              </label>
              <span className="text-red-500 text-xs">*</span>
            </div>
            <input
              id="estimate-title"
              type="text"
              value={form.title}
              onChange={(e) => form.setTitle(e.target.value)}
              className="w-full text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none min-h-[28px]"
              placeholder="Title... Roof Repair - 123 Main St"
              required
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              className="w-full min-h-[100px] text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none capitalize"
              rows={5}
              placeholder="Work Description..."
            />
          </div>

          {/* Photos — EstimateCamera alone covers this: its "Add Photo" modal
              offers both "Upload from Gallery" and "Take Photo" with stage
              tagging, and its own gallery only renders Before/During/After
              columns that actually have photos (no empty-state skeleton).
              EstimateImageUploader/EstimateImageView were redundant with
              it — both duplicated the same photos in an always-visible
              3-column grid with dashed "Add" tiles even at zero photos,
              which is the bulky placeholder this section used to show. */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Photos</div>
            {form.photosEnabled ? (
              <EstimateCamera estimateId={form.formId} onUploaded={form.bumpGallery} />
            ) : (
              <p className="text-xs text-gray-400">Select a client above to enable photo uploads.</p>
            )}
          </div>

          {/* Projects / Line Items */}
          {form.isLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              This estimate has been signed and its scope is locked. Use a Change Order to modify scope.
            </div>
          )}
          <div className="space-y-3">
            {form.projects.map((project, projectIdx) => (
              <ProjectCard key={project.id} project={project} projectIdx={projectIdx} form={form} locked={form.isLocked} />
            ))}
          </div>
          {!form.isLocked && (
            <button
              onClick={form.addProject}
              className="w-full py-3 rounded-xl border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-all duration-200 min-h-[44px]"
            >
              + Add Project
            </button>
          )}

          {/* Pricing summary — inline card on mobile/tablet, replaced by the sticky right panel at lg: */}
          <div className="lg:hidden">
            <PricingSummary
              form={form}
              onOpenTargetModal={() => {
                setTargetTotalInput("");
                setShowTargetModal(true);
              }}
              showSaveButton={false}
            />
          </div>

          {/* Change Orders */}
          {mode === "edit" && <ChangeOrdersSection form={form} onNew={openNewChangeOrder} onEdit={openEditChangeOrder} />}

          {/* Assigned Agent / Subcontractors */}
          {mode === "edit" && <AssignmentsSection form={form} />}

          {/* Signature */}
          {mode === "edit" && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Signature</div>
              <SignaturePad
                onSave={form.saveSignature}
                onRemove={form.removeSignature}
                existingSignature={form.signature}
                isCompleted={!!form.signature}
                estimateId={form.formId}
                onRefresh={() => {}}
              />
            </div>
          )}

          {/* Payment History */}
          {mode === "edit" && form.payments.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Payment History</span>
                <span className="text-[10px] text-gray-400">
                  {form.payments.length} payment{form.payments.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="divide-y divide-gray-100 px-3">
                {form.payments.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{formatCurrency(p.amount)}</div>
                      <div className="text-[11px] text-gray-400 capitalize truncate">
                        {p.method} · {formatShortDate(p.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 transition-all duration-200 focus-within:border-green-500 focus-within:shadow-md">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => form.setNotes(e.target.value)}
              className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none resize-none"
              rows={2}
              placeholder="Notes for client (optional)..."
            />
          </div>

          {/* Lifecycle action buttons */}
          {mode === "edit" && (
            <div className="space-y-2 pt-1">
              {form.existingInvoiceId ? (
                <Link
                  href={`/invoices/${form.existingInvoiceId}`}
                  className="block text-center w-full py-3 rounded-xl bg-gray-100 border border-gray-200 text-gray-700 font-medium text-sm min-h-[44px] flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  View Invoice
                </Link>
              ) : (
                form.signature && (
                  <button
                    onClick={form.convertToInvoice}
                    disabled={form.converting}
                    className="w-full py-3 rounded-xl bg-green-700 text-white font-semibold text-sm disabled:opacity-50 min-h-[44px] hover:bg-green-800 transition-colors"
                  >
                    {form.converting ? "Converting..." : "Convert to Invoice"}
                  </button>
                )
              )}
              {form.status !== "completed" && (
                <button
                  onClick={form.markAsCompleted}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium text-sm min-h-[44px] hover:bg-blue-700 transition-colors"
                >
                  Mark Completed
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={form.sendSMSLink}
                  className="py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm min-h-[44px] hover:bg-gray-50 transition-colors"
                >
                  Send via SMS
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm min-h-[44px] hover:bg-gray-50 transition-colors"
                >
                  Download PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop sticky pricing panel */}
        <div className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
          <PricingSummary
            form={form}
            onOpenTargetModal={() => {
              setTargetTotalInput("");
              setShowTargetModal(true);
            }}
            showSaveButton
            onSave={handleSave}
            saveDisabled={saveDisabled}
            saveLabel={saveLabel}
          />
        </div>
      </div>

      {/* Mobile sticky bottom save bar — the app renders a persistent global
          bottom tab bar (components/ui/BottomNav.tsx, h-16 + safe-area,
          fixed bottom-0 z-40) on every page, so this bar docks just above
          it instead of at bottom-0 — otherwise the two overlap and the nav
          bar (painted later in the DOM) covers this one entirely. */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 bg-white border-t border-gray-200 p-3 z-40 lg:hidden">
        {mode === "edit" && form.isLocked && (
          <p className="text-[11px] text-amber-600 text-center mb-1.5">This estimate has been signed and can no longer be edited.</p>
        )}
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="w-full min-h-[44px] bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-800 transition-colors"
        >
          {saveLabel}
        </button>
      </div>

      {/* Set Target Total modal */}
      {showTargetModal && (
        <TargetTotalModal
          currentTotal={form.subtotal}
          itemCount={form.projects.flatMap((p) => p.items).length}
          value={targetTotalInput}
          onChange={setTargetTotalInput}
          onCancel={() => setShowTargetModal(false)}
          onApply={() => {
            const val = Number(targetTotalInput);
            form.distributeToTargetTotal(val);
            setShowTargetModal(false);
          }}
        />
      )}

      {/* Change Order sheet */}
      {showCOSheet && (
        <ChangeOrderSheet
          existing={editingCO}
          onClose={() => {
            setShowCOSheet(false);
            setEditingCO(null);
          }}
          onSave={async (input) => {
            const ok = await form.saveChangeOrder(input, editingCO?.id, editingCO?.status === "rejected" ? "rejected" : "draft");
            if (ok) {
              setShowCOSheet(false);
              setEditingCO(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project / line item card
// ---------------------------------------------------------------------------

function ProjectCard({
  project,
  projectIdx,
  form,
  locked,
}: {
  project: FormProject;
  projectIdx: number;
  form: UseEstimateFormReturn;
  locked: boolean;
}) {
  const projectTotal = project.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
      {/* Header - green accent */}
      <div className="bg-green-700 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-semibold text-green-100 bg-green-800/50 px-2 py-0.5 rounded shrink-0">
              Project {projectIdx + 1}
            </span>
            <input
              type="text"
              value={project.name}
              onChange={(e) => form.updateProject(project.id, "name", e.target.value)}
              placeholder="Project name"
              disabled={locked}
              className="flex-1 min-w-0 bg-white/20 text-white placeholder:text-green-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-70 min-h-[36px]"
            />
          </div>
          {form.projects.length > 1 && !locked && (
            <button
              onClick={() => form.removeProject(project.id)}
              className="text-green-200 hover:text-white text-lg px-2 min-h-[44px] min-w-[32px] shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Project description */}
      <div className="px-3 pt-2">
        <textarea
          value={project.description}
          onChange={(e) => form.updateProject(project.id, "description", e.target.value)}
          rows={1}
          placeholder="Project description (optional)"
          disabled={locked}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 resize-none transition-all capitalize disabled:bg-gray-50 disabled:opacity-70"
        />
      </div>

      {/* Items */}
      <div className="px-3 py-2 space-y-2">
        {project.items.map((item, itemIdx) => (
          <div key={item.id} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
            <div className="flex gap-2 mb-2">
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <span className="text-[10px] text-gray-400 w-5 shrink-0">{itemIdx + 1}.</span>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => form.updateItem(project.id, item.id, "name", e.target.value)}
                  placeholder="Item name"
                  disabled={locked}
                  className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 placeholder:text-gray-400 transition-all capitalize disabled:bg-gray-100 disabled:opacity-70 min-h-[36px]"
                />
              </div>
              {!locked && (
                <button
                  onClick={() => form.removeItem(project.id, item.id)}
                  className="text-red-400 text-xs px-1 min-h-[36px] min-w-[28px] shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            {item.description && (
              <textarea
                value={item.description}
                onChange={(e) => form.updateItem(project.id, item.id, "description", e.target.value)}
                rows={1}
                placeholder="Description"
                disabled={locked}
                className="w-full text-xs text-gray-500 bg-transparent focus:outline-none mb-2 resize-none"
              />
            )}

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
                <span className="text-[10px] text-gray-400">Qty</span>
                <input
                  type="number"
                  value={item.quantity === 0 ? "" : item.quantity}
                  onChange={(e) =>
                    form.updateItem(project.id, item.id, "quantity", e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  disabled={locked}
                  className="w-full sm:w-12 text-sm text-gray-700 text-center focus:outline-none bg-transparent min-h-[32px]"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 transition-all duration-200 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20">
                <span className="text-[10px] text-gray-400">$</span>
                <input
                  type="number"
                  value={item.unit_price === 0 ? "" : item.unit_price}
                  onChange={(e) =>
                    form.updateItem(project.id, item.id, "unit_price", e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  disabled={locked}
                  className="w-full sm:w-20 text-sm text-gray-700 text-right focus:outline-none bg-transparent min-h-[32px]"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <div className="col-span-2 sm:flex-1 text-right text-sm font-medium text-gray-700">
                {formatCurrency(item.quantity * item.unit_price)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!locked && (
        <div className="flex justify-center my-1">
          <button
            onClick={() => form.addItem(project.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-green-300 text-green-600 text-xs font-medium hover:bg-green-50 transition-all duration-200 min-h-[36px]"
          >
            <span className="text-base leading-none">+</span> Add Item
          </button>
        </div>
      )}

      {/* Project total */}
      <div className="bg-green-50 px-3 py-2 border-t border-green-100 flex justify-between items-center">
        <span className="text-xs text-green-700 font-medium">Project Total</span>
        <span className="text-sm font-bold text-green-800">{formatCurrency(projectTotal)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing / summary — same content rendered inline (mobile/tablet) and in
// the sticky right-hand panel (desktop); the parent decides which one is
// visible via lg:hidden / hidden lg:block wrappers.
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-600" : "text-gray-700";
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-gray-500 truncate">{label}</span>
      <span className={`font-medium shrink-0 ${toneClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5 truncate">{label}</span>
      <input
        type="number"
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        disabled={disabled}
        step={step}
        placeholder="0"
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 disabled:opacity-60 min-h-[40px]"
      />
    </label>
  );
}

function PricingSummary({
  form,
  onOpenTargetModal,
  showSaveButton,
  onSave,
  saveDisabled,
  saveLabel,
}: {
  form: UseEstimateFormReturn;
  onOpenTargetModal: () => void;
  showSaveButton: boolean;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pricing</span>
        {!form.isLocked && (
          <button
            onClick={onOpenTargetModal}
            className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded hover:bg-green-200 transition min-h-[32px] shrink-0"
          >
            Set Target Total
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Tax Rate (%)" value={form.taxRate} onChange={form.setTaxRate} disabled={form.isLocked} step="0.01" />
        <NumberField label="Markup ($)" value={form.markup} onChange={form.setMarkup} disabled={form.isLocked} step="0.01" />
        <NumberField label="Discount ($)" value={form.discount} onChange={form.setDiscount} disabled={form.isLocked} step="0.01" />
        <NumberField
          label="Deposit ($)"
          value={form.depositAmount}
          onChange={form.setDepositAmount}
          disabled={form.isLocked}
          step="0.01"
        />
      </div>

      <div className="space-y-1.5 pt-2 border-t border-gray-100">
        <SummaryRow label="Subtotal" value={form.subtotal} />
        <SummaryRow label="Tax" value={form.tax} />
        {form.mode === "edit" && form.changeOrders.length > 0 && (
          <SummaryRow label="Approved Change Orders" value={form.approvedChangeOrderTotal} tone="positive" />
        )}
        <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-100">
          <span className="text-gray-800">Total</span>
          <span className="text-green-700">{formatCurrency(form.revisedTotal)}</span>
        </div>
        {form.mode === "edit" && (
          <>
            <SummaryRow label="Amount Paid" value={form.totalPaid} tone="positive" />
            <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-gray-100">
              <span className="text-gray-800">Remaining Balance</span>
              <span className="text-gray-900">{formatCurrency(form.remainingBalance)}</span>
            </div>
          </>
        )}
      </div>

      {showSaveButton && (
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          {form.mode === "edit" && form.isLocked && (
            <p className="text-[11px] text-amber-600">This estimate has been signed and can no longer be edited.</p>
          )}
          <button
            onClick={onSave}
            disabled={saveDisabled}
            className="w-full min-h-[44px] bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-800 transition-colors"
          >
            {saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target total modal — bottom sheet on mobile, centered modal at sm:,
// per the AddExpenseSheet convention.
// ---------------------------------------------------------------------------

function TargetTotalModal({
  currentTotal,
  itemCount,
  value,
  onChange,
  onCancel,
  onApply,
}: {
  currentTotal: number;
  itemCount: number;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
        <div className="sticky top-0 bg-white flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-green-700" />
            <h3 className="text-sm font-semibold text-gray-800">Set Target Total</h3>
          </div>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 min-h-[36px] min-w-[36px]">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Current subtotal: <span className="font-semibold text-gray-700">{formatCurrency(currentTotal)}</span>
          </p>
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg p-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Enter desired total"
            step="0.01"
            autoFocus
          />
          <p className="text-[11px] text-gray-400">
            Difference will be split evenly across {itemCount} item{itemCount === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="sticky bottom-0 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-100 flex gap-2">
          <button onClick={onCancel} className="flex-1 min-h-[44px] py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
            Cancel
          </button>
          <button onClick={onApply} className="flex-1 min-h-[44px] py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change Orders section
// ---------------------------------------------------------------------------

const CO_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  invoiced: "bg-blue-100 text-blue-800",
};

function ChangeOrdersSection({
  form,
  onNew,
  onEdit,
}: {
  form: UseEstimateFormReturn;
  onNew: () => void;
  onEdit: (co: FormChangeOrder) => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Change Orders</span>
        <button
          onClick={onNew}
          className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded hover:bg-green-200 transition min-h-[32px] shrink-0"
        >
          + New Change Order
        </button>
      </div>
      {form.changeOrders.length === 0 ? (
        <p className="text-xs text-gray-400">No change orders yet.</p>
      ) : (
        <div className="space-y-2">
          {form.changeOrders.map((co) => (
            <div key={co.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-gray-400 bg-white border border-gray-200 px-1 py-0.5 rounded shrink-0">
                    {co.change_order_number}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 truncate">{co.title}</span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                    CO_STATUS_STYLES[co.status] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {co.status}
                </span>
              </div>
              {co.description && <p className="text-xs text-gray-500 line-clamp-2">{co.description}</p>}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-sm font-bold ${co.total_amount >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {co.total_amount >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(co.total_amount))}
                </span>
                <div className="flex gap-3 text-xs font-semibold">
                  {co.status === "draft" && (
                    <>
                      <button onClick={() => onEdit(co)} className="text-blue-600 min-h-[32px]">
                        Edit
                      </button>
                      <button onClick={() => form.submitChangeOrderForApproval(co.id)} className="text-green-600 min-h-[32px]">
                        Submit
                      </button>
                      <button onClick={() => form.deleteChangeOrder(co.id, co.status)} className="text-red-500 min-h-[32px]">
                        Delete
                      </button>
                    </>
                  )}
                  {co.status === "pending" && (
                    <>
                      <button onClick={() => form.approveChangeOrder(co.id)} className="text-green-600 min-h-[32px]">
                        Approve
                      </button>
                      <button onClick={() => form.rejectChangeOrder(co.id)} className="text-red-500 min-h-[32px]">
                        Reject
                      </button>
                    </>
                  )}
                  {co.status === "rejected" && (
                    <button onClick={() => onEdit(co)} className="text-blue-600 min-h-[32px]">
                      Edit &amp; Resubmit
                    </button>
                  )}
                  {co.status === "approved" && <span className="text-green-600">✓ Applied</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change Order sheet — bottom sheet with the itemized addition/deduction
// editor ported from the old app/estimates/[id]/page.tsx ChangeOrderModal,
// wired to the hook's saveChangeOrder instead of direct Supabase calls.
// ---------------------------------------------------------------------------

type ChangeOrderLineItemDraft = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  type: "addition" | "deduction";
};

function ChangeOrderSheet({
  existing,
  onClose,
  onSave,
}: {
  existing: FormChangeOrder | null;
  onClose: () => void;
  onSave: (input: NewChangeOrderInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [lineItems, setLineItems] = useState<ChangeOrderLineItemDraft[]>(
    existing?.lineItems && existing.lineItems.length > 0
      ? existing.lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          type: li.type,
        }))
      : [{ id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, type: "addition" }]
  );
  const [saving, setSaving] = useState(false);

  const addLineItem = () =>
    setLineItems((prev) => [...prev, { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, type: "addition" }]);

  const updateLineItem = (id: string, field: keyof ChangeOrderLineItemDraft, value: any) => {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  };

  const removeLineItem = (id: string) => setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((li) => li.id !== id)));

  const totalChange = lineItems.reduce(
    (sum, li) => sum + (li.type === "addition" ? li.quantity * li.unit_price : -li.quantity * li.unit_price),
    0
  );

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (lineItems.every((li) => li.quantity * li.unit_price === 0)) {
      toast.error("Add at least one line item with a value");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        amount: totalChange,
        tax: 0,
        notes: null,
        lineItems: lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          type: li.type,
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 z-10">
          <div className="text-sm font-black text-slate-800">{existing ? "Edit Change Order" : "New Change Order"}</div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 min-h-[36px] min-w-[36px]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300"
              placeholder="e.g., Additional framing work"
            />
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 rounded-xl border border-slate-200/70 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 resize-none"
              placeholder="Optional details..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Line Items</label>
              <button onClick={addLineItem} className="text-xs text-green-600 font-bold flex items-center gap-1 min-h-[32px]">
                <Plus size={13} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <select
                      value={item.type}
                      onChange={(e) => updateLineItem(item.id, "type", e.target.value as "addition" | "deduction")}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white min-h-[32px]"
                    >
                      <option value="addition">+ Addition</option>
                      <option value="deduction">− Deduction</option>
                    </select>
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLineItem(item.id)} className="text-red-500 p-1.5 min-h-[32px] min-w-[32px]">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-h-[40px]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-slate-400 uppercase font-bold">Qty</label>
                      <input
                        type="number"
                        value={item.quantity === 0 ? "" : item.quantity}
                        onChange={(e) => updateLineItem(item.id, "quantity", e.target.value === "" ? 0 : Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white min-h-[36px]"
                        step="1"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400 uppercase font-bold">Unit Price</label>
                      <input
                        type="number"
                        value={item.unit_price === 0 ? "" : item.unit_price}
                        onChange={(e) => updateLineItem(item.id, "unit_price", e.target.value === "" ? 0 : Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white min-h-[36px]"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div className="text-right">
                      <label className="text-[9px] text-slate-400 uppercase font-bold block">Total</label>
                      <div className="text-sm font-bold text-slate-800 mt-1.5">{formatCurrency(item.quantity * item.unit_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-600">Total Change</span>
            <span className={`text-base font-bold ${totalChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalChange >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(totalChange))}
            </span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 min-h-[44px] py-2 border border-slate-200 rounded-xl text-sm text-slate-600">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 min-h-[44px] py-2 bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : existing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assigned Agent / Subcontractors — read-only summary. Assign/edit/remove
// UI intentionally stays on the Expense page per the refactor's scope.
// ---------------------------------------------------------------------------

function AssignmentsSection({ form }: { form: UseEstimateFormReturn }) {
  const hasAny = form.assignedSubcontractors.length > 0 || form.assignedAgents.length > 0;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Assigned Agent / Subcontractors</span>
        <Link href={`/expense?project=${form.formId}`} className="text-xs text-blue-600 font-medium hover:underline shrink-0">
          Manage on Expense page
        </Link>
      </div>
      {!hasAny ? (
        <p className="text-xs text-gray-400">No agents or subcontractors assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {form.assignedAgents.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700 truncate">
                {a.name} <span className="text-gray-400 text-xs">(Agent)</span>
              </span>
              <span className="font-medium text-gray-800 shrink-0">{formatCurrency(a.amount)}</span>
            </div>
          ))}
          {form.assignedSubcontractors.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700 truncate">
                {s.name}
                {s.trade ? ` — ${s.trade}` : ""}
              </span>
              <span className="font-medium text-gray-800 shrink-0">{formatCurrency(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
