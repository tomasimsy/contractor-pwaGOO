/**
 * Layer 0 — pure, dependency-free tabular export. Turns any report's
 * row data (P&L lines, AR aging, payroll runs, whatever) into a CSV
 * string — no I/O, no framework. Every report service in this file
 * returns plain objects specifically so they can be handed to this
 * function directly.
 *
 * PDF and Excel export are NOT implemented here, and not faked: both
 * need a rendering/workbook library (e.g. a PDF layout engine, xlsx
 * writer) that belongs in the consuming application, not this
 * framework-agnostic service layer — this function produces the same
 * underlying tabular data those formats would render, which is the
 * service layer's actual job; the consuming app chooses how to present it.
 */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Rows -> CSV text, given an explicit column list (header + accessor)
 * rather than `Object.keys(rows[0])` — so column order/labels are a
 * deliberate choice per report, not whatever a row object's own key
 * order happens to be, and an empty `rows` array still produces a
 * correct header-only CSV instead of throwing. */
export function exportToCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  return [header, ...lines].join("\n");
}
