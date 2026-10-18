import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE, getAuthMode, isSignInAllowed } from "./config";

export interface Session {
  uid: string;
  email: string | null;
  /** "off" means prototype mode: no real user, mock data only. */
  mode: "on" | "off";
}

/** Verifies the session cookie with Firebase (including revocation). Null when not signed in. */
export async function getSession(): Promise<Session | null> {
  if (getAuthMode(process.env) === "off") return { uid: "prototype", email: null, mode: "off" };
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(value, true);
    if (!isSignInAllowed({ email: decoded.email, emailVerified: decoded.email_verified, provider: decoded.firebase?.sign_in_provider, allowedCsv: process.env.ALLOWED_EMAILS ?? "" })) return null;
    return { uid: decoded.uid, email: decoded.email ?? null, mode: "on" };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
