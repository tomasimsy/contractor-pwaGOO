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

