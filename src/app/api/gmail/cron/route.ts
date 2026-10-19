import { NextResponse } from "next/server";
import { createFirestoreGmailStore } from "@/lib/gmail/firestore-store";
import { gmailConfig, runSync } from "@/lib/gmail/server";

export const maxDuration = 60;

/** Daily sync for everyone with Gmail connected. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = gmailConfig(req);
  if (!cfg) return NextResponse.json({ ok: true, skipped: "gmail not configured" });
  let done = 0, failed = 0;
  for (const link of await createFirestoreGmailStore().list(25)) {
    if (link.needsReconnect) continue;
    try { await runSync(link, cfg); done++; } catch (e) { failed++; console.error("gmail cron sync failed", String((e as Error).message).split("\n")[0].slice(0, 120)); }
  }
  return NextResponse.json({ ok: true, done, failed });
}
