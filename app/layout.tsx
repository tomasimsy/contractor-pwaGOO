"use client";

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
      </head>
      <body className={`${inter.className} bg-gray-50`}>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}