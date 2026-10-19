// The few Gmail and Google OAuth calls we need, with `fetch` injectable so tests never touch the network.
// Scope is read-only. We list only bank-sender mail (see mail.ts) and read one message at a time.
export const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export interface OAuthConfig { clientId: string; clientSecret: string; redirectUri: string }
type F = typeof fetch;

/** Google says the person revoked access or the token expired: they need to connect again. */
export class GmailAuthError extends Error {}

export function oauthFromEnv(env: Record<string, string | undefined>, redirectUri: string): OAuthConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, redirectUri } : null;
}

export function authUrl(cfg: OAuthConfig, state: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenCall(body: Record<string, string>, f: F): Promise<{ access_token?: string; refresh_token?: string; error?: string }> {
  const res = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (!res.ok) { if (data.error === "invalid_grant") throw new GmailAuthError("Google no longer allows this connection."); throw new Error(`Google answered ${res.status}`); }
  return data;
}

/** Trades the one-time code for a long-lived refresh token and finds out which mailbox it is. */
export async function exchangeCode(cfg: OAuthConfig, code: string, f: F = fetch): Promise<{ refreshToken: string; email: string }> {
  const t = await tokenCall({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }, f);
  if (!t.refresh_token || !t.access_token) throw new Error("Google did not return a refresh token. Remove the app from your Google account's connections and try again.");
  const p = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const email = p.ok ? String(((await p.json()) as { emailAddress?: string }).emailAddress ?? "") : "";
  return { refreshToken: t.refresh_token, email };
}

export async function accessToken(cfg: OAuthConfig, refreshToken: string, f: F = fetch): Promise<string> {
  const t = await tokenCall({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }, f);
  if (!t.access_token) throw new Error("Google did not return an access token.");
  return t.access_token;
}

async function gmail(token: string, path: string, f: F): Promise<unknown> {
  const res = await f(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401) throw new GmailAuthError("Gmail rejected the connection.");
  if (!res.ok) throw new Error(`Gmail answered ${res.status}`);
  return res.json();
}

export async function listIds(token: string, query: string, max: number, f: F = fetch): Promise<string[]> {
  const data = (await gmail(token, `messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`, f)) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

import type { Part } from "./mail";
export interface GmailMessage { id: string; internalDate?: string; payload?: Part }
export async function getMessage(token: string, id: string, f: F = fetch): Promise<GmailMessage> {
  return (await gmail(token, `messages/${encodeURIComponent(id)}?format=full`, f)) as GmailMessage;
}

/** Best effort: tell Google to forget this connection. */
export async function revoke(refreshToken: string, f: F = fetch): Promise<void> {
  try { await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }); } catch { /* the link is deleted either way */ }
}
