import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism, new name/export). Two jobs: keep the Supabase auth session
// cookie fresh (see lib/supabase/middleware.ts), and require a signed-in
// session for every route except the public auth ones below — this app has
// no guest/read-only mode, every page holds a specific user's account data.
const PUBLIC_PATH_PREFIXES = ["/login", "/signup"];
// Signed-in visitors have no reason to be here — bounce them to the
// dashboard instead of showing a login/signup form for an account they're
// already in.
const AUTH_ENTRY_PATH_PREFIXES = ["/login", "/signup"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (user && matchesPrefix(pathname, AUTH_ENTRY_PATH_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!user && !matchesPrefix(pathname, PUBLIC_PATH_PREFIXES)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next's own internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
