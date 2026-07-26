import { FileText, PenTool, DollarSign, GitPullRequest, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import type { UseEstimateFormReturn } from "@/lib/hooks/useEstimateForm";

type TimelineEvent = {
  id: string;
  date: string;
  icon: typeof FileText;
  label: string;
  detail?: string;
  tone: "neutral" | "success" | "amber";
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Draft",
  approved: "Signed",
  converted: "Converted to Invoice",
  completed: "Completed",
};

/**
 * "What has actually happened to this estimate, in order" — assembled
 * from data the form already loads (change orders, payments, signature)
 * rather than a separate audit-log query. Doesn't include the estimate's
 * own creation timestamp because useEstimateForm doesn't currently
 * expose it — only real, dated events are shown; nothing is
 * back-filled or guessed.
 */
export default function EstimateTimeline({ form }: { form: UseEstimateFormReturn }) {
  const events: TimelineEvent[] = [];

  form.changeOrders.forEach((co) => {
    events.push({
      id: `${co.id}-created`,
      date: co.created_at,
      icon: GitPullRequest,
      label: `Change order "${co.title || co.change_order_number}" created`,
      detail: formatCurrency(co.total_amount),
      tone: "neutral",
    });
    if (co.approved_at) {
      events.push({
        id: `${co.id}-approved`,
        date: co.approved_at,
        icon: CheckCircle2,
        label: `Change order "${co.title || co.change_order_number}" approved`,
        detail: formatCurrency(co.total_amount),
        tone: "success",
      });
    }
  });

  if (form.signature) {
    events.push({
      id: "signature",
      date: form.signature.date,
      icon: PenTool,
      label: "Signed by customer",
      tone: "success",
    });
  }

  form.payments.forEach((p) => {
    events.push({
      id: p.id,
      date: p.created_at,
      icon: DollarSign,
      label: "Payment received",
      detail: `${formatCurrency(p.amount)} · ${p.method}`,
      tone: "success",
    });
  });

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className="text-gray-500">Current status:</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">
          <FileText className="size-3" />
          {STATUS_LABEL[form.status] || form.status}
        </span>
        {form.existingInvoiceId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">
            Converted to Invoice
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-gray-400">No activity yet — nothing has been signed, approved, or paid on this estimate.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-gray-100 pl-4 ml-1.5">
          {events.map((event) => {
            const Icon = event.icon;
            return (
              <li key={event.id} className="relative">
                <span
                  className={`absolute -left-[23px] top-0.5 flex size-4 items-center justify-center rounded-full ${
                    event.tone === "success" ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <Icon className="size-2.5" />
                </span>
                <div className="text-[13px] font-medium text-gray-800">{event.label}</div>
                <div className="text-xs text-gray-400">
                  {formatShortDate(event.date)}
                  {event.detail && ` · ${event.detail}`}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
