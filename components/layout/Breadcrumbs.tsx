"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/lib/navigation";

function humanize(segment: string): string {
  const known = ALL_NAV_ITEMS.find((i) => i.href === `/${segment}`);
  if (known) return known.label;
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Auto-derived from the URL path — one implementation every page
 * shares instead of each route hand-writing its own trail. */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = (pathname || "").split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground transition-colors">
        Home
      </Link>
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            <ChevronRight className="size-3" aria-hidden="true" />
            {isLast ? (
              <span className="font-medium text-foreground" aria-current="page">
                {humanize(segment)}
              </span>
            ) : (
              <Link href={href} className="hover:text-foreground transition-colors">
                {humanize(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
