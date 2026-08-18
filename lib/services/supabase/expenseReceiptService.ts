/**
 * Supabase implementation of ExpenseReceiptService.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseReceipt, ExpenseReceiptService } from "../expenseReceiptService";
import type { UUID } from "../types";

interface ExpenseReceiptRow {
  id: string;
  expense_id: string;
  company_id: string;
  receipt_file_url: string;
  receipt_date: string | null;
  receipt_amount: number | null;
  receipt_vendor: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

function mapRow(row: ExpenseReceiptRow): ExpenseReceipt {
  return {
    id: row.id as UUID,
    expenseId: row.expense_id as UUID,
    companyId: row.company_id as UUID,
    receiptFileUrl: row.receipt_file_url,
    receiptDate: row.receipt_date,
    receiptAmount: row.receipt_amount,
    receiptVendor: row.receipt_vendor,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by as UUID | null,
  };
}

export function createSupabaseExpenseReceiptService(supabase: SupabaseClient): ExpenseReceiptService {
  return {
    async listForExpense(expenseId) {
      const { data, error } = await supabase
        .from("expense_receipts")
        .select("*")
        .eq("expense_id", expenseId)
        .order("uploaded_at", { ascending: false });

      if (error) throw new Error(`Failed to list expense receipts: ${error.message}`);
      return (data as ExpenseReceiptRow[]).map(mapRow);
    },

    async listForExpenses(expenseIds) {
      if (expenseIds.length === 0) return {};
      const { data, error } = await supabase
        .from("expense_receipts")
        .select("*")
        .in("expense_id", expenseIds)
        .order("uploaded_at", { ascending: false });

      if (error) throw new Error(`Failed to list expense receipts: ${error.message}`);
      const byExpense: Record<string, ExpenseReceipt[]> = {};
      for (const row of (data as ExpenseReceiptRow[]) ?? []) {
        const receipt = mapRow(row);
        (byExpense[receipt.expenseId] ??= []).push(receipt);
      }
      return byExpense;
    },

    async create(input) {
      const { data, error } = await supabase
        .from("expense_receipts")
        .insert({
          expense_id: input.expenseId,
          company_id: input.companyId,
          receipt_file_url: input.receiptFileUrl,
          receipt_date: input.receiptDate ?? null,
          receipt_amount: input.receiptAmount ?? null,
          receipt_vendor: input.receiptVendor ?? null,
          uploaded_by: input.uploadedBy,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to save expense receipt: ${error.message}`);
      return mapRow(data as ExpenseReceiptRow);
    },

    async remove(receiptId) {
      // Hard delete — see expenseReceiptService.ts's file header for why
      // this table has no deleted_at column to soft-delete against.
      const { error } = await supabase.from("expense_receipts").delete().eq("id", receiptId);
      if (error) throw new Error(`Failed to delete expense receipt: ${error.message}`);
    },
  };
}
