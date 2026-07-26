"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { AuthProvider } from "./AuthProvider";
import { ServicesProvider } from "./ServicesProvider";
import { LocationProvider } from "./LocationProvider";

/**
 * Every app-wide provider, composed in the order each depends on the
 * one before it: Theme has no dependencies; Auth doesn't depend on
 * Services (session state is independent of which service instances
 * back the data layer); Services is innermost since a future
 * Supabase-backed implementation may want the authenticated user's
 * company/location scope available when constructing its clients.
 * Location depends on both Auth (companyId) and Services
 * (LocationService itself), so it nests inside both.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServicesProvider>
          <LocationProvider>{children}</LocationProvider>
        </ServicesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
