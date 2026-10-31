"use client";

/** In-app error notice, in place of window.alert(). The desktop app's alert
 * looks and behaves differently from the rest of the app, so error messages
 * go through this instead.
 *
 * Usage:
 *   const { notify, toast } = useToast();
 *   notify("Failed to save.");
 *   // render {toast} once in the component's JSX
 *
 * The notice stays until it is clicked or after a few seconds. */
import { useCallback, useEffect, useState } from "react";

const SHOW_MS = 6000;

export function useToast() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  const notify = useCallback((text: string) => setMessage({ text, id: Date.now() }), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const toast = message ? (
    <div
      key={message.id}
      role="alert"
      onClick={() => setMessage(null)}
      className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md cursor-pointer rounded-lg border border-danger/40 bg-card px-4 py-3 text-sm text-danger shadow-lg sm:bottom-6"
    >
      {message.text}
    </div>
  ) : null;

  return { notify, toast };
}
