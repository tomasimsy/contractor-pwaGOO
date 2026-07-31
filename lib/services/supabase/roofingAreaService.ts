/**
 * Supabase-backed RoofingAreaService — implements the interface from
 * lib/services/roofingAreaService.ts against the real `estimate_areas` +
 * `estimate_area_photos` tables.
 *
 * Audit logging uses the generic `log_audit_change()` trigger (same as
 * EstimateService / ProjectService) since these tables are added to that
 * trigger's table list via migration.
 *
 * Soft-delete is enforced via RLS (deleted_at filtering) — callers never
 * see deleted rows in queries unless they explicitly ask for them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAreaRepairCost } from "../financialCalculations";
import type {
  RoofingArea,
  RoofingAreaService,
  RoofingAreaCreateInput,
  RoofingAreaUpdateInput,
  RoofingAreaQuantityUnit,
  RoofingPhoto,
  RoofingPhotoCreateInput,
} from "../roofingAreaService";
import type { UUID } from "../types";

interface EstimateAreaRow {
  id: string;
  estimate_id: string;
  company_id: string;
  area_name: string;
  sequence_number: number;
  scope_items: string | null;
  area_total: number;
  measurements: string | null;
  inspection_notes: string | null;
  notes: string | null;
  quantity: number;
  quantity_unit: string | null;
  defect: string | null;
  location: string | null;
  corrective_action: string | null;
  materials_included: string | null;
  material_cost: number;
  labor_cost: number;
  tax: number;
  estimated_repair_cost: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
}

interface EstimateAreaPhotoRow {
  id: string;
  estimate_area_id: string;
  company_id: string;
  photo_type: "before" | "after";
  storage_path: string;
  display_order: number;
  created_at: string;
  deleted_at: string | null;
}

function mapAreaRow(row: EstimateAreaRow): RoofingArea {
  return {
    id: row.id as UUID,
    estimateId: row.estimate_id as UUID,
    companyId: row.company_id as UUID,
    areaName: row.area_name,
    sequenceNumber: row.sequence_number,
    scopeItems: row.scope_items,
    areaTotal: row.area_total,
    measurements: row.measurements,
    inspectionNotes: row.inspection_notes,
    notes: row.notes,
    quantity: row.quantity,
    quantityUnit: (row.quantity_unit as RoofingAreaQuantityUnit | null) ?? null,
    defect: row.defect,
    location: row.location,
    correctiveAction: row.corrective_action,
    materialsIncluded: row.materials_included,
    materialCost: row.material_cost,
    laborCost: row.labor_cost,
    tax: row.tax,
    estimatedRepairCost: row.estimated_repair_cost,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: null,
  };
}

function mapPhotoRow(row: EstimateAreaPhotoRow): RoofingPhoto {
  return {
    id: row.id as UUID,
    areaId: row.estimate_area_id as UUID,
    photoType: row.photo_type,
    storagePath: row.storage_path,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function createRoofingAreaService(supabase: SupabaseClient): RoofingAreaService {
  return {
    async listForEstimate(estimateId, withPhotos = false) {
      const { data: areas, error } = await supabase
        .from("estimate_areas")
        .select("*")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .order("sequence_number", { ascending: true });

      if (error) throw error;

      const mapped = (areas || []).map(mapAreaRow);

      if (!withPhotos) {
        return mapped;
      }

      // Load photos for each area
      const areaIds = mapped.map((a) => a.id);
      if (areaIds.length === 0) {
        return mapped;
      }

      const { data: photos, error: photoError } = await supabase
        .from("estimate_area_photos")
        .select("*")
        .in("estimate_area_id", areaIds)
        .is("deleted_at", null);

      if (photoError) throw photoError;

      const photosByArea = new Map<UUID, RoofingPhoto[]>();
      (photos || []).forEach((photo) => {
        const areaId = photo.estimate_area_id as UUID;
        if (!photosByArea.has(areaId)) {
          photosByArea.set(areaId, []);
        }
        photosByArea.get(areaId)!.push(mapPhotoRow(photo));
      });

      // Attach photos to areas
      return mapped.map((area) => {
        const areaPhotos = photosByArea.get(area.id) || [];
        return {
          ...area,
          beforePhotos: areaPhotos.filter((p) => p.photoType === "before"),
          afterPhotos: areaPhotos.filter((p) => p.photoType === "after"),
        };
      });
    },

    async getById(areaId) {
      const { data: area, error } = await supabase
        .from("estimate_areas")
        .select("*")
        .eq("id", areaId)
        .is("deleted_at", null)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return area ? mapAreaRow(area) : null;
    },

    async create(input) {
      const id = crypto.randomUUID() as UUID;
      const now = new Date().toISOString();

      const materialCost = input.materialCost ?? 0;
      const laborCost = input.laborCost ?? 0;
      const tax = input.tax ?? 0;
      // Always derived here, never trusted from the caller — matches
      // calculateAreaRepairCost() in financialCalculations.ts exactly,
      // so the UI's live preview and the persisted value can't drift.
      const estimatedRepairCost = calculateAreaRepairCost(materialCost, laborCost, tax);

      console.log("Creating roofing area:", {
        id,
        estimateId: input.estimateId,
        companyId: input.companyId,
        areaName: input.areaName,
      });

      const { error } = await supabase
        .from("estimate_areas")
        .insert({
          id,
          estimate_id: input.estimateId,
          company_id: input.companyId,
          area_name: input.areaName,
          sequence_number: input.sequenceNumber,
          scope_items: input.scopeItems || null,
          area_total: input.areaTotal,
          measurements: input.measurements ?? null,
          inspection_notes: input.inspectionNotes ?? null,
          notes: input.notes ?? null,
          quantity: input.quantity ?? 1,
          quantity_unit: input.quantityUnit ?? null,
          defect: input.defect ?? null,
          location: input.location ?? null,
          corrective_action: input.correctiveAction ?? null,
          materials_included: input.materialsIncluded ?? null,
          material_cost: materialCost,
          labor_cost: laborCost,
          tax,
          estimated_repair_cost: estimatedRepairCost,
        });

      if (error) {
        console.error("Roofing area INSERT failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      console.log("Roofing area inserted successfully:", id);

      // Don't use .select() after insert — RLS may block it even after successful insert
      // Return constructed object from input parameters
      return {
        id,
        estimateId: input.estimateId,
        companyId: input.companyId,
        areaName: input.areaName,
        sequenceNumber: input.sequenceNumber,
        scopeItems: input.scopeItems || null,
        areaTotal: input.areaTotal,
        measurements: input.measurements ?? null,
        inspectionNotes: input.inspectionNotes ?? null,
        notes: input.notes ?? null,
        quantity: input.quantity ?? 1,
        quantityUnit: input.quantityUnit ?? null,
        defect: input.defect ?? null,
        location: input.location ?? null,
        correctiveAction: input.correctiveAction ?? null,
        materialsIncluded: input.materialsIncluded ?? null,
        materialCost,
        laborCost,
        tax,
        estimatedRepairCost,
        createdBy: null,
        createdAt: now,
        updatedBy: null,
        updatedAt: now,
        deletedBy: null,
        deletedAt: null,
        deleteReason: null,
      };
    },

    async update(areaId, changes) {
      // Fetch the current row first so the returned object is always
      // fully accurate (previously this constructed a return value from
      // `changes` alone, which doesn't carry estimateId/companyId and
      // silently produced undefined fields on every update — masked
      // only because callers happened to merge their own local copy on
      // top). Reading before writing avoids relying on select-after-update,
      // which RLS can block even when the write itself succeeded.
      const { data: currentRow, error: fetchError } = await supabase
        .from("estimate_areas")
        .select("*")
        .eq("id", areaId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;

      const currentArea = currentRow as EstimateAreaRow;
      const updateData: Partial<EstimateAreaRow> = {};
      if (changes.areaName !== undefined) updateData.area_name = changes.areaName;
      if (changes.sequenceNumber !== undefined) updateData.sequence_number = changes.sequenceNumber;
      if (changes.scopeItems !== undefined) updateData.scope_items = changes.scopeItems;
      if (changes.areaTotal !== undefined) updateData.area_total = changes.areaTotal;
      if (changes.measurements !== undefined) updateData.measurements = changes.measurements;
      if (changes.inspectionNotes !== undefined) updateData.inspection_notes = changes.inspectionNotes;
      if (changes.notes !== undefined) updateData.notes = changes.notes;
      if (changes.quantity !== undefined) updateData.quantity = changes.quantity;
      if (changes.quantityUnit !== undefined) updateData.quantity_unit = changes.quantityUnit;
      if (changes.defect !== undefined) updateData.defect = changes.defect;
      if (changes.location !== undefined) updateData.location = changes.location;
      if (changes.correctiveAction !== undefined) updateData.corrective_action = changes.correctiveAction;
      if (changes.materialsIncluded !== undefined) updateData.materials_included = changes.materialsIncluded;
      if (changes.materialCost !== undefined) updateData.material_cost = changes.materialCost;
      if (changes.laborCost !== undefined) updateData.labor_cost = changes.laborCost;
      if (changes.tax !== undefined) updateData.tax = changes.tax;
      // Re-derived whenever any of its three inputs change (falling back
      // to the current row's stored value for any input NOT part of
      // this update) — never accepted directly from the caller, so it
      // can never be set out of sync with material/labor/tax.
      if (changes.materialCost !== undefined || changes.laborCost !== undefined || changes.tax !== undefined) {
        updateData.estimated_repair_cost = calculateAreaRepairCost(
          updateData.material_cost ?? currentArea.material_cost,
          updateData.labor_cost ?? currentArea.labor_cost,
          updateData.tax ?? currentArea.tax
        );
      }

      const { error } = await supabase
        .from("estimate_areas")
        .update(updateData)
        .eq("id", areaId)
        .is("deleted_at", null);

      if (error) throw error;

      const merged: EstimateAreaRow = { ...(currentRow as EstimateAreaRow), ...updateData };
      return mapAreaRow(merged);
    },

    async softDelete(areaId, reason) {
      const { error } = await supabase
        .from("estimate_areas")
        .update({
          deleted_at: new Date().toISOString(),
          delete_reason: reason,
        })
        .eq("id", areaId);

      if (error) throw error;
    },

    async restore(areaId) {
      const { error } = await supabase
        .from("estimate_areas")
        .update({
          deleted_at: null,
          delete_reason: null,
        })
        .eq("id", areaId);

      if (error) throw error;
    },

    async getPhotosForArea(areaId) {
      const { data: photos, error } = await supabase
        .from("estimate_area_photos")
        .select("*")
        .eq("estimate_area_id", areaId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;

      const mapped = (photos || []).map(mapPhotoRow);
      return {
        before: mapped.filter((p) => p.photoType === "before"),
        after: mapped.filter((p) => p.photoType === "after"),
      };
    },

    async createPhoto(input) {
      const { data: photo, error } = await supabase
        .from("estimate_area_photos")
        .insert({
          estimate_area_id: input.areaId,
          company_id: input.companyId,
          photo_type: input.photoType,
          storage_path: input.storagePath,
          display_order: 0,
        })
        .select()
        .single();

      if (error) throw error;

      return mapPhotoRow(photo);
    },

    async deletePhoto(photoId, reason) {
      const { error } = await supabase
        .from("estimate_area_photos")
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("id", photoId);

      if (error) throw error;
    },
  };
}
