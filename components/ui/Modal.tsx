"use client";

/** Minimal reusable modal shell — no existing Dialog/Sheet primitive was
 * found in the codebase, so this is the first one. Purely presentational
 * (backdrop + panel + close-on-backdrop-click); callers own all form
 * state/logic inside `children`.
 *
 * Tall content: the panel is never taller than the screen. Its title stays
 * put and the body scrolls inside it, so the top of a long form is always
 * reachable. (Centring a taller-than-screen panel with flexbox pushed its
 * top off-screen where it could not be scrolled to.) */
import { useEffect } from "react";
import type { ReactNode } from "react";

const WIDTH = { md: "max-w-2xl", lg: "max-w-3xl", xl: "max-w-4xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Panel width. Default md (the original width). */
  size?: keyof typeof WIDTH;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div
        className={`my-auto flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-xl bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] ${WIDTH[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              ✕
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
