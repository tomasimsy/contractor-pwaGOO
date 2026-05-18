"use client";

import { useEffect, useState } from 'react';

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
      console.log('Install prompt is ready!');
    };

    window.addEventListener('beforeinstallprompt', handler);
    
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      console.log('App is already installed');
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);
    
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 bg-navy text-white rounded-xl p-4 shadow-xl z-50 animate-bounce">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-semibold">📱 Install App</div>
          <div className="text-xs text-gray-300">Get a better experience</div>
        </div>
        <button
          onClick={handleInstall}
          className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-semibold"
        >
          Install
        </button>
      </div>
    </div>
  );
}