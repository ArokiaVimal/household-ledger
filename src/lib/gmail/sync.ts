// Reads recent bank mail and feeds each message through the same pipeline as an SMS (`captureMessage`): parsed, duplicates
// skipped, added to the review queue as unreviewed; card-due mail creates the bill. Only mail from bank senders is fetched
// or read. Safe to run often: repeated mail is recognised as already captured.
import type { Repository } from "@/data/repository";
import { captureMessage, type CaptureDeps } from "@/lib/capture/service";
import { accessToken, getMessage, GmailAuthError, listIds, type OAuthConfig } from "./client";
import { decrypt } from "./crypto";
import { buildQuery, extractText, header, messageText, senderAllowed } from "./mail";
import type { GmailLink } from "./store";

export const MAX_PER_SYNC = 40;
const FIRST_SYNC_DAYS = 14;
type F = typeof fetch;
export type SyncCounts = NonNullable<GmailLink["lastResult"]>;

export async function syncGmail(a: { link: GmailLink; key: Buffer; oauth: OAuthConfig; repo: Repository; deps: CaptureDeps; participantId: string; fetchImpl?: F; now: number }): Promise<{ link: GmailLink; counts: SyncCounts }> {
  const counts: SyncCounts = { scanned: 0, added: 0, bills: 0, duplicates: 0, skipped: 0, unreadable: 0 };
  const f = a.fetchImpl ?? fetch;
  try {
    const token = await accessToken(a.oauth, decrypt(a.link.refreshTokenEnc, a.key), f);
    // A little overlap with the last sync: anything already captured is recognised and skipped.
    const since = a.link.lastSyncAt ? Date.parse(a.link.lastSyncAt) / 1000 - 3600 : a.now / 1000 - FIRST_SYNC_DAYS * 86400;
    const ids = await listIds(token, buildQuery(since), MAX_PER_SYNC, f);
    for (const id of ids) {
      const msg = await getMessage(token, id, f);
      if (!senderAllowed(header(msg.payload, "From"))) { counts.skipped++; continue; }
      counts.scanned++;
      const out = await captureMessage(a.repo, { uid: a.link.uid, participantId: a.participantId, defaultAccountId: a.link.defaultAccountId }, messageText(header(msg.payload, "Subject"), extractText(msg.payload)), a.deps);
      if (out.result === "added") counts.added++; else if (out.result === "bill") counts.bills++; else if (out.result === "duplicate") counts.duplicates++; else if (out.result === "unreadable") counts.unreadable++; else counts.skipped++;
    }
    return { link: { ...a.link, lastSyncAt: new Date(a.now).toISOString(), lastResult: counts, needsReconnect: false }, counts };
  } catch (e) {
    if (e instanceof GmailAuthError) return { link: { ...a.link, needsReconnect: true }, counts };
    throw e;
  }
}
