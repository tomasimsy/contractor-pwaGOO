import { cn } from "@/lib/utils";

/**
 * Page-level wrapper: caps width on large screens, centres, and pads.
 *
 * MOBILE PADDING IS ZERO — deliberately. Every PageContainer in the app
 * renders inside AppLayout's <main>, which ALREADY applies
 * `px-4 py-6 sm:px-6 lg:px-8`. The two used to stack, so a phone paid
 * 16px twice on each side: measured at 375px wide, content got 311px
 * (83%) and the top of every page burned 48px before the first pixel.
 *
 * Dropping the mobile padding here leaves <main>'s 16px as the single
 * source of the gutter, which is the native-app feel we want. From `sm`
 * up the original `px-6`/`py-6` (and `lg:px-8`) are restored verbatim,
 * so tablet and desktop render exactly as before.
 */
export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-screen-2xl px-0 py-0 sm:px-6 sm:py-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
