"use client";

/**
 * Expense entry form for /expense-v2. A SEPARATE component from
 * ExpenseDialog by design — that one stays untouched.
 *
 * ============================================================
 * WHY A SECOND FORM IS NOT A SECOND IMPLEMENTATION
 * ============================================================
 * No business logic is restated here. Every rule this form depends on is
 * imported from where it already lives:
 *
 *   EXPENSE_TYPES / PAID_BY_TYPES / PAID_BY_LABEL  lib/services/expenseService
 *   vendor + payee directories                     ./directories
 *   payment methods                                components/payments/paymentMethods
 *   the CreateOrSelect picker                      components/shared/CreateOrSelect
 *   the write                                      ExpenseService.create (via onSubmit)
 *
 * `reimbursable` is derived by the SAME expression ExpenseService.create
 * uses when the field is omitted (`paidByType !== "company"`), so the
 * form previews the service's own default rather than inventing a
 * parallel rule. Amount validation is likewise a mirror of the service's
 * `amount > 0`, which remains the authority — this only avoids a
 * pointless round trip.
 *
 * ============================================================
 * NARROWER ON PURPOSE
 * ============================================================
 * This handles GENERAL expenses only. ExpenseDialog additionally owns
 * the subcontractor and agent-commission tabs, including the
 * multi-agent fan-out and the commission-split preview. Those keep
 * their existing flow untouched: duplicating them here would mean two
 * places computing commissions, which is exactly what this codebase's
 * service layer exists to prevent. So `subcontractor` and
 * `agent_commission` are absent from the type list below, matching
 * ExpenseDialog's own GENERAL_EXPENSE_TYPES filter.
 *
 * "Who fronted this" arrives already answered — /expense-v2 asks it
 * before opening the form — but stays editable here.
 *
 * RECEIPT CAPTURE — added on top of the gap described above. A photo
 * is picked/scanned here (Tesseract.js, client-side, free — see
 * lib/receiptOcr.ts for why not a paid vision API), and the guessed
 * amount/vendor prefill the two fields below them, but ONLY if the
 * user hasn't already typed something — a human always reviews before
 * saving, an OCR guess never silently overwrites a real value. The
 * actual upload + `expense_receipts` row write happen AFTER the
 * expense itself is created (see app/(app)/expense-v2/page.tsx's
 * handleSubmit) — this component only collects the picked File and the
 * confirmed vendor/amount/date, passed up through `onSubmit`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, HandCoins, Trash2, Camera, Loader2 } from "lucide-react";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { createVendorDirectory } from "./directories";
import { useServices } from "@/components/providers/ServicesProvider";
import { scanReceipt } from "@/lib/receiptOcr";
import { compressImageForUpload } from "@/lib/imageResize";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  PAID_BY_LABEL,
  type Expense,
  type ExpenseCreateInput,
  type ExpenseType,
  type PaidByType,
} from "@/lib/services";

/** What ExpenseFormV2 actually hands to `onSubmit` — the real
 * ExpenseCreateInput fields plus three client-only receipt fields that
 * are never part of the expense row itself (they land in a separate
 * `expense_receipts` row, written after the expense exists — see this
 * file's header). */
export type ExpenseFormSubmitInput = Omit<ExpenseCreateInput, "companyId" | "projectId"> & {
  receiptFile?: File | null;
  receiptVendor?: string | null;
  receiptAmount?: number | null;
  receiptDate?: string | null;
};

/** Same exclusion ExpenseDialog applies: these two types have their own
 * dedicated flows (assignment panels + commission split) and must not be
 * enterable through a general form. */
const GENERAL_EXPENSE_TYPES = EXPENSE_TYPES.filter(
  (t) => t !== "subcontractor" && t !== "agent_commission"
);

const FIELD =
  "h-9 w-full rounded-lg bg-neutral-50 px-2.5 text-sm text-neutral-900 outline-none transition-colors focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-red-500/20";
const LABEL = "mb-1 block text-xs font-semibold text-neutral-700";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ExpenseFormV2({
  companyId,
  projectId,
  estimateId,
  initialPaidByType,
  initialReimbursable,
  initialPaidById = null,
  initialPaidByLabel = null,
  onClose,
  onSubmit,
  onChanged,
}: {
  companyId: string;
  projectId: string | null;
  estimateId: string | null;
  /** Answer to "who paid?" collected by the page before this opened. */
  initialPaidByType: PaidByType;
  initialReimbursable: boolean;
  /** Who to reimburse, when the page already knows — for "I Paid" that
   * is the signed-in user. Without it `paidById` stays null and the
   * debt has no owner: ExpenseService.listPendingReimbursements filters
   * on `paid_by_id`, so a null one can never be attributed to anybody. */
  initialPaidById?: string | null;
  /** Display name for the above, so the form can say whose debt it is
   * instead of rendering a bare uuid. */
  initialPaidByLabel?: string | null;
  onClose: () => void;
  onSubmit: (input: ExpenseFormSubmitInput) => Promise<boolean>;
  /** Called after a delete so the page can refresh its own figures. */
  onChanged?: () => Promise<void> | void;
}) {
  const { expenseService } = useServices();

  // Only the six fields the user actually fills in.
  const [expenseType, setExpenseType] = useState<ExpenseType>("materials");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Receipt scan (see file header) ----
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptGuessedDate, setReceiptGuessedDate] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ phase: "preparing" | "recognizing"; progress: number } | null>(null);
  // Which fields the SCAN filled in (as opposed to the user typing them)
  // — tracked so removing the receipt can clear exactly what it added,
  // and so a later manual edit stops that field from being clearable
  // this way (it's the user's value now, not the scan's).
  const [amountFromScan, setAmountFromScan] = useState(false);
  const [vendorFromScan, setVendorFromScan] = useState(false);

  // Bumped every time a receipt is picked or cleared — a scan started
  // for an earlier photo checks its own token before applying results,
  // so removing the receipt (or picking a different one) mid-scan can't
  // have a slow, stale OCR result land on top of it a few seconds later.
  const scanTokenRef = useRef(0);

  async function handleReceiptPicked(rawFile: File) {
    const token = ++scanTokenRef.current;
    setScanning(true);
    setScanProgress({ phase: "preparing", progress: 0 });

    // Compress BEFORE it becomes `receiptFile` — this is the file that
    // actually gets uploaded/stored (see handleSubmit below), and a raw
    // phone photo (often 8-12MB) was going out over the wire untouched,
    // large enough to trip a request-size limit and come back as a
    // non-JSON error. The OCR pass below reuses this same compressed
    // copy rather than re-decoding the original a second time.
    const file = await compressImageForUpload(rawFile);
    if (scanTokenRef.current !== token) return; // receipt was cleared/replaced while compressing

    setReceiptFile(file);
    setReceiptPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    try {
      const result = await scanReceipt(file, (info) => {
        if (scanTokenRef.current === token) setScanProgress(info);
      });
      if (scanTokenRef.current !== token) return; // superseded — ignore
      // Prefill only what's still empty — never overwrite something the
      // user already typed, even if the scan disagrees with it.
      if (result.guessedAmount && !amount) {
        setAmount(result.guessedAmount.toFixed(2));
        setAmountFromScan(true);
      }
      if (result.guessedVendor && !vendor.trim()) {
        setVendor(result.guessedVendor);
        setVendorFromScan(true);
      }
      setReceiptGuessedDate(result.guessedDate);
    } finally {
      if (scanTokenRef.current === token) {
        setScanning(false);
        setScanProgress(null);
      }
    }
  }

  function clearReceipt() {
    scanTokenRef.current++; // invalidate any scan still in flight
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setReceiptGuessedDate(null);
    setScanning(false);
    setScanProgress(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
    // Undo exactly what the scan filled in — a value the user typed
    // themselves (amountFromScan/vendorFromScan already false by then)
    // is left alone.
    if (amountFromScan) {
      setAmount("");
      setAmountFromScan(false);
    }
    if (vendorFromScan) {
      setVendor("");
      setPayeeId(null);
      setVendorFromScan(false);
    }
  }

  /** What has ALREADY been recorded against this job — so you can see at
   * the moment of entry whether you've logged this cost before, or spot
   * one you forgot. Scoped to the estimate when there is one (the
   * tightest match for "this job"), else to the project. */
  const [jobExpenses, setJobExpenses] = useState<Expense[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadJobExpenses = useCallback(async () => {
    if (!estimateId && !projectId) {
      setJobExpenses([]);
      return;
    }
    try {
      const rows = estimateId
        ? await expenseService.listForEstimate(estimateId)
        : await expenseService.listForProject(projectId as string);
      setJobExpenses(rows);
    } catch {
      // Never block recording a cost because the history lookup failed —
      // the list is context, not a precondition.
      setJobExpenses([]);
    }
  }, [estimateId, projectId, expenseService]);

  useEffect(() => {
    setJobExpenses(null);
    loadJobExpenses();
  }, [loadJobExpenses]);

  /** Soft delete, matching the pattern ProjectExpensesPanel already
   * uses: confirm, then ExpenseService.softDelete with a reason (the
   * service REQUIRES one — validationService.validateDeleteReason
   * rejects a blank). Nothing is destroyed; the row keeps
   * deleted_at/deleted_by/delete_reason and drops out of every
   * calculation because the list and totals queries filter it, not
   * because anything here subtracts.
   *
   * The service refuses to delete an expense whose reimbursement has
   * already been PAID OUT — that is settled cash, not a typo. That
   * error is surfaced verbatim rather than swallowed. */
  async function handleDelete(e: Expense) {
    if (!window.confirm(`Delete this ${money(e.amount)} cost? It can be restored later.`)) return;
    setDeletingId(e.id);
    setError(null);
    try {
      await expenseService.softDelete(e.id, "User deleted via UI");
      await loadJobExpenses();
      // Let the page re-read its own figures in the same interaction,
      // so "Owed to you" cannot disagree with this list.
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this cost.");
    } finally {
      setDeletingId(null);
    }
  }

  const jobTotal = useMemo(
    () => (jobExpenses ?? []).reduce((sum, e) => sum + e.amount, 0),
    [jobExpenses]
  );

  /* ------------------------------------------------------------------
   * NOT ASKED — settled before this form opened, or sensibly defaulted.
   * These are still written; they are simply not questions.
   *
   *   expenseDate    today. Costs are entered as they happen; a
   *                  back-dated one is an edit, not the common case.
   *   paidByType     the page's "who paid?" choice.
   *   paidById       the signed-in user for "I Paid", else none.
   *   reimbursable   follows from that same choice.
   *   isPaid         true — money has already changed hands, which is
   *                  what "recording an expense" means here.
   *   paymentMethod  null. Optional on the row and not needed to cost
   *                  a job; ExpenseDialog still collects it for anyone
   *                  who wants it.
   *   description    null. "Note" is the one free-text field, and two
   *                  boxes that both mean "say something about this"
   *                  is how they end up used inconsistently.
   * ------------------------------------------------------------------ */
  const expenseDate = new Date().toISOString().slice(0, 10);
  const paidByType: PaidByType = initialPaidByType;
  const paidById = initialPaidById;
  const paidByLabel = initialPaidByLabel;
  const reimbursable = initialReimbursable;

  // Vendors are free text by design (no vendors table); the adapter
  // supplies names already used by this company.
  const vendorDir = useMemo(() => createVendorDirectory(expenseService, companyId), [expenseService, companyId]);

  const parsedAmount = parseFloat(amount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ok = await onSubmit({
        estimateId,
        expenseType,
        amount: parsedAmount,
        expenseDate,
        description: null,
        notes: notes.trim() || null,
        vendor: vendor.trim() || null,
        // Only claim a structured payee when one was actually chosen;
        // otherwise this is a free-text vendor and payeeType stays null.
        payeeType: payeeId || vendor.trim() ? "vendor" : null,
        payeeId,
        paidByType,
        paidById,
        paymentMethod: null,
        isPaid: true,
        reimbursable,
        receiptFile,
        receiptVendor: vendor.trim() || null,
        receiptAmount: parsedAmount,
        receiptDate: receiptGuessedDate,
      });
      if (!ok) setError("Could not save this expense.");
      else clearReceipt();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:max-w-lg sm:rounded-xl"
      >
        {/* The reimbursement case is called out here, not left to be
            inferred from a checkbox further down: it is the difference
            between a plain job cost and one the company now owes
            somebody back, and it was chosen a screen ago. */}
        <header
          className={`flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4 ${
            reimbursable ? "bg-red-50" : "bg-neutral-50/80"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-bold text-neutral-900">Record expense</h2>
            {reimbursable && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                <HandCoins className="size-3" /> Reimbursement
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-900"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 sm:p-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {reimbursable && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              This will be recorded as money the company owes{" "}
              <span className="font-semibold">{paidByLabel ?? "whoever paid"}</span> back.
            </p>
          )}

          {/* ---- REQUIRED ---- */}
          <label className="block">
            <span className={LABEL}>
              Amount
              {amountFromScan && (
                <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-neutral-500">
                  from scan — tap to fix
                </span>
              )}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountFromScan(false);
              }}
              placeholder="0.00"
              className="h-11 w-full rounded-lg bg-neutral-50 px-3 text-base font-semibold text-neutral-900 outline-none transition-colors focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-red-500/20"
              required
              autoFocus
            />
          </label>

          {/* ---- RECEIPT SCAN ---- */}
          <div>
            <span className={LABEL}>Receipt</span>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleReceiptPicked(file);
              }}
            />
            {receiptPreviewUrl ? (
              <div className="flex items-center gap-2.5 rounded-lg bg-neutral-50 p-2">
                <img src={receiptPreviewUrl} alt="Receipt preview" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1 text-xs text-neutral-600">
                  {scanning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin shrink-0" />
                      {scanProgress?.phase === "recognizing"
                        ? `Reading text… ${Math.round(scanProgress.progress * 100)}%`
                        : "Preparing image…"}
                    </span>
                  ) : (
                    <span>Amount/vendor prefilled where possible — review before saving.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearReceipt}
                  aria-label="Remove receipt photo"
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-900"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 text-xs font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              >
                <Camera className="size-4" /> Scan or attach a receipt
              </button>
            )}
          </div>

          <div>
            <span className={LABEL}>Type</span>
            <div className="flex flex-wrap gap-1.5">
              {GENERAL_EXPENSE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setExpenseType(t)}
                  aria-pressed={expenseType === t}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    expenseType === t
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/60"
                  }`}
                >
                  {EXPENSE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* ---- OPTIONAL ---- */}
          <p className="border-t border-neutral-100 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Optional
          </p>

          <div>
            <span className={LABEL}>
              Vendor
              {vendorFromScan && (
                <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-neutral-500">
                  from scan — tap to fix
                </span>
              )}
            </span>
            <CreateOrSelect
              adapter={vendorDir}
              value={payeeId}
              valueLabel={vendor || null}
              onChange={(opt: DirectoryOption | null) => {
                setPayeeId(opt?.id ?? null);
                setVendor(opt?.label ?? "");
                setVendorFromScan(false);
              }}
              placeholder="Search or add a vendor"
            />
          </div>

          <label className="block">
            <span className={LABEL}>Note</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth remembering about this cost"
              className="w-full rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-red-500/20"
            />
          </label>

          {/* ---- ALREADY ON THIS JOB ---- */}
          {jobExpenses !== null && jobExpenses.length > 0 && (
            <div className="border-t border-neutral-100 pt-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Already on this job
                </span>
                <span className="text-[11px] font-medium text-neutral-500">
                  {jobExpenses.length} · {money(jobTotal)}
                </span>
              </div>
              <div className="max-h-40 divide-y divide-neutral-100 overflow-y-auto rounded-lg bg-neutral-50">
                {jobExpenses.map((e) => {
                  const paidByYou = !!e.paidById && e.paidById === paidById;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs"
                    >
                      {/* Amount */}
                      <span className="w-16 shrink-0 font-semibold tabular-nums text-neutral-900">
                        {money(e.amount)}
                      </span>

                      {/* Description */}
                      <span className="min-w-0 flex-1 truncate text-neutral-600">
                        {e.description || e.notes || e.vendor || EXPENSE_TYPE_LABEL[e.expenseType]}
                      </span>

                      {/* Date */}
                      <span className="shrink-0 text-neutral-400">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </span>

                      {/* Paid by */}
                      <span
                        className={`shrink-0 ${
                          paidByYou
                            ? "font-semibold text-red-600"
                            : "text-neutral-500"
                        }`}
                      >
                        {paidByYou ? "You" : PAID_BY_LABEL[e.paidByType]}
                      </span>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        disabled={deletingId === e.id}
                        aria-label={`Delete ${money(e.amount)} cost`}
                        title="Delete this cost"
                        className="shrink-0 rounded p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 bg-neutral-50 px-3.5 py-3 sm:px-4">
          <span className="min-w-0 truncate text-xs text-neutral-500">
            {reimbursable
              ? `Reimbursing ${paidByLabel ?? "whoever paid"}`
              : "Company paid — no reimbursement"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-neutral-200/60 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save expense"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}