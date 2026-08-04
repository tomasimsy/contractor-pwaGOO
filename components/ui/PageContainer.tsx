import { cn } from "@/lib/utils";

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8", className)}>{children}</div>;
}
