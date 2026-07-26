"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

// This Next.js version renamed the recovery callback from the
// `reset()` that older docs/training data would suggest to
// `unstable_retry()` — confirmed against
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
// for this exact project, per AGENTS.md's "heed deprecation notices."
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. You can try again, or go back to the dashboard if the problem persists.
      </p>
      <button
        onClick={unstable_retry}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
