import { LineItem } from "@/types";

export const calculateSubtotal = (items: LineItem[]): number => {
  return items.reduce((sum, item) => sum + item.total, 0);
};

export const calculateTax = (subtotal: number, taxRate: number): number => {
  return subtotal * (taxRate / 100);
};

export const calculateTotal = (
  subtotal: number,
  markup: number,
  discount: number,
  tax: number
): number => {
  return subtotal + markup - discount + tax;
};

export const calculateRemainingBalance = (total: number, paid: number): number => {
  return Math.max(0, total - paid);
};

/**
 * Single source of truth for an estimate's "revised total" — replaces the
 * two formulas that used to diverge (one that folded in markup/discount/tax,
 * one that didn't). Every caller (estimate form, change-order approval
 * cascade, invoice generation) must derive this number the same way.
 */
export const calculateRevisedTotal = (
  subtotal: number,
  markup: number,
  discount: number,
  tax: number,
  approvedChangeOrderTotal: number
): number => {
  return calculateTotal(subtotal, markup, discount, tax) + approvedChangeOrderTotal;
};

/**
 * The authoritative "current total" for a project once an invoice may
 * exist. Every total-changing path (item edits via saveEstimate, change
 * order approval) writes to the estimate's own `total` first and then
 * cascades it onto any linked invoice — but the cascade can only run for
 * paths that go through this app's code, so the estimate's total is the
 * one guaranteed to be current. The invoice's own `total` is a fallback
 * for the rare case an invoice exists with no usable project total (e.g.
 * a not-yet-loaded estimate). Every page showing a per-project total
 * once an invoice may exist (Invoice detail, Expense) must derive it
 * this same way instead of trusting invoice.total directly.
 */
export const resolveProjectTotal = (
  estimateTotal: number | null | undefined,
  invoiceTotal: number | null | undefined
): number => {
  return estimateTotal || invoiceTotal || 0;
};

/**
 * A rough, simplified federal tax estimate (flat rate against net
 * profit) — this is the only calculation of its kind in the app today,
 * but it's still pulled out here rather than left inline on the Tax
 * Dashboard page so any future tax report/reminder/export that needs the
 * same "estimated liability" figure derives it identically instead of
 * re-deriving its own copy.
 */
export const calculateEstimatedTaxLiability = (
  netProfit: number,
  rate: number = 0.25
): number => {
  return netProfit * rate;
};

