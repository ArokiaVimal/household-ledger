import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getAuthMode, isRecentSignIn, isSignInAllowed, isSameOrigin } from "@/lib/auth/config";
import { getAdminAuth } from "@/lib/firebase/admin";
import { refreshForAccount } from "@/lib/links/service";
import { createLinkDeps } from "@/lib/links/server";

const body = z.object({ idToken: z.string().min(20).max(4096) });
const FAIL = NextResponse.json({ error: "Sign-in failed" }, { status: 401 }); // one generic message on purpose

/** Exchange a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(parsed.data.idToken, true);
    const allowed = isSignInAllowed({ email: decoded.email, emailVerified: decoded.email_verified, provider: decoded.firebase?.sign_in_provider, allowedCsv: process.env.ALLOWED_EMAILS ?? "" });
    if (!isRecentSignIn(decoded.auth_time) || !allowed) return FAIL;
    const cookie = await auth.createSessionCookie(parsed.data.idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
    (await cookies()).set(SESSION_COOKIE, cookie, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
    });
    // Does anyone already have this (verified) email saved as a contact? Only stores a proposal for THEM to confirm; never blocks sign-in.
    await refreshForAccount(createLinkDeps(), { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified === true }).catch((e) => console.error("link check failed", (e as { code?: string }).code));
    return NextResponse.json({ ok: true });
  } catch {
    return FAIL;
  }
}

export async function DELETE() {
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
