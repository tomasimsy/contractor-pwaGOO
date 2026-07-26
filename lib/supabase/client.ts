"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/**
 * The one browser Supabase client — same singleton discipline
 * contractor-pwa's DATABASE_INTEGRITY_AUDIT.md flagged as missing
 * there (two separate `createClient()` call sites produced a
 * "Multiple GoTrueClient instances" warning). Every client component
 * that needs Supabase imports THIS, never calls `createBrowserClient`
 * itself.
 *
 * NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are not set
 * yet (no .env.local exists in this project) — that's expected at this
 * "foundation, no business pages" stage. Unlike the older
 * @supabase/supabase-js createClient(), @supabase/ssr's
 * createBrowserClient THROWS immediately (not just fails on first
 * network call) if given empty strings — confirmed the hard way: it
 * crashed `next build`'s static prerender of every page. The
 * placeholder URL/key below exist only to satisfy that constructor;
 * they point nowhere real, so every actual auth/data call still fails
 * (caught by AuthProvider's try/catch, treated as "logged out") until
 * real values are set in .env.local — this does not make auth work,
 * it only stops an unconfigured project from crashing the build.
 * See lib/supabase/env.ts for the shared fallback values.
 */
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
