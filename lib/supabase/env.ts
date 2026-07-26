/**
 * Shared by lib/supabase/client.ts, lib/supabase/server.ts, and
 * proxy.ts. Fails loudly, at import time, if NEXT_PUBLIC_SUPABASE_URL/
 * NEXT_PUBLIC_SUPABASE_ANON_KEY aren't set — matching contractor-pwa's
 * lib/supabase.ts, which throws under the exact same condition rather
 * than silently degrading.
 *
 * A PREVIOUS version of this file fell back to placeholder values
 * ("https://placeholder.supabase.co") when the env vars were missing,
 * specifically to stop @supabase/ssr's createBrowserClient from
 * crashing `next build`'s prerender before .env.local existed. That
 * placeholder is exactly the kind of "temporary fallback that hides
 * missing configuration" flagged during the auth-completion pass: it
 * meant a misconfigured deployment would build "successfully" and
 * then silently fail every real auth/data call at runtime (surfacing
 * only as a confusing "Failed to fetch" deep inside AuthProvider),
 * instead of failing the build immediately with a clear message
 * pointing at the actual missing configuration.
 */
const SUPABASE_URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL_ENV || !SUPABASE_ANON_KEY_ENV) {
  throw new Error(
    "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local — see contractor-pwa/.env.local for the values this app shares a project with."
  );
}

export const SUPABASE_URL = SUPABASE_URL_ENV;
export const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_ENV;
