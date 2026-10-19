import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthMode } from "@/lib/auth/config";

/**
 * First gate: no session cookie means redirect to /login. This is only a fast
 * check; the (app) layout verifies the cookie with Firebase on the server, and
 * Firestore/Storage rules are the real authorization boundary.
 */
export function proxy(req: NextRequest) {
  if (getAuthMode(process.env) === "off") return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/session|api/capture/|api/gmail/cron|_next/static|_next/image|icon[^/]*|apple-icon[^/]*|robots.txt|logos/|manifest.webmanifest).*)"],
};
