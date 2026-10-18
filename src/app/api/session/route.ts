import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getAuthMode, isAllowedEmail, isRecentSignIn, isSameOrigin } from "@/lib/auth/config";
import { getAdminAuth } from "@/lib/firebase/admin";

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
    if (!isRecentSignIn(decoded.auth_time) || !isAllowedEmail(decoded.email, process.env.ALLOWED_EMAILS ?? "")) return FAIL;
    const cookie = await auth.createSessionCookie(parsed.data.idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
    (await cookies()).set(SESSION_COOKIE, cookie, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
    });
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
