"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface Options {
  /** Guard is live only while true (e.g. the modal's isOpen). Re-activating resets dirty state. */
  active?: boolean;
  /** Optional save handler; when given, the prompt offers a "Save" button that runs it. */
  onSave?: () => unknown | Promise<unknown>;
}

type PendingAction = (() => void) | null;

/**
 * Tracks whether the user has edited a form and prompts before the form is
 * closed or left with unsaved changes.
 *
 * Usage:
 *   const unsaved = useUnsavedChanges({ active: isOpen, onSave: handleSave });
 *   <div {...unsaved.trackProps}> ...inputs... </div>   // marks dirty on any edit
 *   <button onClick={unsaved.guard(onClose)}>Cancel</button>
 *   // on successful save: unsaved.markClean()
 *   {unsaved.dialog}
 *
 * While dirty it also warns on tab close/refresh (beforeunload) and on clicks
 * of in-app links (bottom nav, breadcrumbs, etc.).
 */
export function useUnsavedChanges({ active = true, onSave }: Options = {}) {
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [saving, setSaving] = useState(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setIsDirty(v);
  }, []);

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) setDirty(true);
  }, [setDirty]);
  const markClean = useCallback(() => setDirty(false), [setDirty]);

  // Fresh start every time the form (re)opens or closes (state adjusted
  // during render rather than in an effect).
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    setIsDirty(false);
    setPending(null);
  }
  useEffect(() => {
    dirtyRef.current = false;
  }, [active]);

  const onEdit = useCallback(
    (e: SyntheticEvent) => {
      if (!e.nativeEvent.isTrusted) return;
      const t = e.target as HTMLElement;
      if (!t || !("closest" in t)) return;
      if (t.closest("[data-guard-ignore]")) return;
      if ((t as HTMLInputElement).type === "search") return;
      markDirty();
    },
    [markDirty]
  );

  /** Wrap a close/leave action: runs immediately when clean, otherwise asks first. */
  const guard = useCallback(
    (action: () => void) => () => {
      if (active && dirtyRef.current) setPending(() => action);
      else action();
    },
    [active]
  );

  const live = active && isDirty;

  // Browser refresh / tab close.
  useEffect(() => {
    if (!live) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [live]);

  // In-app link clicks (Next <Link>, plain <a>).
  useEffect(() => {
    if (!live) return;
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      const href = url.pathname + url.search + url.hash;
      setPending(() => () => router.push(href));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [live, router]);

  const discard = () => {
    const action = pending;
    setPending(null);
    setDirty(false);
    action?.();
  };

  const save = async () => {
    if (!onSaveRef.current) return;
    setSaving(true);
    try {
      await onSaveRef.current();
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const dialog: ReactNode =
    pending && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <div className="w-full rounded-xl bg-white p-5 shadow-xl" style={{ maxWidth: 384 }}>
              <h3 id="unsaved-title" className="text-[15px] font-semibold text-slate-800">
                Save changes?
              </h3>
              <p className="mt-1.5 text-sm text-slate-500">
                You have unsaved changes. If you leave now, they will be lost.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={discard}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Discard
                </button>
                {onSave && (
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return {
    isDirty,
    markDirty,
    markClean,
    guard,
    dialog,
    trackProps: { onChangeCapture: onEdit, onInputCapture: onEdit },
  };
}
