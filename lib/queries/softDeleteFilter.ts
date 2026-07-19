/**
 * Standardized soft delete filtering for Supabase queries.
 *
 * Tables with `is_deleted` (boolean):
 * - estimates
 * - invoices
 *
 * Tables with `deleted_at` (timestamp):
 * - All others (estimate_expenses, subcontractor_payments, agent_payments, etc.)
 *
 * Usage:
 *   const { data } = await filterActive(supabase.from("table").select("*"), "table");
 *   const { data } = await filterActive(supabase.from("estimate_expenses").select("*"), "estimate_expenses");
 */

/**
 * Add appropriate soft delete filter based on table name.
 * Returns the query object for chaining (maintains type chain).
 */
export function filterActive(query: any, table: string): any {
  // Tables using boolean is_deleted field
  if (table === 'estimates' || table === 'invoices') {
    return query.eq("is_deleted", false);
  }

  // Tables using timestamp deleted_at field (all others)
  return query.is("deleted_at", null);
}

/**
 * Filter for deleted records (inverse of filterActive).
 * Useful for restore/recovery pages.
 */
export function filterDeleted(query: any, table: string): any {
  if (table === 'estimates' || table === 'invoices') {
    return query.eq("is_deleted", true);
  }

  return query.not("deleted_at", "is", null);
}

/**
 * No filter - return all records including deleted ones.
 * Only use for admin/recovery operations.
 */
export function filterAll(query: any): any {
  return query;
}
