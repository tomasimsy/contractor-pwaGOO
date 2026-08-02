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
import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
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

export function RoofingAreasEditorV2({ estimateId, areas, onChange, onSave, onDelete, onAreaLineItemsSaved }: RoofingAreasEditorV2Props) {
  const { roofingAreaService } = useServices();
  const [savingAreaIds, setSavingAreaIds] = useState<Set<UUID>>(new Set());
  const [deletingAreaIds, setDeletingAreaIds] = useState<Set<UUID>>(new Set());
  const [savedAreaIds, setSavedAreaIds] = useState<Set<UUID>>(new Set());
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [areaPhotos, setAreaPhotos] = useState<{ [areaId: string]: { before: RoofingPhoto[]; after: RoofingPhoto[] } }>({});
  const lineItemEditorRefs = useRef<{ [areaId: string]: RoofingAreaLineItemEditorHandle | null }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-600 mb-3">No roof areas yet</p>
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
        <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-medium text-gray-900">
              Area {idx + 1}: {area.areaName}
            </h3>
            <button
              type="button"
              onClick={() => handleDeleteArea(area.id)}
              disabled={deletingAreaIds.has(area.id) || savingAreaIds.has(area.id)}
              className="text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={area.areaName}
                onChange={(e) => handleUpdateArea(area.id, { areaName: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="e.g., Front Slope, Back Roof"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Measurements</label>
              <input
                type="text"
                value={area.measurements ?? ""}
                onChange={(e) => handleUpdateArea(area.id, { measurements: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="e.g., 24 SQ, 12/12 pitch"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Inspection / Condition</label>
              <textarea
                value={area.inspectionNotes ?? ""}
                onChange={(e) => handleUpdateArea(area.id, { inspectionNotes: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Observed condition, damage, existing layers, etc."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Scope / Work Description</label>
              <textarea
                value={area.scopeItems || ""}
                onChange={(e) => handleUpdateArea(area.id, { scopeItems: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Tear off, new shingles, gutters, etc."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={area.notes ?? ""}
                onChange={(e) => handleUpdateArea(area.id, { notes: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Any other notes for this area"
                rows={2}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Repair Item</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Defect</label>
                  <textarea
                    value={area.defect ?? ""}
                    onChange={(e) => handleUpdateArea(area.id, { defect: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Describe the defect"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={area.location ?? ""}
                    onChange={(e) => handleUpdateArea(area.id, { location: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., NE corner, ridge line"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Corrective Action</label>
                  <textarea
                    value={area.correctiveAction ?? ""}
                    onChange={(e) => handleUpdateArea(area.id, { correctiveAction: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Planned repair action"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Material Included</label>
                  <textarea
                    value={area.materialsIncluded ?? ""}
                    onChange={(e) => handleUpdateArea(area.id, { materialsIncluded: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Materials included in this repair"
                    rows={2}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={area.quantity ?? 1}
                    onChange={(e) => handleUpdateArea(area.id, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    value={area.quantityUnit ?? ""}
                    onChange={(e) => handleUpdateArea(area.id, { quantityUnit: (e.target.value || null) as RoofingAreaQuantityUnit | null })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {ROOFING_AREA_QUANTITY_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Material Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={area.materialCost ?? 0}
                    onChange={(e) => handleUpdateArea(area.id, { materialCost: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Labor Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={area.laborCost ?? 0}
                    onChange={(e) => handleUpdateArea(area.id, { laborCost: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={area.tax ?? 0}
                    onChange={(e) => handleUpdateArea(area.id, { tax: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-gray-600">Estimated Repair Cost</span>
                <span className="font-semibold text-gray-900">
                  {formatMoney(calculateAreaRepairCost(area.materialCost ?? 0, area.laborCost ?? 0, area.tax ?? 0))}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Line Items</label>
              <RoofingAreaLineItemEditor
                ref={(el) => {
                  lineItemEditorRefs.current[area.id] = el;
                }}
                areaId={area.id}
                companyId={area.companyId || null}
              />
            </div>

            <div className="space-y-2 rounded bg-gray-50 p-3">
              <div className="text-xs font-medium text-gray-700">Photos</div>

              {(["before", "after"] as const).map((type) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 capitalize">{type} Photos</span>
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
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="size-3" />
                      Add {type === "before" ? "Before" : "After"}
                    </button>
                  </div>

                  {(areaPhotos[area.id]?.[type] || []).length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(areaPhotos[area.id]?.[type] || []).map((photo) => (
                        <div key={photo.id} className="relative overflow-hidden rounded-lg border border-gray-200">
                          <img
                            src={`/api/estimate-photos/download?path=${encodeURIComponent(photo.storagePath)}`}
                            alt={`${type} photo`}
                            className="h-20 w-full object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(area.id, photo.id)}
                            className="absolute right-1 top-1 rounded-md bg-red-600 p-1 text-white hover:bg-red-700"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No {type} photos yet</p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleSaveArea(area)}
              disabled={savingAreaIds.has(area.id)}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium text-white ${
                savedAreaIds.has(area.id) ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
              } disabled:opacity-50`}
            >
              {savingAreaIds.has(area.id) ? "Saving..." : savedAreaIds.has(area.id) ? "✓ Saved" : "Save Area"}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddArea}
        disabled={savingAreaIds.size > 0 || deletingAreaIds.size > 0}
        className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
      >
        <Plus className="inline size-4 mr-1" /> Add Another Area
      </button>
    </div>
  );
}
