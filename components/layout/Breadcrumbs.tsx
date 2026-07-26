"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABEL_OVERRIDES: Record<string, string> = {
  expense: "Expenses",
  "pending-payouts": "Pending Payouts",
  "settings": "Manage",
  tax: "Tax & Compliance",
};

function humanize(segment: string): string {
  if (LABEL_OVERRIDES[segment]) return LABEL_OVERRIDES[segment];
  // Route params (estimate/invoice/client ids) look like uuids or numeric ids —
  // show a generic label rather than a raw uuid in the trail.
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return "Details";
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Auto-derived from the URL — one implementation for every shell-wrapped
 * page instead of each page hand-writing its own trail. Pass `items` to
 * override when a page's route segments don't map cleanly to display
 * labels (e.g. an [id] segment that should show the record's real name).
 */
export default function Breadcrumbs({
  items,
}: {
  items?: { label: string; href?: string }[];
}) {
  const pathname = usePathname();

  const trail =
    items ??
    (pathname || "")
      .split("/")
      .filter(Boolean)
      .map((segment, i, segments) => ({
        label: humanize(segment),
        href: "/" + segments.slice(0, i + 1).join("/"),
      }));

  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href="/dashboard-v2" className="hover:text-foreground transition-colors">
        Home
      </Link>
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={crumb.href ?? crumb.label} className="flex items-center gap-1.5">
            <ChevronRight className="size-3" />
            {isLast || !crumb.href ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
