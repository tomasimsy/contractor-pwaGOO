/**
 * Expense receipt service — the photo (+ best-effort OCR-extracted
 * vendor/amount/date) attached to one expense. Backed by the
 * `expense_receipts` table and `expense-receipts` storage bucket,
 * which existed in the live database with zero rows/zero app writers
 * before this — see EXPENSE_FORM.md §8. This service is the first
 * thing to ever read/write either.
 *
 * Mirrors EstimatePhotoService's shape (lib/services/estimatePhotoService.ts):
 * the storage upload itself is a separate concern (an API route,
 * app/api/expense-receipts/upload/route.ts, since it needs a server-side
 * Supabase client to resolve the actor's company) — this service only
 * owns the metadata row, created with the resulting storage URL.
 *
 * `expense_receipts` has no `deleted_at` column (confirmed against the
 * live schema), unlike almost everything else in this app — so `remove`
 * here is a genuine hard delete, not the soft-delete convention every
 * other service follows. Acceptable because this is a receipt image
 * attached for convenience/proof, not itself a financial ledger entry
 * (the `estimate_expenses` row it's attached to is the actual financial
 * record, and that one is soft-deleted as usual).
 */
import type { UUID } from "./types";

export interface ExpenseReceipt {
  id: UUID;
  expenseId: UUID;
  companyId: UUID;
  receiptFileUrl: string;
  /** Best-effort OCR guesses, confirmed/edited by the user before save
   * — never the raw unreviewed OCR output. All nullable: a receipt
   * photo is worth keeping even if nothing could be read from it. */
  receiptDate: string | null;
  receiptAmount: number | null;
  receiptVendor: string | null;
  uploadedAt: string;
  uploadedBy: UUID | null;
}

export interface ExpenseReceiptService {
  listForExpense(expenseId: UUID): Promise<ExpenseReceipt[]>;

  /** Bulk read for a list view (e.g. ProjectExpensesPanel) — one query
   * for every visible expense's receipts, grouped by expense id, rather
   * than N queries in a loop. Returns only expense ids that actually
   * have a receipt. */
  listForExpenses(expenseIds: UUID[]): Promise<Record<UUID, ExpenseReceipt[]>>;

  create(input: {
    expenseId: UUID;
    companyId: UUID;
    receiptFileUrl: string;
    receiptDate?: string | null;
    receiptAmount?: number | null;
    receiptVendor?: string | null;
    uploadedBy: UUID | null;
  }): Promise<ExpenseReceipt>;

  /** Hard delete — see file header for why this table has no soft-delete column. */
  remove(receiptId: UUID): Promise<void>;
}
