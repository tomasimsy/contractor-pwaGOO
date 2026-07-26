"use client";

/**
 * The two states every read-only component needs and none of them
 * used to render at all: "still loading" and "the fetch failed."
 * Paired with useAsyncResource so a component's only job is to render
 * data/loading/error, never to decide how a spinner or error banner
 * looks — one visual treatment, reused everywhere.
 */

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-4 text-sm text-gray-500">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="self-start text-red-800 underline sm:self-auto">
          Retry
        </button>
      )}
    </div>
  );
}
