import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The ONE status-pill implementation. Every DRAFT/OPEN/PAID/PENDING/
 * OVERDUE label in the app should render through this instead of a
 * one-off `bg-emerald-50 text-emerald-700` (or amber, or slate...)
 * span written inline at the call site — that per-page duplication is
 * why the same "pending" status currently renders in at least 3
 * different shades of amber across the app.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/15 text-warning-foreground",
        danger: "bg-danger/10 text-danger",
        info: "bg-info/10 text-info",
        primary: "bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
