import { NextRequest, NextResponse } from "next/server";

import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Protects every page and API route except /login and the auth endpoints
 * themselves. Runs on the Edge runtime, so it only ever imports
 * lib/auth/session.ts (Web Crypto, no Node-only APIs) — never the SQLite
 * user lookup.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|apply|api/auth|api/apply|api/new-hiring/lookup|api/new-hiring/previous-jobs|_next/static|_next/image|favicon.ico|logo-mod.jpg|icon.jpg|qr-section-bg.jpg).*)",
  ],
};
