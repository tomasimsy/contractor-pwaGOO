"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

/**
 * "Install app" banner.
 *
 * TWO PLATFORMS, TWO MECHANISMS — this is why the component isn't just
 * a button:
 *
 *  * Chrome/Edge/Android fire `beforeinstallprompt`. The event must be
 *    captured and its default prevented, otherwise the browser shows
 *    its own mini-infobar and the saved event is the ONLY way to
 *    trigger installation later. It is single-use: after `prompt()`
 *    resolves the event is spent and must be discarded.
 *
 *  * iOS Safari never fires it and exposes no install API at all.
 *    Installation there is strictly manual (Share → Add to Home
 *    Screen), so the only honest thing to offer is instructions.
 *
 * Rendered `lg:hidden` — installation is a mobile affordance, and the
 * brief said desktop behaviour stays unchanged.
 */

/** Not in TS's lib.dom yet; Chromium-only. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "contractor-app-v2-install-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until checked

  useEffect(() => {
    // Already installed? `display-mode: standalone` is the cross-browser
    // signal; `navigator.standalone` is the older iOS one. Showing an
    // install banner inside the installed app would be nonsense.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;

    let wasDismissed = false;
    try {
      wasDismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private mode / storage blocked — treat as not dismissed.
    }
    if (wasDismissed) return;

    setDismissed(false);

    const ua = window.navigator.userAgent;
    // iPadOS 13+ reports as Macintosh, hence the touch check.
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIosSafari(iOS && safari);

    const onBeforeInstall = (e: Event) => {
      // Suppress the browser's own infobar and keep the event so our
      // button can trigger it later.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Non-fatal: banner reappears next session, which is acceptable.
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Spent either way — a second prompt() on the same event throws.
    setDeferred(null);
    dismiss();
  }

  if (dismissed) return null;
  // Nothing to offer: not installable via event, and not iOS Safari.
  if (!deferred && !isIosSafari) return null;

  return (
    <div className="fixed inset-x-2 bottom-2 z-50 rounded-xl border border-primary/30 bg-card p-3 shadow-lg lg:hidden">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install OSR Pros</p>
          {isIosSafari && !deferred ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap <Share className="inline size-3.5 align-text-bottom" /> Share, then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add it to your home screen for full-screen, app-like access.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {deferred && (
            <button
              type="button"
              onClick={install}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-3.5" /> Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
