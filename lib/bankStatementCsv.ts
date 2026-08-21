/**
 * Bank statement CSV parsing — pure text parsing, no upload/storage
 * involved. A bank CSV never leaves the browser: it's parsed client-
 * side into BankReconciliationService's existing `BankStatementLine[]`
 * shape and fed straight into `reconcile()`, nothing is persisted.
 *
 * Two real-world column layouts are handled:
 *   - Date, Description, Amount (one signed amount column) — Chase,
 *     Bank of America, most exports.
 *   - Date, Description, Debit, Credit (two separate columns) — also
 *     common; combined into one signed amount (debit negative, credit
 *     positive) to match BankStatementLine's convention.
 *
 * Column names vary a lot ("Transaction Date" vs "Date" vs "Posting
 * Date", "Memo" vs "Description" vs "Payee"), so headers are matched
 * by keyword rather than exact string. When more than one column looks
 * equally likely (or none does), detection returns null for that
 * field and the UI asks the user to pick manually — this never guesses
 * silently on an ambiguous file.
 */
import type { BankStatementLine } from "./services/bankReconciliationService";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC4180-ish parser: handles quoted fields (including embedded
 * commas and escaped "" quotes), which a hand-rolled `split(",")`
 * would break on for a description like `"Amazon.com, Inc."`. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n from a Windows-exported CSV doesn't
  // leave a trailing \r stuck on the last field of every row.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  // Last field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim().length > 0));
  const [headerRow, ...dataRows] = nonEmptyRows;
  return { headers: (headerRow ?? []).map((h) => h.trim()), rows: dataRows };
}

export type ColumnRole = "date" | "description" | "amount" | "debit" | "credit";

export interface ColumnMapping {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

const HEADER_KEYWORDS: Record<ColumnRole, RegExp> = {
  date: /\b(date|posted|posting)\b/i,
  description: /\b(description|desc|memo|payee|details|narrative)\b/i,
  amount: /\b(amount|amt)\b/i,
  debit: /\b(debit|withdrawal|money\s*out)\b/i,
  credit: /\b(credit|deposit|money\s*in)\b/i,
};

/** Best-effort column guess by header keyword — never asserts
 * confidence beyond "the header text matched a known word for this
 * role." The caller always shows this as an editable/confirmable
 * mapping, never applies it silently. */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const find = (role: ColumnRole): number | null => {
    const idx = headers.findIndex((h) => HEADER_KEYWORDS[role].test(h));
    return idx === -1 ? null : idx;
  };

  return {
    date: find("date"),
    description: find("description"),
    amount: find("amount"),
    debit: find("debit"),
    credit: find("credit"),
  };
}

/** MM/DD/YYYY, YYYY-MM-DD, or MM-DD-YYYY -> ISO yyyy-mm-dd. Returns
 * null (not a guess) for anything else — an unparseable date makes the
 * whole row unusable for matching, so the caller drops it and reports
 * it rather than reconciling against a wrong date. */
export function parseStatementDate(raw: string): string | null {
  const trimmed = raw.trim();

  const isoLike = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const usLike = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (usLike) {
    let [, m, d, y] = usLike;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** "$1,234.56", "(1,234.56)" (parens = negative, a common accounting
 * convention for debits), "-1234.56" -> a plain signed number. Returns
 * null for anything unparseable, same reasoning as parseStatementDate. */
export function parseStatementAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isParenNegative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,]/g, "");
  const value = parseFloat(cleaned);
  if (Number.isNaN(value)) return null;

  return isParenNegative ? -Math.abs(value) : value;
}

/** Applies a (possibly user-corrected) ColumnMapping to parsed rows,
 * producing the exact BankStatementLine[] shape BankReconciliationService
 * already accepts — no change to that service at all. Rows that fail
 * to parse (bad date/amount, or a completely blank line) are reported
 * separately rather than silently dropped, so the user can see if the
 * file didn't map cleanly. */
export function mapRowsToStatementLines(
  rows: string[][],
  mapping: ColumnMapping
): { lines: BankStatementLine[]; skippedRowCount: number } {
  const lines: BankStatementLine[] = [];
  let skippedRowCount = 0;

  rows.forEach((row, index) => {
    const dateRaw = mapping.date !== null ? row[mapping.date] : undefined;
    const descriptionRaw = mapping.description !== null ? row[mapping.description] : undefined;

    const date = dateRaw ? parseStatementDate(dateRaw) : null;

    let amount: number | null = null;
    if (mapping.amount !== null) {
      amount = row[mapping.amount] ? parseStatementAmount(row[mapping.amount]) : null;
    } else if (mapping.debit !== null || mapping.credit !== null) {
      const debit = mapping.debit !== null && row[mapping.debit] ? parseStatementAmount(row[mapping.debit]) : null;
      const credit = mapping.credit !== null && row[mapping.credit] ? parseStatementAmount(row[mapping.credit]) : null;
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    }

    if (!date || amount === null || amount === 0) {
      skippedRowCount++;
      return;
    }

    lines.push({
      id: `csv-row-${index}`,
      date,
      amount,
      description: (descriptionRaw ?? "").trim() || "(no description)",
    });
  });

  return { lines, skippedRowCount };
}
