"use client";

/**
 * Orchestration ONLY — this hook sequences service calls (create, then
 * recalculate, then re-fetch) and holds UI-only state (which field is
 * focused, is the form submitting). It contains NO pricing, tax,
 * markup, or total formula. Every number shown to the user comes back
 * from a service call:
 *   - line item totals / subtotal / grand total -> EstimateService.recalculateTotal
 *   - anything about profit, cost, or payment status -> never rendered
 *     here at all; that's FinancialEngine's job on the project page,
 *     not the estimate form's.
 * If a future change needs a new formula, it goes in EstimateService,
 * not in this hook — this file should never grow an "computeTotal()".
 */
import { useCallback, useState } from "react";
import { useServices } from "../services-context";
import type { Estimate, EstimateLineItem } from "../services";

export type DraftLineItem = Omit<EstimateLineItem, "id" | "total">;

export function useEstimateForm(companyId: string, projectId: string, clientId: string | null) {
  const { estimateService, invoiceService, financialEngine } = useServices();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [markup, setMarkup] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (estimateId: string) => {
      const result = await estimateService.getById(estimateId);
      if (!result) return;
      setEstimate(result);
      setLineItems(result.lineItems.map(({ id, total, ...rest }) => rest));
      setMarkup(result.markup);
      setDiscount(result.discount);
      setTaxRate(result.taxRate);
      setDepositAmount(result.depositAmount);
    },
    [estimateService]
  );

  const addLineItem = useCallback((item: DraftLineItem) => {
    setLineItems((prev) => [...prev, item]);
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Create, then immediately ask EstimateService to compute the total
   * from what was just saved — never trust a client-computed number to
   * match what the server persisted. */
  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (!estimate) {
        const created = await estimateService.create({
          companyId,
          projectId,
          clientId,
          lineItems,
          markup,
          discount,
          taxRate,
          depositAmount,
        });
        const recalculated = await estimateService.recalculateTotal(created.id);
        setEstimate(recalculated);
        return recalculated;
      }
      await estimateService.updateLineItems(estimate.id, lineItems);
      const recalculated = await estimateService.recalculateTotal(estimate.id);
      setEstimate(recalculated);
      return recalculated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [estimate, estimateService, companyId, projectId, clientId, lineItems, markup, discount, taxRate, depositAmount]);

  /** Requesting a deposit means generating a real, standalone invoice
   * for the deposit amount — NOT flipping a "deposit_paid" flag on the
   * estimate. Collecting it is then an ordinary PaymentService.record
   * call against that invoice, same as any other invoice. This is
   * workflow orchestration (two service calls in sequence), not a
   * formula — the invoice's own total IS the deposit amount, computed
   * by InvoiceService, not by this hook. */
  const requestDeposit = useCallback(async () => {
    if (!estimate || depositAmount <= 0) return null;
    // "How much do we actually invoice for this deposit" is a
    // FinancialService calculation (financialCalculations.ts's
    // calculateDepositInvoiceAmount) — identity today, but this hook
    // asks FinancialService rather than assuming depositAmount is
    // invoiced verbatim, so a future percentage-based deposit rule
    // changes in one place, not here.
    const invoiceAmount = financialEngine.calculateDepositInvoiceAmount(depositAmount);
    return invoiceService.createStandalone({
      companyId,
      projectId,
      clientId,
      lineItems: [{ name: "Deposit", description: `Deposit for estimate ${estimate.estimateNumber ?? estimate.id}`, quantity: 1, unitPrice: invoiceAmount }],
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
    });
  }, [estimate, depositAmount, invoiceService, financialEngine, companyId, projectId, clientId]);

  const sendForSignature = useCallback(async () => {
    if (!estimate) return;
    const result = await estimateService.changeStatus(estimate.id, "sent");
    if (result.estimate) setEstimate(result.estimate);
    if (!result.valid) setError(result.issues.map((i) => i.message).join("; "));
  }, [estimate, estimateService]);

  const recordSignature = useCallback(
    async (signature: NonNullable<Estimate["signature"]>) => {
      if (!estimate) return;
      const updated = await estimateService.recordSignature(estimate.id, signature);
      setEstimate(updated);
    },
    [estimate, estimateService]
  );

  return {
    estimate,
    lineItems,
    markup,
    discount,
    taxRate,
    depositAmount,
    saving,
    error,
    setMarkup,
    setDiscount,
    setTaxRate,
    setDepositAmount,
    addLineItem,
    removeLineItem,
    load,
    save,
    requestDeposit,
    sendForSignature,
    recordSignature,
  };
}
