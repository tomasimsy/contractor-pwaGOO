"use client";

/**
 * Bank statement CSV reconciliation — upload a CSV export (no bank
 * connection required), confirm/correct which columns are Date/
 * Description/Amount (or Debit+Credit), then match it against real
 * payments and expenses via BankReconciliationService.
 *
 * This page owns NO reconciliation logic. Parsing lives in
 * lib/bankStatementCsv.ts (pure, testable). Matching is entirely
 * BankReconciliationService.reconcile() (untouched) fed by
 * reconciliationCashFlowAdapter (real payment/expense rows, not the
 * abandoned in-memory ledger — see that adapter's header). The
 * "Needs Review" bucket is a display-only re-categorization of
 * reconcile()'s own unmatched output — lib/bankReconciliationReview.ts
 * — it never changes what reconcile() decided was a match.
 *
 * Nothing here is persisted: no new table, no "cleared" flag saved
 * anywhere. Each run is a fresh comparison against the live register,
 * same as the /accounting page's own numbers.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, CheckCircle2, AlertTriangle, XCircle, FileWarning } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  parseCsv,
  detectColumnMapping,
  mapRowsToStatementLines,
  type ColumnMapping,
} from "@/lib/bankStatementCsv";
import { categorizeUnmatched } from "@/lib/bankReconciliationReview";
import type { BankReconciliationReport } from "@/lib/services/bankReconciliationService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Step = "upload" | "map" | "results";

const COLUMN_ROLE_LABELS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Amount (single signed column)", required: false },
  { key: "debit", label: "Debit / Withdrawal", required: false },
  { key: "credit", label: "Credit / Deposit", required: false },
];

function ReconciliationContent() {
  const { bankReconciliationService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: null, description: null, amount: null, debit: null, credit: null });
  const [skippedRowCount, setSkippedRowCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [report, setReport] = useState<BankReconciliationReport | null>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError("Couldn't find any rows in this file — check it's a CSV export with a header row.");
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(detectColumnMapping(parsed.headers));
      setStep("map");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  const hasUsableAmountMapping = mapping.amount !== null || mapping.debit !== null || mapping.credit !== null;
  const mappingComplete = mapping.date !== null && mapping.description !== null && hasUsableAmountMapping;

  async function handleRunReconciliation() {
    if (!companyId || !mappingComplete) return;
    setRunning(true);
    setRunError(null);
    try {
      const { lines, skippedRowCount: skipped } = mapRowsToStatementLines(rows, mapping);
      setSkippedRowCount(skipped);
      if (lines.length === 0) {
        setRunError("None of the rows could be read with this column mapping — check Date/Amount are pointing at the right columns.");
        return;
      }

      // Scope the register to the statement's own date span (with a
      // few days of slack on each side) rather than asking for a
      // separate date range — the CSV already says what period it
      // covers.
      const dates = lines.map((l) => new Date(l.date).getTime());
      const start = new Date(Math.min(...dates) - 5 * 86400000);
      const end = new Date(Math.max(...dates) + 5 * 86400000);

      const result = await bankReconciliationService.reconcile(
        { companyId, dateRange: { start, end } },
        lines
      );
      setReport(result);
      setStep("results");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Couldn't run reconciliation.");
    } finally {
      setRunning(false);
    }
  }

  const categorized = useMemo(() => (report ? categorizeUnmatched(report) : null), [report]);

  function reset() {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({ date: null, description: null, amount: null, debit: null, credit: null });
    setSkippedRowCount(0);
    setParseError(null);
    setReport(null);
    setRunError(null);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Bank Reconciliation"
        description="Upload a bank statement CSV and match it against your recorded payments and expenses. No bank account connection required."
        actions={
          <Link href="/accounting" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Accounting
          </Link>
        }
      />

      {step === "upload" && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Upload className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">Upload a bank statement CSV</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Export a CSV from your bank's website (checking/savings account activity) and upload it here. Nothing is
            uploaded to a server or saved — it's read in your browser only.
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Choose File
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {parseError && <p className="mt-4 text-xs text-danger">{parseError}</p>}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Confirm column mapping</h2>
              <span className="text-xs text-muted-foreground">{fileName} · {rows.length} rows</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Best-effort guess based on your file's column headers — check it before continuing. Use either Amount, or
              Debit + Credit, not both.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {COLUMN_ROLE_LABELS.map(({ key, label, required }) => (
                <div key={key}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label} {required && <span className="text-danger">*</span>}
                  </label>
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [key]: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">— Not in file —</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Column ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview of the first few rows, with the columns picked
                so far highlighted — lets a user sanity-check the
                mapping against real data before running anything. */}
            {rows.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {headers.map((h, idx) => (
                        <th key={idx} className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">
                          {h || `Column ${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 4).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-2.5 py-1.5 text-foreground">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {runError && <p className="mt-4 text-xs text-danger">{runError}</p>}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunReconciliation}
                disabled={!mappingComplete || running}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? "Reconciling…" : "Run Reconciliation"}
              </button>
              <button type="button" onClick={reset} className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "results" && report && categorized && (
        <div className="space-y-6">
          {/* Summary strip */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <div className="bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-success" /> Matched
              </div>
              <div className="mt-0.5 text-xl font-bold text-success">{report.matched.length}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="size-3.5 text-warning" /> Needs Review
              </div>
              <div className="mt-0.5 text-xl font-bold text-warning">{categorized.reviewCandidates.length}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <XCircle className="size-3.5 text-danger" /> Unmatched
              </div>
              <div className="mt-0.5 text-xl font-bold text-danger">
                {categorized.trulyUnmatchedBankLines.length + report.unmatchedLedgerLines.length}
              </div>
            </div>
          </div>

          {skippedRowCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
              <FileWarning className="size-3.5 shrink-0" />
              {skippedRowCount} row{skippedRowCount === 1 ? "" : "s"} from the CSV couldn&apos;t be read (missing/unparseable date or amount) and were skipped.
            </div>
          )}

          {/* Matched */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-4 text-success" /> Matched ({report.matched.length})
            </h2>
            {report.matched.length === 0 ? (
              <EmptyState title="Nothing matched" description="No bank line matched a recorded payment or expense within the date tolerance." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Bank Statement</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Matched Record</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.matched.map((m) => (
                      <tr key={m.bankLine.id}>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{m.bankLine.description}</div>
                          <div className="text-xs text-muted-foreground">{m.bankLine.date}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{m.ledgerDescription}</div>
                          <div className="text-xs text-muted-foreground">{m.ledgerDate}</div>
                        </td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums ${m.amount >= 0 ? "text-success" : "text-foreground"}`}>
                          {money(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Needs Review */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="size-4 text-warning" /> Needs Review ({categorized.reviewCandidates.length})
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Same amount on both sides, but the dates are further apart than expected — likely the same transaction, worth a quick confirm.
            </p>
            {categorized.reviewCandidates.length === 0 ? (
              <EmptyState title="Nothing to review" description="No close-but-not-quite matches found." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Bank Statement</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Possible Match</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Date Gap</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categorized.reviewCandidates.map((c) => (
                      <tr key={c.bankLine.id}>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{c.bankLine.description}</div>
                          <div className="text-xs text-muted-foreground">{c.bankLine.date}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{c.ledgerCandidate.description}</div>
                          <div className="text-xs text-muted-foreground">{c.ledgerCandidate.date}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="warning">{Math.round(c.dateDiffDays)} day{Math.round(c.dateDiffDays) === 1 ? "" : "s"}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">{money(c.bankLine.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Unmatched — bank side */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <XCircle className="size-4 text-danger" /> Unmatched Bank Lines ({categorized.trulyUnmatchedBankLines.length})
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">On the statement, but no recorded payment or expense of that amount exists.</p>
            {categorized.trulyUnmatchedBankLines.length === 0 ? (
              <EmptyState title="Nothing unmatched" description="Every statement line was matched or flagged for review." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categorized.trulyUnmatchedBankLines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-foreground">{l.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{l.date}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Unmatched — ledger side */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <XCircle className="size-4 text-danger" /> Recorded, Not on Statement ({report.unmatchedLedgerLines.length})
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              A payment or expense recorded in the app with no matching line on the uploaded statement — may not have cleared yet, or the statement doesn't cover this date.
            </p>
            {report.unmatchedLedgerLines.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="Every recorded payment/expense in this window is on the statement." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.unmatchedLedgerLines.map((l) => (
                      <tr key={l.transactionId}>
                        <td className="px-3 py-2 text-foreground">{l.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{l.date}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <button type="button" onClick={reset} className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
            Reconcile Another Statement
          </button>
        </div>
      )}
    </PageContainer>
  );
}

export default function BankReconciliationPage() {
  return (
    <RequirePermission resource="financial_reports" action="view">
      <ReconciliationContent />
    </RequirePermission>
  );
}
