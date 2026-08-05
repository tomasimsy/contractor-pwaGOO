"use client";

/**
 * Estimate Roof V2 — per-area editor.
 *
 * Extends the proven V1 RoofingAreasEditor pattern (per-area Set-based
 * saving/deleting/saved state — verified independent under the "save
 * Area 2 only" acceptance test) with: measurements, inspection notes,
 * general notes, and an embedded RoofingAreaLineItemEditor per area.
 *
 * Kept as a separate component from RoofingAreasEditor (V1) rather than
 * modifying it in place — the live Estimate page's Roofing tab renders
 * V1 today and must keep working unmodified while V2 is verified.
 *
 * Independence guarantees (per the "must never affect other areas" spec):
 * - Core fields (name/scope/total/measurements/notes) saved via onSave,
 *   scoped by area.id — same as V1.
 * - Line items saved via RoofingAreaLineItemEditor, one mounted instance
 *   per area (keyed by area.id), each with its own local state and its
 *   own estimateAreaLineItemService.replaceForArea(areaId, ...) call —
 *   architecturally cannot touch another area's line item rows.
 * - Photos saved/loaded per area.id, same as V1.
 * - savingAreaIds/deletingAreaIds/savedAreaIds are Set<UUID> keyed by
 *   area id — saving Area 2 only ever adds/removes area 2's id from
 *   these sets, never affecting Area 1/3's rendered button state.
 */
import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Plus, Trash2, Upload, Camera } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import { RoofingAreaLineItemEditor, type RoofingAreaLineItemEditorHandle } from "./RoofingAreaLineItemEditor";
import { calculateAreaRepairCost } from "@/lib/services/financialCalculations";
import { ROOFING_AREA_QUANTITY_UNITS, type RoofingAreaQuantityUnit } from "@/lib/services/roofingAreaService";
import type { RoofingArea, RoofingPhoto } from "@/lib/services";
import type { UUID } from "@/lib/services/types";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface RoofingAreaSaveInput {
  id?: UUID;
  estimateId: UUID;
  companyId: UUID;
  areaName: string;
  sequenceNumber: number;
  scopeItems: string | null;
  areaTotal: number;
  measurements: string | null;
  inspectionNotes: string | null;
  notes: string | null;
  quantity: number;
  quantityUnit: RoofingAreaQuantityUnit | null;
  defect: string | null;
  location: string | null;
  correctiveAction: string | null;
  materialsIncluded: string | null;
  materialCost: number;
  laborCost: number;
  tax: number;
}

export interface RoofingAreasEditorV2Props {
  estimateId: UUID;
  areas: RoofingArea[];
  onChange: (areas: RoofingArea[]) => void;
  /**
   * Saves the area's own fields and returns the saved RoofingArea (with
   * its real, server-assigned companyId) — the return value matters
   * here: on an area's very first save, this component immediately
   * needs the fresh companyId to save that area's line items in the
   * SAME action, and the `areas` prop won't reflect it until the next
   * render commits.
   */
  onSave: (area: RoofingAreaSaveInput) => Promise<RoofingArea>;
  onDelete: (areaId: UUID) => Promise<void>;
  /** Called once per "Save Area" click, after both the area's own
   * fields AND its line items have saved, so the parent can recalculate
   * the estimate's subtotal/total (derived from every area's line items
   * combined — see EstimateService.recalculateTotal). */
  onAreaLineItemsSaved?: () => void;
}

/** Lets the PARENT FORM save every area in one action.
 *
 * Needed because saving an area is not something the parent can do on
 * its own: each area's LINE ITEMS save through refs held inside this
 * component (lineItemEditorRefs), and those need the freshly-saved
 * area's server-assigned companyId/id. Without this handle, a
 * form-level "Save changes" would persist the estimate and silently
 * drop every roof-area edit. Same pattern as ProjectExpensesPanelRef. */
export interface RoofingAreasEditorV2Ref {
  saveAll: () => Promise<void>;
}

function RoofingAreasEditorV2Inner(
  { estimateId, areas, onChange, onSave, onDelete, onAreaLineItemsSaved }: RoofingAreasEditorV2Props,
  ref: React.ForwardedRef<RoofingAreasEditorV2Ref>
) {
  const { roofingAreaService } = useServices();
  const [savingAreaIds, setSavingAreaIds] = useState<Set<UUID>>(new Set());
  const [deletingAreaIds, setDeletingAreaIds] = useState<Set<UUID>>(new Set());
  const [savedAreaIds, setSavedAreaIds] = useState<Set<UUID>>(new Set());
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [areaPhotos, setAreaPhotos] = useState<{ [areaId: string]: { before: RoofingPhoto[]; after: RoofingPhoto[] } }>({});
  const lineItemEditorRefs = useRef<{ [areaId: string]: RoofingAreaLineItemEditorHandle | null }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
const [photoOpen, setPhotoOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const loadPhotos = async () => {
      const photos: { [areaId: string]: { before: RoofingPhoto[]; after: RoofingPhoto[] } } = {};
      for (const area of areas) {
        try {
          photos[area.id] = await roofingAreaService.getPhotosForArea(area.id);
        } catch (err) {
          console.error(`Failed to load photos for area ${area.id}:`, err);
          photos[area.id] = { before: [], after: [] };
        }
      }
      setAreaPhotos(photos);
    };
    if (areas.length > 0) loadPhotos();
  }, [areas, roofingAreaService]);

  const handlePhotoUpload = useCallback(
    async (areaId: UUID, photoType: "before" | "after", file: File) => {
      const area = areas.find((a) => a.id === areaId);
      if (!area?.companyId) {
        alert("Please save the roof area first before uploading photos.");
        return;
      }

      const uploadKey = `${areaId}-${photoType}`;
      setUploading((prev) => ({ ...prev, [uploadKey]: true }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("estimateId", estimateId);
        formData.append("areaId", areaId);
        formData.append("photoType", photoType);

        const res = await fetch("/api/estimate-photos/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to upload photo");
        }

        const updatedPhotos = await roofingAreaService.getPhotosForArea(areaId);
        setAreaPhotos((prev) => ({ ...prev, [areaId]: updatedPhotos }));
      } catch (error) {
        console.error("Photo upload error:", error);
        alert(`Failed to upload photo: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setUploading((prev) => ({ ...prev, [uploadKey]: false }));
      }
    },
    [areas, estimateId, roofingAreaService]
  );

  const handleDeletePhoto = useCallback(
    async (areaId: UUID, photoId: UUID) => {
      if (!confirm("Delete this photo?")) return;
      try {
        await roofingAreaService.deletePhoto(photoId, "Deleted by user");
        setAreaPhotos((prev) => ({
          ...prev,
          [areaId]: {
            before: prev[areaId].before.filter((p) => p.id !== photoId),
            after: prev[areaId].after.filter((p) => p.id !== photoId),
          },
        }));
      } catch (error) {
        console.error("Failed to delete photo:", error);
        alert("Failed to delete photo. Please try again.");
      }
    },
    [roofingAreaService]
  );

  const handleAddArea = useCallback(() => {
    const newArea: Partial<RoofingArea> = {
      id: crypto.randomUUID() as UUID,
      estimateId,
      areaName: `Area ${areas.length + 1}`,
      sequenceNumber: areas.length,
      scopeItems: "",
      areaTotal: 0,
      measurements: "",
      inspectionNotes: "",
      notes: "",
      quantity: 1,
      quantityUnit: null,
      defect: "",
      location: "",
      correctiveAction: "",
      materialsIncluded: "",
      materialCost: 0,
      laborCost: 0,
      tax: 0,
      estimatedRepairCost: 0,
      companyId: "" as UUID,
    };
    onChange([...areas, newArea as RoofingArea]);
  }, [areas, estimateId, onChange]);

  const handleUpdateArea = useCallback(
    (id: UUID, updates: Partial<RoofingArea>) => {
      onChange(areas.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    },
    [areas, onChange]
  );

  /** The save for ONE area, without UI chrome — throws instead of
   * alerting so a caller can decide how to surface it. */
  const saveOneArea = useCallback(
    async (area: RoofingArea) => {
      if (!area.areaName.trim()) {
        throw new Error(`Area ${(area.sequenceNumber ?? 0) + 1}: a name is required before saving.`);
      }
      const saved = await onSave({
        id: area.id,
        estimateId: area.estimateId,
        companyId: area.companyId,
        areaName: area.areaName,
        sequenceNumber: area.sequenceNumber,
        scopeItems: area.scopeItems,
        areaTotal: area.areaTotal,
        measurements: area.measurements ?? null,
        inspectionNotes: area.inspectionNotes ?? null,
        notes: area.notes ?? null,
        quantity: area.quantity ?? 1,
        quantityUnit: area.quantityUnit ?? null,
        defect: area.defect ?? null,
        location: area.location ?? null,
        correctiveAction: area.correctiveAction ?? null,
        materialsIncluded: area.materialsIncluded ?? null,
        materialCost: area.materialCost ?? 0,
        laborCost: area.laborCost ?? 0,
        tax: area.tax ?? 0,
      });
      // The step the parent cannot reach on its own.
      await lineItemEditorRefs.current[area.id]?.save(saved.companyId, saved.id);
      return saved;
    },
    [onSave]
  );

  useImperativeHandle(
    ref,
    () => ({
      async saveAll() {
        // SEQUENTIAL, not parallel: every area save recalculates the
        // same estimate's totals, and concurrent recalculation races.
        // Throws on the first failure so the form surfaces the error
        // and does NOT navigate away — a partial save that looked
        // successful would be the worst outcome.
        for (const area of areas) {
          await saveOneArea(area);
        }
        if (areas.length > 0) onAreaLineItemsSaved?.();
      },
    }),
    [areas, saveOneArea, onAreaLineItemsSaved]
  );

  const handleSaveArea = useCallback(
    async (area: RoofingArea) => {
      if (!area.areaName.trim()) {
        alert("Area name is required.");
        return;
      }
      setSavingAreaIds((prev) => new Set([...prev, area.id]));
      try {
        const saved = await onSave({
          id: area.id,
          estimateId: area.estimateId,
          companyId: area.companyId,
          areaName: area.areaName,
          sequenceNumber: area.sequenceNumber,
          scopeItems: area.scopeItems,
          areaTotal: area.areaTotal,
          measurements: area.measurements ?? null,
          inspectionNotes: area.inspectionNotes ?? null,
          notes: area.notes ?? null,
          quantity: area.quantity ?? 1,
          quantityUnit: area.quantityUnit ?? null,
          defect: area.defect ?? null,
          location: area.location ?? null,
          correctiveAction: area.correctiveAction ?? null,
          materialsIncluded: area.materialsIncluded ?? null,
          materialCost: area.materialCost ?? 0,
          laborCost: area.laborCost ?? 0,
          tax: area.tax ?? 0,
        });
        // One button, two writes: the area's own fields (just saved
        // above) and this area's line items (below), using `saved`'s
        // real companyId AND real id directly rather than waiting for
        // either to arrive via props on the next render — passing the
        // stale draft id here (a brand-new area's client-generated
        // crypto.randomUUID(), never written to `estimate_areas`) was
        // the exact cause of "violates foreign key constraint
        // estimate_area_line_items_estimate_area_id_fkey" on a new
        // area's first save.
        await lineItemEditorRefs.current[area.id]?.save(saved.companyId, saved.id);
        onAreaLineItemsSaved?.();
        setSavedAreaIds((prev) => new Set([...prev, area.id]));
        setTimeout(() => {
          setSavedAreaIds((prev) => {
            const next = new Set(prev);
            next.delete(area.id);
            return next;
          });
        }, 2000);
      } catch (error) {
        // console.warn, not console.error — see RoofingAreaLineItemEditor's
        // matching comment: this is typically an expected validation
        // failure (already shown via the alert below and the line item
        // editor's inline banner), not a bug, and console.error triggers
        // Next's full-page dev overlay even when the error is caught.
        console.warn("Failed to save area:", area.id, error instanceof Error ? error.message : JSON.stringify(error));
        // Surface the real reason (e.g. a line-item validation message
        // from the ref'd RoofingAreaLineItemEditor.save() call above) —
        // the line item editor already shows this inline too, but the
        // area-level alert should say the same thing, not a generic
        // "try again" that hides what actually needs fixing.
        alert(error instanceof Error ? error.message : "Failed to save roof area. Please try again.");
      } finally {
        setSavingAreaIds((prev) => {
          const next = new Set(prev);
          next.delete(area.id);
          return next;
        });
      }
    },
    [onSave, onAreaLineItemsSaved]
  );

  const handleDeleteArea = useCallback(
    async (areaId: UUID) => {
      if (!confirm("Delete this roof area?")) return;
      setDeletingAreaIds((prev) => new Set([...prev, areaId]));
      try {
        await onDelete(areaId);
        onChange(areas.filter((a) => a.id !== areaId));
      } catch (error) {
        console.error("Failed to delete area:", areaId, error);
        alert("Failed to delete roof area. Please try again.");
      } finally {
        setDeletingAreaIds((prev) => {
          const next = new Set(prev);
          next.delete(areaId);
          return next;
        });
      }
    },
    [areas, onChange, onDelete]
  );

  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">No roof areas yet</p>
        <button
          type="button"
          onClick={handleAddArea}
          disabled={savingAreaIds.size > 0 || deletingAreaIds.size > 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="size-4" /> Add First Area
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {areas.map((area, idx) => (
        /* Each area is a TINTED card with a solid header bar. Every
           area card used to be `bg-white` on a white page, so two
           adjacent areas were indistinguishable — reported live: "I
           still can't distinguish between 2 areas, both are white."
           The card now sits on `bg-muted` with its FIELDS on `bg-card`,
           inverting the usual nesting so the boundary is obvious, and
           the numbered header makes "which area am I in" readable at a
           glance while scrolling. Tokens only — no `dark:` variants,
           which key off the OS rather than this app's data-theme. */
        <div key={area.id} className="overflow-hidden rounded-xl border border-primary  shadow-sm">
          <div className="flex items-start justify-between gap-3 bg-primary px-3 py-3 sm:px-4">
            <h3 className="flex items-center gap-2 font-semibold text-primary-foreground">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-bold">
                {idx + 1}
              </span>
              <span className="min-w-0 break-words">{area.areaName || `Area ${idx + 1}`}</span>
            </h3>
            <button
              type="button"
              onClick={() => handleDeleteArea(area.id)}
              disabled={deletingAreaIds.has(area.id) || savingAreaIds.has(area.id)}
              className="shrink-0 rounded-md p-1 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

  <div className="space-y-2 p-2">
  {/* Row: Title + Measurements */}
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <div>
      <label className="block text-[10px] font-medium text-foreground mb-0.5">Title</label>
      <input
        type="text"
        value={area.areaName}
        onChange={(e) => handleUpdateArea(area.id, { areaName: e.target.value })}
        className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
        placeholder="e.g., Front Slope"
      />
    </div>
    <div>
      <label className="block text-[10px] font-medium text-foreground mb-0.5">Measurements</label>
      <input
        type="text"
        value={area.measurements ?? ""}
        onChange={(e) => handleUpdateArea(area.id, { measurements: e.target.value })}
        className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
        placeholder="e.g., 24 SQ, 12/12"
      />
    </div>
  </div>

  {/* Row: Inspection + Scope – 3 rows */}
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {/* <div>
      <label className="block text-[10px] font-medium text-foreground mb-0.5">Inspection / Condition</label>
      <textarea
        value={area.inspectionNotes ?? ""}
        onChange={(e) => handleUpdateArea(area.id, { inspectionNotes: e.target.value })}
        className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
        placeholder="Observed condition, damage, existing layers, etc."
        rows={3}
      />
    </div> */}
    <div>
      <label className="block text-[10px] font-medium text-foreground mb-0.5">Scope / Work Description</label>
      <textarea
        value={area.scopeItems || ""}
        onChange={(e) => handleUpdateArea(area.id, { scopeItems: e.target.value })}
        className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
        placeholder="Tear off, new shingles, gutters, etc."
        rows={3}
      />
    </div>
  </div>

  {/* Notes – full width, 3 rows, now DISABLED */}
  <div>
    <label className="block text-[10px] font-medium text-foreground mb-0.5">Notes</label>
    <textarea
      value={area.notes ?? ""}
      onChange={(e) => handleUpdateArea(area.id, { notes: e.target.value })}
      className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      placeholder="Any other notes for this area"
      rows={3}
      disabled // <-- disabled as requested
    />
  </div>

  {/* ---- Repair Item (collapsible) ---- */}
  <details className="rounded-lg border border-border bg-card/50 p-2">
    <summary className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none">
      Repair Item
    </summary>
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Defect</label>
          <textarea
            value={area.defect ?? ""}
            onChange={(e) => handleUpdateArea(area.id, { defect: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
            placeholder="Describe the defect"
            rows={3} // now 3 rows
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Location</label>
          <input
            type="text"
            value={area.location ?? ""}
            onChange={(e) => handleUpdateArea(area.id, { location: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
            placeholder="e.g., NE corner"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Corrective Action</label>
          <textarea
            value={area.correctiveAction ?? ""}
            onChange={(e) => handleUpdateArea(area.id, { correctiveAction: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
            placeholder="Planned repair"
            rows={3} // now 3 rows
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Materials Included</label>
          <textarea
            value={area.materialsIncluded ?? ""}
            onChange={(e) => handleUpdateArea(area.id, { materialsIncluded: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
            placeholder="Materials included"
            rows={3} // now 3 rows
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Qty</label>
          <input
            type="number"
            min="0"
            step="any"
            value={area.quantity ?? 1}
            onChange={(e) => handleUpdateArea(area.id, { quantity: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Unit</label>
          <select
            value={area.quantityUnit ?? ""}
            onChange={(e) => handleUpdateArea(area.id, { quantityUnit: (e.target.value || null) as RoofingAreaQuantityUnit | null })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
          >
            <option value="">—</option>
            {ROOFING_AREA_QUANTITY_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Material $</label>
          <input
            type="number"
            min="0"
            step="any"
            value={area.materialCost ?? 0}
            onChange={(e) => handleUpdateArea(area.id, { materialCost: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Labor $</label>
          <input
            type="number"
            min="0"
            step="any"
            value={area.laborCost ?? 0}
            onChange={(e) => handleUpdateArea(area.id, { laborCost: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground mb-0.5">Tax $</label>
          <input
            type="number"
            min="0"
            step="any"
            value={area.tax ?? 0}
            onChange={(e) => handleUpdateArea(area.id, { tax: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
        <span className="text-muted-foreground">Estimated Repair Cost</span>
        <span className="font-semibold text-foreground">
          {formatMoney(calculateAreaRepairCost(area.materialCost ?? 0, area.laborCost ?? 0, area.tax ?? 0))}
        </span>
      </div>
    </div>
  </details>

  {/* ---- Line Items ---- */}
  <div>
    <label className="block text-[10px] font-medium text-foreground mb-0.5">Line Items</label>
    <RoofingAreaLineItemEditor
      ref={(el) => {
        lineItemEditorRefs.current[area.id] = el;
      }}
      areaId={area.id}
      companyId={area.companyId || null}
    />
  </div>

  {/* ---- Photos (collapsible) ---- */}
{/* Photo section – custom collapsible with chevron */}
<div className="rounded-lg border border-primary/25 bg-primary/5 p-2">
  {/* Header – clickable to toggle */}
  <div
    className="flex items-center justify-between cursor-pointer select-none"
    onClick={() => setPhotoOpen(prev => ({ ...prev, [area.id]: !prev[area.id] }))}
  >
    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
      <Camera className="size-3.5 text-primary" />
      Area Photos
    </div>
    <button
      type="button"
      className="text-primary transition-transform duration-200"
      style={{ transform: photoOpen[area.id] ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </div>

  {/* Content – collapses/expands */}
  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      photoOpen[area.id] ? "max-h-[2000px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
    }`}
  >
    {(["before", "after"] as const).map((type) => (
      <div key={type} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold capitalize text-foreground">{type}</span>
          <input
            ref={(el) => {
              if (el) fileInputRefs.current[`${area.id}-${type}`] = el;
            }}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handlePhotoUpload(area.id, type, file);
                e.target.value = "";
              }
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRefs.current[`${area.id}-${type}`]?.click()}
            disabled={uploading[`${area.id}-${type}`] || !area.companyId}
            title={!area.companyId ? "Save area first" : ""}
            className="flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-3" />
            Add {type === "before" ? "Before" : "After"}
          </button>
        </div>

        {(areaPhotos[area.id]?.[type] || []).length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {(areaPhotos[area.id]?.[type] || []).map((photo) => (
              <div key={photo.id} className="relative overflow-hidden rounded-lg border border-border">
                <img
                  src={`/api/estimate-photos/download?path=${encodeURIComponent(photo.storagePath)}`}
                  alt={`${type} photo`}
                  className="h-16 w-full object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(area.id, photo.id)}
                  className="absolute right-1 top-1 rounded-md bg-red-600 p-0.5 text-white hover:bg-red-700"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No {type} photos yet</p>
        )}
      </div>
    ))}
  </div>
</div>
</div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddArea}
        disabled={savingAreaIds.size > 0 || deletingAreaIds.size > 0}
        className="w-full rounded-lg border-2 border-dashed border-primary/50 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
      >
        <Plus className="inline size-4 mr-1" /> Add Another Area
      </button>
    </div>
  );
}

export const RoofingAreasEditorV2 = forwardRef<RoofingAreasEditorV2Ref, RoofingAreasEditorV2Props>(
  RoofingAreasEditorV2Inner
);
RoofingAreasEditorV2.displayName = "RoofingAreasEditorV2";
