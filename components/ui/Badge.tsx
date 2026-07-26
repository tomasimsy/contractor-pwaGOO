import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning-foreground",
  danger: "bg-danger/10 text-danger",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONE_CLASSES; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE_CLASSES[tone], className)}>{children}</span>;
}
