export function EstimateTotals({ totals }) {
  return (
    <div className="border-t pt-4 mt-6">
      <div className="flex justify-between mb-1">
        <span>Subtotal</span>
        <span>${totals.subtotal.toFixed(2)}</span>
      </div>

      <div className="flex justify-between mb-1">
        <span>Tax</span>
        <span>${totals.tax.toFixed(2)}</span>
      </div>

      <div className="flex justify-between font-bold text-xl mt-2">
        <span>Total</span>
        <span>${totals.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
