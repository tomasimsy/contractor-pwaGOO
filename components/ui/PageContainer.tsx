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
 * The same doubling happened sideways on tablet and desktop: <main> adds
 * `sm:px-6 lg:px-8` and this wrapper added them again, so the gap between
 * the sidebar and the page content was 64px on desktop. Horizontal
 * padding now comes from <main> alone; the vertical `sm:py-6` stays here.
 */
export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-screen-2xl px-0 py-0 sm:py-6", className)}>
      {children}
    </div>
  );
}
