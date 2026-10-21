import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { participantIdFor } from "@/lib/data/load";
import type { CaptureDeps } from "@/lib/capture/service";
import { trackedClaude, trackedSuggest } from "@/lib/ai-usage/server";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { oauthFromEnv, type OAuthConfig } from "./client";
import { keyFrom } from "./crypto";
import { createFirestoreGmailStore } from "./firestore-store";
import type { GmailLink } from "./store";
import { syncGmail, type SyncCounts } from "./sync";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Where Google sends the person back to. Must be listed as an authorised redirect URI in the Google Cloud OAuth client. */
export function redirectUriFor(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/gmail/callback`;
}

/** The OAuth client and the encryption key, or null when this server has not been set up for Gmail. */
export function gmailConfig(req: Request): { oauth: OAuthConfig; key: Buffer } | null {
  const oauth = oauthFromEnv(process.env, redirectUriFor(req));
  if (!oauth) return null;
  try { return { oauth, key: keyFrom(process.env.GMAIL_TOKEN_KEY) }; } catch { return null; }
}

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Syncs one person's mail and saves the result on their link. */
export async function runSync(link: GmailLink, cfg: { oauth: OAuthConfig; key: Buffer }, lookbackDays?: number): Promise<{ link: GmailLink; counts: SyncCounts }> {
  const deps: CaptureDeps = { sha256, now: () => Date.now(), newId: () => randomUUID(), suggest: trackedSuggest(process.env, link.uid, "messages"), claude: trackedClaude(claudeFromEnv(process.env), link.uid, "messages"), today: todayIst() };
  const out = await syncGmail({ link, key: cfg.key, oauth: cfg.oauth, repo: createFirestoreRepository(link.householdId), deps, participantId: participantIdFor(link.uid), now: Date.now(), ...(lookbackDays ? { lookbackDays } : {}) });
  await createFirestoreGmailStore().put(out.link);
  return out;
}
