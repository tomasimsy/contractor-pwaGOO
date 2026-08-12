"use client";

/**
 * Delivery/open status for past "Email Customer" sends — reads
 * estimate_emails (supabase/migrations/20260811160000_estimate_email_tracking.sql)
 * directly via the browser Supabase client (RLS-scoped to the caller's
 * own company). See lib/email/emailTracking.ts's header for why this
 * isn't a full Layer 2 service.
 *
 * Reply tracking is intentionally not shown here — Resend doesn't
 * track replies without inbound-email webhook configuration, a
 * separate, heavier feature. This panel shows sent/delivered/opened/
 * clicked/bounced only.
 */
import { useEffect, useState } from "react";
import { Mail, CheckCircle2, MailOpen, MousePointerClick, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { listEmailsForEstimate, type EstimateEmailRecord, type EstimateEmailStatus } from "@/lib/email/emailTracking";

const STATUS_LABEL: Record<EstimateEmailStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
};

function StatusBadge({ status }: { status: EstimateEmailStatus }) {
  const styles: Record<EstimateEmailStatus, string> = {
    sent: "bg-muted text-muted-foreground",
    delivered: "bg-blue-100 text-blue-700",
    opened: "bg-green-100 text-green-700",
    clicked: "bg-emerald-100 text-emerald-700",
    bounced: "bg-destructive/10 text-destructive",
    complained: "bg-destructive/10 text-destructive",
    failed: "bg-destructive/10 text-destructive",
  };
  const Icon =
    status === "clicked" ? MousePointerClick :
    status === "opened" ? MailOpen :
    status === "bounced" || status === "complained" || status === "failed" ? AlertTriangle :
    status === "delivered" ? CheckCircle2 : Mail;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      <Icon className="size-2.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function EmailHistoryPanel({ estimateId }: { estimateId: string }) {
  const [emails, setEmails] = useState<EstimateEmailRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEmailsForEstimate(supabase, estimateId).then((rows) => {
      if (!cancelled) setEmails(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [estimateId]);

  if (emails === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading email history…
      </div>
    );
  }
  if (emails.length === 0) {
    return <p className="text-xs text-muted-foreground">No emails sent yet for this estimate.</p>;
  }

  return (
    <ul className="space-y-2">
      {emails.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">{e.subject}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              To {e.toAddress} · Sent {formatWhen(e.sentAt)}
              {e.clickedAt
                ? ` · Clicked ${formatWhen(e.clickedAt)}`
                : e.openedAt
                  ? ` · Opened ${formatWhen(e.openedAt)}`
                  : e.deliveredAt
                    ? ` · Delivered ${formatWhen(e.deliveredAt)}`
                    : ""}
            </div>
          </div>
          <StatusBadge status={e.status} />
        </li>
      ))}
    </ul>
  );
}
