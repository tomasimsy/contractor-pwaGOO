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

