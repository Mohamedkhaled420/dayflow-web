import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// Route protection + onboarding gate (Phase 2 / PRD §4.1)
// ------------------------------------------------------------
// - Unauthenticated users are sent to /auth (v0 behavior).
//   EXCEPTION (Phase 6.5): an unauthenticated GET / passes
//   through to the public marketing landing (brand formation).
// - Authenticated users without a completed onboarding survey are
//   sent to /onboarding. Completion = profiles.chronobiology carries
//   `naturalWakeTime`, a key written ONLY by the survey — the
//   initialize_profile trigger's default { chronotype, timezone }
//   never contains it, and Phase 1's backfill kept that shape.
// - Authenticated users who try to re-visit /onboarding (or /auth)
//   after completing it are bounced to the app.
// ============================================================

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");
  const isOnboardingRoute =
    pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if (!user) {
    if (!isAuthRoute) {
      // Phase 6.5: unauthenticated GET / serves the public landing
      // page; every other protected route (and non-GET verbs) still
      // bounce to /auth.
      const isPublicLanding =
        pathname === "/" && request.method === "GET";
      if (!isPublicLanding) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth";
        return NextResponse.redirect(url);
      }
    }
    return response;
  }

  // Authenticated: check onboarding completion (PK lookup, RLS-scoped).
  const { data: profile } = await supabase
    .from("profiles")
    .select("chronobiology")
    .eq("id", user.id)
    .maybeSingle();
  const chrono = profile?.chronobiology;
  const onboarded =
    !!chrono &&
    typeof chrono === "object" &&
    "naturalWakeTime" in (chrono as Record<string, unknown>);

  if (isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = onboarded ? "/" : "/onboarding";
    return NextResponse.redirect(url);
  }

  if (isOnboardingRoute) {
    if (onboarded) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (!onboarded) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // `.*\\..*` excludes every static asset (manifest.json, sw.js,
  // apple-touch-icon.png, icons/*, logo.svg, robots.txt, …) — the
  // browser fetches several of those WITHOUT session cookies (install
  // prompt, service worker script), and a 307 would break both.
  // Next metadata routes carry no extension (opengraph-image,
  // twitter-image) and are fetched by link-preview crawlers with no
  // session at all, so they are excluded explicitly.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*).*)",
  ],
};
