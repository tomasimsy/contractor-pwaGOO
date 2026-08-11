import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — OSR Pros",
};

/**
 * Shown by the service worker when a navigation fails and we have no
 * cached copy of that specific page.
 *
 * Deliberately a plain server component with no providers, no data
 * fetching and no client JS: it is precached at SW install and has to
 * render from cache with zero network. Anything that reached for
 * Supabase or auth state here would defeat the entire purpose.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hasn&apos;t been opened on this device yet, so there&apos;s no saved copy to
        show. Reconnect and it&apos;ll load normally.
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Pages you&apos;ve already visited will still open while offline, but their data
        won&apos;t be up to date until you reconnect.
      </p>
    </main>
  );
}
