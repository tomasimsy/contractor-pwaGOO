"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown in the ROOT layout itself (app/layout.tsx) —
 * something app/error.tsx cannot do, since it's wrapped BY the root
 * layout, not around it. Per Next's own doc comment: "Global error UI
 * must define its own <html> and <body> tags" — this file replaces
 * the root layout entirely when active, so it can't rely on anything
 * that layout would normally provide (fonts, providers, globals.css).
 */
export default function GlobalError({
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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Application error</h2>
          <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#71717a" }}>
            Something went wrong loading the application. Please try again.
          </p>
          <button
            onClick={unstable_retry}
            style={{ borderRadius: "0.5rem", background: "#16794f", color: "#fff", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
