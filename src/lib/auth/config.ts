// Pure auth policy, testable without Firebase.
import { EnvError, parseClientEnv, parseServerEnv } from "@/lib/env";

type Env = Record<string, string | undefined>;
export type AuthMode = "off" | "on";

const CLIENT_KEYS = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_APP_ID"];
const SERVER_KEYS = ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY", "ALLOWED_EMAILS"];

/**
 * "off" = prototype with mock data only (no Firebase configured, not production).
 * "on"  = Firebase fully configured. Anything in between, or production without
 * Firebase, throws: the app must fail closed rather than serve data unauthenticated.
 */
export function getAuthMode(env: Env): AuthMode {
  const any = [...CLIENT_KEYS, ...SERVER_KEYS].some((k) => !!env[k]);
  if (!any) {
    // Vercel sets VERCEL_ENV itself, so a mis-set APP_ENV cannot silently turn a live deployment into an open demo.
    if (env.APP_ENV === "production" || env.VERCEL_ENV === "production") throw new EnvError("Authentication must be configured in production (see .env.example).");
    return "off";
  }
  parseClientEnv(env);
  parseServerEnv(env);
  return "on";
}

export function isAllowedEmail(email: string | undefined | null, allowedCsv: string): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return allowedCsv.split(",").some((a) => a.trim().toLowerCase() === e);
}

/**
 * Who may get a session. The email must be on the allowlist, and the sign-in must come from a
 * provider we expect: Google (email must be verified by Google) or email/password. Anything else
 * (anonymous, custom tokens, other providers) is refused.
 */
export function isSignInAllowed(p: { email?: string | null; emailVerified?: boolean; provider?: string; allowedCsv: string }): boolean {
  if (!isAllowedEmail(p.email, p.allowedCsv)) return false;
  if (p.provider === "google.com") return p.emailVerified === true;
  return p.provider === "password";
}

/** CSRF guard for the session route: the request must come from this site. */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Sign-in must be fresh: a stolen old ID token cannot mint a session. */
export function isRecentSignIn(authTimeSeconds: number, nowMs = Date.now(), maxAgeSeconds = 300): boolean {
  return nowMs / 1000 - authTimeSeconds <= maxAgeSeconds;
}

export const SESSION_COOKIE = "ledger_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;
