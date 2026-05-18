"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [showInstall, setShowInstall] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const [buttonText, setButtonText] = useState("Install");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const userAgent = window.navigator.userAgent.toLowerCase();

    const isIOS =
      /iphone|ipad|ipod/.test(userAgent) &&
      !(window as any).MSStream;

    const isAndroid = /android/.test(userAgent);

    const isSamsung = /samsungbrowser/.test(userAgent);

    const isFirefox = /firefox/.test(userAgent);

    const isOpera = /opr\//.test(userAgent);

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    // Already installed
    if (isStandalone) return;

    // iOS Safari / Chrome / Edge
    if (isIOS) {
      setShowInstall(true);
      setButtonText("How to Install");
      setInstallMessage(
        'Tap Share icon → "Add to Home Screen"'
      );
    }

    // Samsung Internet
    else if (isSamsung) {
      setShowInstall(true);
      setButtonText("Install");
      setInstallMessage(
        'Tap Menu (☰) → "Add page to" → "Home screen"'
      );
    }

    // Firefox Android
    else if (isFirefox && isAndroid) {
      setShowInstall(true);
      setButtonText("Install");
      setInstallMessage(
        'Tap Menu (⋮) → "Install" or "Add to Home screen"'
      );
    }

    // Opera Android
    else if (isOpera && isAndroid) {
      setShowInstall(true);
      setButtonText("Install");
      setInstallMessage(
        'Tap Menu → "Add to Home screen"'
      );
    }

    // Chrome / Edge Desktop + Android
    const handler = (e: Event) => {
      e.preventDefault();

      setDeferredPrompt(e as BeforeInstallPromptEvent);

      setShowInstall(true);

      setButtonText("Install");

      setInstallMessage(
        "Install this app for faster access and offline support"
      );
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handler
      );
    };
  }, []);

  const handleInstall = async () => {
    // Native install prompt
    if (deferredPrompt) {
      deferredPrompt.prompt();

      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setShowInstall(false);
      }

      setDeferredPrompt(null);
      return;
    }

    // Fallback instructions
    alert(installMessage);
  };

  const dismissInstall = () => {
    setShowInstall(false);
  };

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[9999] animate-in slide-in-from-bottom duration-300">
      <div className="rounded-2xl bg-primary text-white shadow-2xl border border-white/10 backdrop-blur-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="font-semibold text-base flex items-center gap-2">
              📱 Install App
            </div>

            <p className="text-sm text-gray-300 mt-1 leading-relaxed">
              {installMessage}
            </p>
          </div>

          <button
            onClick={dismissInstall}
            className="text-white/70 hover:text-white text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-navy active:scale-[0.98] transition"
          >
            {buttonText}
          </button>

          <button
            onClick={dismissInstall}
            className="rounded-xl border border-white/20 px-4 py-3 text-sm text-white/80"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}