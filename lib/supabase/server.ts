import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/**
 * Server-side Supabase client (Server Components, Route Handlers,
 * Proxy) — cookie-based session, per @supabase/ssr's standard Next.js
 * App Router pattern. Separate from lib/supabase/client.ts (browser)
 * on purpose: a server client reads/writes cookies, a browser client
 * doesn't, and conflating the two is exactly the kind of mistake that
 * produces subtle auth bugs.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component that can't set cookies —
            // safe to ignore as long as proxy.ts is also refreshing the
            // session (it is; see proxy.ts's own comment).
          }
        },
      },
    }
  );
}
