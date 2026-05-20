"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import BottomNav from "@/components/ui/BottomNav";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Hide BottomNav on public pages
  const isPublicPage = pathname?.startsWith('/public');
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const showBottomNav = !isPublicPage && !isAuthPage;

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return (
    <>
      {children}
      {showBottomNav && <BottomNav />}
    </>
  );
}