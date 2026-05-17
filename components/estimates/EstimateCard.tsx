import Link from "next/link";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";

interface EstimateCardProps {
  estimate: Estimate;
}

export default function EstimateCard({ estimate }: EstimateCardProps) {
  const getStatus = () => {
    if (estimate.signature) return { label: "Signed", color: "bg-green-100 text-green-700" };
    if (estimate.status === "converted") return { label: "Converted", color: "bg-purple-100 text-purple-700" };
    return { label: "Pending", color: "bg-yellow-100 text-yellow-700" };
  };

  const status = getStatus();

  return (
    <Link href={`/estimates/${estimate.id}`}>
      <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-semibold">{estimate.clients?.name || "No client"}</div>
            <div className="text-xs text-gray-400">{formatShortDate(estimate.created_at)}</div>
            {estimate.description && (
              <div className="text-sm text-gray-500 truncate max-w-[200px] mt-1">
                {estimate.description}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-bold">{formatCurrency(estimate.total)}</div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>
        {estimate.signature && (
          <div className="text-xs text-green-600 mt-2">✓ Signed</div>
        )}
      </div>
    </Link>
  );
}