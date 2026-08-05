import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/env";

/**
 * Route protection — this app's actual security boundary for "which
 * pages need a signed-in user," not app/(app)/layout.tsx's client-side
 * redirect (that's UX only, same "layer 3 is not the boundary"
 * discipline the service layer's own permission docs establish).
 *
 * Named `proxy.ts`, not `middleware.ts` — this Next.js version renamed
 * the convention (confirmed against
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 * for this exact project); `middleware.ts` would silently not run.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  // The ONLY two public pages: the customer portal and the public
  // invoice view. Both are reached from a share link (Copy link, Send
  // via SMS, Email customer — see components/portal/SharePortalPanel)
  // by someone who by definition has no account here.
  //
  // Without this they fell into the `!user` branch below and were 302'd
  // to /login, so every share link this app produced was unusable for
  // its actual recipient — verified: GET /portal/<id>?token=<valid>
  // answered 307 -> /login.
  //
  // Letting them through does NOT make their DATA public. Neither page
  // trusts the URL: each uses the ANON key and reads through a
  // token-scoped RPC (get_customer_portal / get_public_invoice) that
  // does the authorization itself. Verified against the live database —
  // correct token returns the record, a wrong token returns null, and a
  // direct anon read of `estimates` returns []. The secret token in the
  // query string is the credential; this middleware was never what
  // protected them.
  const isPublicShareRoute = pathname.startsWith("/portal/") || pathname.startsWith("/invoice/");
  // API routes must never receive an HTML redirect — a fetch() caller
  // expects JSON (or a real error status), not a 302 into /login's
  // page markup (which is exactly what "Unexpected token '<'... is not
  // valid JSON" was — a signup POST redirected here, and the caller
  // tried to .json() the login page's HTML). Each API route is
  // responsible for its own auth check (some are intentionally public,
  // like this signup route and app/api/portal/sign; others read the
  // session cookie themselves via createServerSupabaseClient).
  const isApiRoute = pathname.startsWith("/api/");

  if (!user && !isAuthRoute && !isApiRoute && !isPublicShareRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Everything except static assets, images, and favicon — running
  // proxy on those would needlessly delay/block them (see proxy.md's
  // own "Good to know" warning about exactly this).
  //
  // The PWA entries (sw.js, manifest.webmanifest, offline, icons/) are
  // excluded for a stronger reason than performance: without them this
  // middleware 302s each one to /login for any signed-out visitor.
  // A service worker script that answers with the login page's HTML
  // fails registration outright on MIME type, and a manifest that 302s
  // means the browser never sees a valid manifest and the app is never
  // offered for install — which is most visible precisely where it
  // matters, on the logged-out landing page. None of these four carry
  // user data, so serving them unauthenticated changes no boundary:
  // proxy.ts still guards every real route, and Supabase RLS remains
  // the actual enforcement layer.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
