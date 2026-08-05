import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Contractor App",
  description: "Contractor management platform",
  // Next serves app/manifest.ts at this path; naming it explicitly is
  // what puts <link rel="manifest"> in the document, which is the
  // precondition for any browser to consider the app installable.
  manifest: "/manifest.webmanifest",
  applicationName: "Contractor App",
  appleWebApp: {
    // iOS has no manifest support: these meta tags are the ONLY way to
    // get a standalone (chrome-less) launch and a home-screen title
    // there. Without them an iOS "Add to Home Screen" opens a plain
    // Safari tab with the URL bar visible.
    capable: true,
    title: "Contractor",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // A phone-shaped app that a search engine indexes as a login wall
  // gains nothing; more importantly this keeps portal/invoice pages
  // (which carry tokens) out of results.
  formatDetection: { telephone: false },
};

/**
 * `viewport` is a separate export from `metadata` in the App Router —
 * putting themeColor or viewport inside `metadata` is silently ignored.
 *
 * `viewportFit: "cover"` lets the layout extend under the notch/home
 * indicator, which is what makes an installed app look native rather
 * than letterboxed. The safe-area insets already relied on by
 * MobileBottomNav and EstimateForm's sticky bar
 * (`env(safe-area-inset-bottom)`) only resolve to non-zero values when
 * this is set — without it those paddings compute to 0 in standalone
 * mode and the Save bar sits under the home indicator.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16794f" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before React hydrates, directly in <head>, so the correct
// theme is set before first paint — without this, ThemeProvider's own
// (necessarily client-side, post-hydration) effect would cause a
// flash of the wrong theme for any user who chose "dark" but whose
// system preference is light, or vice versa.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("contractor-app-v2-theme");
    var theme = stored === "light" || stored === "dark" ? stored : null;
    if (!theme) {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          {/* Both render null / nothing on desktop and in dev; mounted
              here so every route is covered without touching any of
              the route groups. */}
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
