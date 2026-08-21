import { describe, test, expect } from "vitest";
import {
  parseCsv,
  detectColumnMapping,
  parseStatementDate,
  parseStatementAmount,
  mapRowsToStatementLines,
} from "../lib/bankStatementCsv";

describe("parseCsv", () => {
  test("splits a simple comma-separated file into headers and rows", () => {
    const text = "Date,Description,Amount\n01/02/2026,Coffee Shop,-4.50\n01/03/2026,Payroll Deposit,1200.00\n";
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toEqual([
      ["01/02/2026", "Coffee Shop", "-4.50"],
      ["01/03/2026", "Payroll Deposit", "1200.00"],
    ]);
  });

  test("handles a quoted field containing a comma", () => {
    const text = 'Date,Description,Amount\n01/02/2026,"Amazon.com, Inc.",-19.99\n';
    const { rows } = parseCsv(text);
    expect(rows[0]).toEqual(["01/02/2026", "Amazon.com, Inc.", "-19.99"]);
  });

  test("handles an escaped double-quote inside a quoted field", () => {
    const text = 'Date,Description,Amount\n01/02/2026,"Bob\'s ""Best"" Diner",-12.00\n';
    const { rows } = parseCsv(text);
    expect(rows[0][1]).toBe('Bob\'s "Best" Diner');
  });

  test("normalizes Windows-style CRLF line endings", () => {
    const text = "Date,Description,Amount\r\n01/02/2026,Coffee,-4.50\r\n";
    const { rows } = parseCsv(text);
    expect(rows[0]).toEqual(["01/02/2026", "Coffee", "-4.50"]);
  });

  test("skips blank lines", () => {
    const text = "Date,Description,Amount\n01/02/2026,Coffee,-4.50\n\n01/03/2026,Payroll,1200.00\n";
    const { rows } = parseCsv(text);
    expect(rows).toHaveLength(2);
  });
});

describe("detectColumnMapping", () => {
  test("recognizes a single signed Amount column", () => {
    const mapping = detectColumnMapping(["Date", "Description", "Amount"]);
    expect(mapping).toEqual({ date: 0, description: 1, amount: 2, debit: null, credit: null });
  });

  test("recognizes separate Debit/Credit columns", () => {
    const mapping = detectColumnMapping(["Transaction Date", "Memo", "Debit", "Credit"]);
    expect(mapping).toEqual({ date: 0, description: 1, amount: null, debit: 2, credit: 3 });
  });

  test("returns null for a role with no matching header, rather than guessing", () => {
    const mapping = detectColumnMapping(["Reference", "Notes"]);
    expect(mapping.date).toBeNull();
    expect(mapping.amount).toBeNull();
  });
});

describe("parseStatementDate", () => {
  test("reads MM/DD/YYYY", () => {
    expect(parseStatementDate("01/02/2026")).toBe("2026-01-02");
  });

  test("reads YYYY-MM-DD", () => {
    expect(parseStatementDate("2026-01-02")).toBe("2026-01-02");
  });

  test("reads a 2-digit year as 20XX", () => {
    expect(parseStatementDate("01/02/26")).toBe("2026-01-02");
  });

  test("returns null for unparseable text", () => {
    expect(parseStatementDate("not a date")).toBeNull();
  });
});

describe("parseStatementAmount", () => {
  test("reads a plain negative number", () => {
    expect(parseStatementAmount("-4.50")).toBe(-4.5);
  });

  test("strips a leading dollar sign and thousands separators", () => {
    expect(parseStatementAmount("$1,200.00")).toBe(1200);
  });

  test("treats parentheses as negative (accounting convention)", () => {
    expect(parseStatementAmount("(1,234.56)")).toBe(-1234.56);
  });

  test("returns null for unparseable text", () => {
    expect(parseStatementAmount("N/A")).toBeNull();
  });
});

describe("mapRowsToStatementLines", () => {
  test("maps rows using a single Amount column", () => {
    const rows = [
      ["01/02/2026", "Coffee Shop", "-4.50"],
      ["01/03/2026", "Payroll Deposit", "1200.00"],
    ];
    const { lines, skippedRowCount } = mapRowsToStatementLines(rows, {
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
    });
    expect(skippedRowCount).toBe(0);
    expect(lines).toEqual([
      { id: "csv-row-0", date: "2026-01-02", amount: -4.5, description: "Coffee Shop" },
      { id: "csv-row-1", date: "2026-01-03", amount: 1200, description: "Payroll Deposit" },
    ]);
  });

  test("combines separate Debit/Credit columns into one signed amount", () => {
    const rows = [
      ["01/02/2026", "Coffee Shop", "4.50", ""],
      ["01/03/2026", "Payroll Deposit", "", "1200.00"],
    ];
    const { lines } = mapRowsToStatementLines(rows, { date: 0, description: 1, amount: null, debit: 2, credit: 3 });
    expect(lines[0].amount).toBe(-4.5);
    expect(lines[1].amount).toBe(1200);
  });

  test("skips a row with an unparseable date and reports the count", () => {
    const rows = [
      ["not a date", "Coffee Shop", "-4.50"],
      ["01/03/2026", "Payroll Deposit", "1200.00"],
    ];
    const { lines, skippedRowCount } = mapRowsToStatementLines(rows, {
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
    });
    expect(lines).toHaveLength(1);
    expect(skippedRowCount).toBe(1);
  });

  test("skips a zero-amount row (not a real transaction)", () => {
    const rows = [["01/02/2026", "Zero-dollar auth hold", "0.00"]];
    const { lines, skippedRowCount } = mapRowsToStatementLines(rows, {
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
    });
    expect(lines).toHaveLength(0);
    expect(skippedRowCount).toBe(1);
  });
});
