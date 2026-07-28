/**
 * The payment methods offered in the UI. Deliberately a shared constant
 * rather than a hardcoded <select> in one component, so the Payments
 * list, the record dialog, and any future receipt/reminder template all
 * label a method identically.
 *
 * `invoice_payments.method` is free TEXT on the live table and already
 * holds values written by the original app ("bank_transfer", "cash",
 * "check", "zelle"), so these ids match what's in production — changing
 * them would orphan existing rows. Unknown/legacy values still render
 * via formatPaymentMethod's fallback rather than showing blank.
 *
 * FUTURE (Stripe/ACH): an online payment records itself through the
 * same PaymentService.record() with a method id added here plus a
 * gateway reference in `referenceNumber`. No schema or calculation
 * change is needed — which is the point of keeping this a plain list.
 */
export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "check", label: "Check" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "zelle", label: "Zelle" },
  { id: "card", label: "Card" },
  { id: "other", label: "Other" },
] as const;

/** Turns a stored method id into something human — including legacy or
 * gateway-written values that aren't in the list above. */
export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "—";
  const known = PAYMENT_METHODS.find((m) => m.id === method);
  if (known) return known.label;
  return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
