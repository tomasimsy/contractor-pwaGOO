/**
 * Supabase-backed RoofingAreaTemplateService — implements the interface
 * from lib/services/roofingAreaTemplateService.ts against the
 * `roofing_area_templates` table (see
 * supabase/migrations/20260831000000_roofing_area_templates.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RoofingAreaTemplate,
  RoofingAreaTemplateInput,
  RoofingAreaTemplateService,
} from "../roofingAreaTemplateService";
import type { RoofingAreaQuantityUnit } from "../roofingAreaService";
import type { UUID } from "../types";

interface RoofingAreaTemplateRow {
  id: string;
  company_id: string;
  name: string;
  area_name: string;
  quantity: number;
  quantity_unit: string | null;
  defect: string | null;
  location: string | null;
  corrective_action: string | null;
  materials_included: string | null;
  scope_items: string | null;
  material_cost: number;
  labor_cost: number;
  tax: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function mapRow(row: RoofingAreaTemplateRow): RoofingAreaTemplate {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    name: row.name,
    areaName: row.area_name,
    quantity: row.quantity,
    quantityUnit: (row.quantity_unit as RoofingAreaQuantityUnit | null) ?? null,
    defect: row.defect,
    location: row.location,
    correctiveAction: row.corrective_action,
    materialsIncluded: row.materials_included,
    scopeItems: row.scope_items,
    materialCost: row.material_cost,
    laborCost: row.labor_cost,
    tax: row.tax,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createRoofingAreaTemplateService(supabase: SupabaseClient): RoofingAreaTemplateService {
  return {
    async listForCompany(companyId) {
      const { data, error } = await supabase
        .from("roofing_area_templates")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;

      return (data || []).map(mapRow);
    },

    async create(input: RoofingAreaTemplateInput) {
      const { data, error } = await supabase
        .from("roofing_area_templates")
        .insert({
          company_id: input.companyId,
          name: input.name,
          area_name: input.areaName,
          quantity: input.quantity,
          quantity_unit: input.quantityUnit,
          defect: input.defect,
          location: input.location,
          corrective_action: input.correctiveAction,
          materials_included: input.materialsIncluded,
          scope_items: input.scopeItems,
          material_cost: input.materialCost,
          labor_cost: input.laborCost,
          tax: input.tax,
        })
        .select()
        .single();

      if (error) throw error;

      return mapRow(data);
    },

    async softDelete(templateId, reason) {
      const { error } = await supabase
        .from("roofing_area_templates")
        .update({
          deleted_at: new Date().toISOString(),
          delete_reason: reason,
        })
        .eq("id", templateId);

      if (error) throw error;
    },
  };
}
