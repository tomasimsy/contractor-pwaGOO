/**
 * Supabase-backed EstimateAreaLineItemService — implements the interface
 * from lib/services/estimateAreaLineItemService.ts against the
 * `estimate_area_line_items` table (Estimate Roof V2 only).
 *
 * replaceForArea() mirrors EstimateService.updateLineItems' delete-all-
 * then-reinsert pattern, scoped by `estimate_area_id` so it can never
 * touch another area's rows — this is what guarantees "Save Area 2"
 * cannot affect Area 1 or Area 3 at the data layer, not just in the UI.
 *
 * Every write validates via ValidationService.validateLineItem FIRST —
 * the same check EstimateService.updateLineItems runs for standard line
 * items. Without it, a blank-named area line item could be saved here
 * and only get caught much later, downstream, when
 * InvoiceService.createFromEstimate tried to build an invoice from it —
 * which is exactly what happened during estimateWorkflow.ts's live
 * verification: the customer's signature and approval had ALREADY been
 * recorded by that point, so the failure surfaced as a confusing
 * "Line item name is required" error seemingly caused by signing,
 * when the real, fixable problem was stale, unvalidated data from
 * before this check existed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EstimateAreaLineItem,
  EstimateAreaLineItemService,
  EstimateAreaLineItemCreateInput,
  EstimateAreaLineItemUpdateInput,
  EstimateLineItemUnit,
} from "../estimateAreaLineItemService";
import type { ValidationService } from "../validationService";
import type { UUID } from "../types";

interface EstimateAreaLineItemRow {
  id: string;
  estimate_area_id: string;
  company_id: string;
  category: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit: string | null;
  total: number;
  taxable: boolean;
  sequence_number: number;
  created_at: string;
  deleted_at: string | null;
}

function mapRow(row: EstimateAreaLineItemRow): EstimateAreaLineItem {
  return {
    id: row.id as UUID,
    areaId: row.estimate_area_id as UUID,
    companyId: row.company_id as UUID,
    category: row.category as EstimateAreaLineItem["category"],
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    unit: (row.unit as EstimateLineItemUnit | null) ?? null,
    total: row.total,
    taxable: row.taxable,
    sequenceNumber: row.sequence_number,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function computeTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function createSupabaseEstimateAreaLineItemService(
  supabase: SupabaseClient,
  validationService: ValidationService
): EstimateAreaLineItemService {
  function assertValid(items: Array<{ name: string; quantity: number; unitPrice: number }>) {
    for (const item of items) {
      const check = validationService.validateLineItem(item);
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }
  }


  return {
    async listForArea(areaId) {
      const { data, error } = await supabase
        .from("estimate_area_line_items")
        .select("*")
        .eq("estimate_area_id", areaId)
        .is("deleted_at", null)
        .order("sequence_number", { ascending: true });

      if (error) throw error;
      return (data as EstimateAreaLineItemRow[]).map(mapRow);
    },

    async replaceForArea(areaId, companyId, items) {
      assertValid(items);

      const { error: deleteError } = await supabase
        .from("estimate_area_line_items")
        .delete()
        .eq("estimate_area_id", areaId);
      if (deleteError) throw new Error(`Failed to update area line items: ${deleteError.message}`);

      if (items.length === 0) return [];

      const rowsToInsert = items.map((li, idx) => ({
        estimate_area_id: areaId,
        company_id: companyId,
        category: li.category,
        name: li.name,
        description: li.description ?? null,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        unit: li.unit ?? null,
        total: computeTotal(li.quantity, li.unitPrice),
        taxable: li.taxable ?? true,
        sequence_number: li.sequenceNumber ?? idx,
      }));

      const { data, error: insertError } = await supabase
        .from("estimate_area_line_items")
        .insert(rowsToInsert)
        .select();
      if (insertError) throw new Error(`Failed to save area line items: ${insertError.message}`);

      return (data as EstimateAreaLineItemRow[]).map(mapRow);
    },

    async create(input) {
      assertValid([input]);
      const total = computeTotal(input.quantity, input.unitPrice);
      const { data, error } = await supabase
        .from("estimate_area_line_items")
        .insert({
          estimate_area_id: input.areaId,
          company_id: input.companyId,
          category: input.category,
          name: input.name,
          description: input.description ?? null,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          unit: input.unit ?? null,
          total,
          taxable: input.taxable ?? true,
          sequence_number: input.sequenceNumber ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return mapRow(data as EstimateAreaLineItemRow);
    },

    async update(id, changes) {
      const { data: currentRow, error: fetchError } = await supabase
        .from("estimate_area_line_items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (fetchError) throw fetchError;

      const current = currentRow as EstimateAreaLineItemRow;
      const nextQuantity = changes.quantity ?? current.quantity;
      const nextUnitPrice = changes.unitPrice ?? current.unit_price;
      assertValid([{ name: changes.name ?? current.name, quantity: nextQuantity, unitPrice: nextUnitPrice }]);

      const updateData: Partial<EstimateAreaLineItemRow> = {
        total: computeTotal(nextQuantity, nextUnitPrice),
      };
      if (changes.category !== undefined) updateData.category = changes.category;
      if (changes.name !== undefined) updateData.name = changes.name;
      if (changes.description !== undefined) updateData.description = changes.description;
      if (changes.quantity !== undefined) updateData.quantity = changes.quantity;
      if (changes.unitPrice !== undefined) updateData.unit_price = changes.unitPrice;
      if (changes.unit !== undefined) updateData.unit = changes.unit;
      if (changes.taxable !== undefined) updateData.taxable = changes.taxable;
      if (changes.sequenceNumber !== undefined) updateData.sequence_number = changes.sequenceNumber;

      const { error } = await supabase
        .from("estimate_area_line_items")
        .update(updateData)
        .eq("id", id)
        .is("deleted_at", null);
      if (error) throw error;

      return mapRow({ ...current, ...updateData });
    },

    async softDelete(id) {
      const { error } = await supabase
        .from("estimate_area_line_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
  };
}
