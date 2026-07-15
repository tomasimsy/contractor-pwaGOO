// app/layout.tsx
"use client";

import { usePathname,useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/ui/BottomNav";
import SEO from "@/components/SEO";
import { NotificationProvider } from "@/context/NotificationContext";
import RealtimeNotificationListener from "@/components/RealtimeNotificationListener";
import { Toaster } from "react-hot-toast";

import { supabase } from "@/lib/supabase/client";
import { TripProvider } from '@/components/mileage/context/TripContext';
import { CompanyProvider } from "@/context/CompanyContext";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
const router = useRouter();
const [checkingAuth, setCheckingAuth] = useState(true);

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/public",
  "/text",
];

  // Hide BottomNav on public pages
  const isPublicPage = pathname?.startsWith('/public');
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const showBottomNav = !isPublicPage && !isAuthPage;

useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  }

  let active = true;

  async function checkAuth() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isPublicRoute = PUBLIC_ROUTES.some(
      (route) =>
        pathname === route ||
        pathname.startsWith(`${route}/`)
    );

    // Everything else is protected
    if (!isPublicRoute && !user) {
      router.replace("/login");
      return;
    }

    // Prevent logged-in users from seeing login/signup
    if (
      user &&
      (pathname === "/login" || pathname === "/signup")
    ) {
      router.replace("/dashboard");
      return;
    }

    if (active) setCheckingAuth(false);
  }

  checkAuth();

  return () => {
    active = false;
  };
}, [pathname, router]);

  return (
    <html lang="en">
      <head>
        {/* PWA & Mobile */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="57x57" href="/icons/apple-icon-57x57.png" />
        <link rel="apple-touch-icon" sizes="60x60" href="/icons/apple-icon-60x60.png" />
        <link rel="apple-touch-icon" sizes="72x72" href="/icons/apple-icon-72x72.png" />
        <link rel="apple-touch-icon" sizes="76x76" href="/icons/apple-icon-76x76.png" />
        <link rel="apple-touch-icon" sizes="114x114" href="/icons/apple-icon-114x114.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-icon-120x120.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/icons/apple-icon-144x144.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-icon-180x180.png" />
        
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OSR Pros" />
        <meta name="theme-color" content="#d4a048" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
        
        {/* Primary Meta Tags - OSR Pros Branding with Triad + Charlotte */}
        <title>OSR Pros | Roofing & Remodeling in Greensboro, Charlotte, High Point, Winston-Salem</title>
        <meta name="title" content="OSR Pros | Roofing, Remodeling & Construction - Greensboro, Charlotte, High Point, Winston-Salem" />
        <meta name="description" content="OSR Pros offers professional roofing, kitchen & bathroom remodeling, commercial build-outs, decks, fences, and general construction in Greensboro, Charlotte, High Point, Winston-Salem, and surrounding areas. Free estimates! Family-owned since 2006." />
        <meta name="keywords" content="roofing contractor Greensboro, roofing contractor Charlotte, home remodeling High Point, kitchen remodel Winston-Salem, bathroom renovation, commercial build-out, deck builder, fence installation, general contractor, OSR Pros, One Square Roofing, Triad remodeling, Charlotte remodeling, Piedmont Triad contractor" />
        <meta name="author" content="OSR Pros" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="language" content="English" />
        <meta name="revisit-after" content="7 days" />
        
        {/* Canonical URL */}
        <link rel="canonical" href="https://osrpros.com" />
        <link rel="alternate" href="https://osrpros.com" lang="en-us" />
        
        {/* Geo/Local SEO for Greensboro, Charlotte, High Point, Winston-Salem */}
        <meta name="geo.region" content="US-NC" />
        <meta name="geo.placename" content="Greensboro" />
        <meta name="geo.position" content="36.0726;-79.7920" />
        <meta name="ICBM" content="36.0726, -79.7920" />
        
        {/* Open Graph / Facebook - OSR Pros */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://osrpros.com/" />
        <meta property="og:title" content="OSR Pros - Roofing, Remodeling & Construction Experts in Greensboro, Charlotte, High Point & Winston-Salem" />
        <meta property="og:description" content="Professional roofing, kitchen & bath remodeling, commercial build-outs, decks, and general construction. Free estimates! Family-owned since 2006. Serving Greensboro, Charlotte, High Point, Winston-Salem, and the Piedmont Triad." />
        <meta property="og:image" content="https://osrpros.com/images/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="OSR Pros - Kitchen Remodel Before and After Transformation" />
        <meta property="og:site_name" content="OSR Pros" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:email" content="contact@osrpros.com" />
        <meta property="og:phone_number" content="+17043034112" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://osrpros.com/" />
        <meta name="twitter:title" content="OSR Pros - Roofing & Remodeling Greensboro, Charlotte, High Point, Winston-Salem" />
        <meta name="twitter:description" content="Professional construction services: roofing, remodeling, decks, commercial build-outs. Free estimates! Serving the Piedmont Triad and Charlotte metro." />
        <meta name="twitter:image" content="https://osrpros.com/images/twitter-image.jpg" />
        <meta name="twitter:site" content="@osrpros" />
        <meta name="twitter:creator" content="@osrpros" />
        
        {/* Additional Business Information */}
        <meta name="business:contact_data:street_address" content="123 Business Street" />
        <meta name="business:contact_data:locality" content="Greensboro" />
        <meta name="business:contact_data:region" content="NC" />
        <meta name="business:contact_data:postal_code" content="27401" />
        <meta name="business:contact_data:country_name" content="USA" />
        <meta name="business:contact_data:phone_number" content="+1 (704) 303-4112" />
        
        {/* Favicon & Icons */}
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="shortcut icon" href="/favicon.ico" />
        
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://supabase.co" />
        
        {/* Fonts */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
        {/* DNS Prefetch for external resources */}
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://randomuser.me" />
      </head>
      <body className={`${inter.className} flex justify-center`} style={{ backgroundColor: "#000000ff" }}>
        <NotificationProvider>
          <SEO />
          <RealtimeNotificationListener />
          <Toaster position="top-right" />
          
          {/* ✅ Wrap everything that needs trip context inside TripProvider */}
          <TripProvider>
            <CompanyProvider>
              <div className="w-full min-h-screen relative flex justify-center">
                <div className="w-full max-w-screen-2xl min-h-screen shadow-xl relative">
                  {checkingAuth && !isPublicPage ? (
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                    </div>
                  ) : (
                    <>
                      {children}
                      {showBottomNav && <BottomNav />}
                    </>
                  )}
                </div>
              </div>
            </CompanyProvider>
          </TripProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}