"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/ui/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
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
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#d4a048" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <title>OSRPros - Sign Your Estimate</title>
        <meta name="description" content="Review and sign your roofing estimate online" />
        <meta property="og:title" content="One Square Roof - Sign Your Estimate" />
        <meta property="og:description" content="Please review and sign your estimate" />
        <meta property="og:site_name" content="One Square Roof" />
        <meta property="og:image" content="/logo.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="One Square Roof - Sign Your Estimate" />
        <meta name="twitter:description" content="Please review and sign your estimate" />
      </head>
      <body className={`${inter.className} bg-gray-200 flex justify-center`}>
        <div className="w-full max-w-[430px] min-h-screen bg-gray-50 shadow-xl relative">
          {children}
          {showBottomNav && <BottomNav />}
        </div>
      </body>
    </html>
  );
}