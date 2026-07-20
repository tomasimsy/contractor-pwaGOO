import { formatCurrency } from "@/lib/utils/formatting";

interface PaymentStatusDisplayProps {
  total: number;
  amountPaid: number;
  remainingBalance: number;
  isLocked?: boolean;
  status?: string;
}

export default function PaymentStatusDisplay({
  total,
  amountPaid,
  remainingBalance,
  isLocked,
  status,
}: PaymentStatusDisplayProps) {
  // Determine payment status
  const isPaid = amountPaid >= total || isLocked || status === "paid";
  const isPartial = amountPaid > 0 && !isPaid;
  const isNotPaid = amountPaid === 0;

  if (isPaid) {
    return (
      <div className="text-xs text-teal-600 font-semibold">
        ✓ Fully Paid
      </div>
    );
  }

  if (isPartial) {
    return (
      <div className="text-xs space-y-0.5">
        <div className="text-amber-600 font-medium">
          Paid: {formatCurrency(amountPaid)}
        </div>
        <div className="text-gray-500">
          Remaining: {formatCurrency(remainingBalance || (total - amountPaid))}
        </div>
      </div>
    );
  }

  // Not paid
  return (
    <div className="text-xs space-y-0.5">
      <div className="text-gray-500">
        Paid: {formatCurrency(0)}
      </div>
      <div className="text-gray-600 font-medium">
        Remaining: {formatCurrency(total)}
      </div>
    </div>
  );
}
