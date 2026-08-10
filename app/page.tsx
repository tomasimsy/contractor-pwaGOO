import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function RootPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The public marketing page, ALWAYS — the root domain is the home
  // page for customers, full stop, whether or not the visitor happens
  // to be signed in. Previously a signed-in visitor was redirected
  // straight to /dashboard, which meant the business owner's own
  // browser (or any staff member's) never actually saw osrpros.com —
  // only osrpros.com/dashboard. `isSignedIn` only changes the nav's
  // "Sign In" link to "Dashboard", so an authenticated visitor still
  // has a one-click way into the app without the root URL itself
  // being hijacked.
  return <LandingPage isSignedIn={!!user} />;
}
