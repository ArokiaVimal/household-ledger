import { NextResponse } from "next/server";
import { z } from "zod";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { revoke } from "@/lib/gmail/client";
import { decrypt } from "@/lib/gmail/crypto";
import { createFirestoreGmailStore } from "@/lib/gmail/firestore-store";
import { gmailConfig, runSync } from "@/lib/gmail/server";
import { authorize } from "../import/shared";

export const maxDuration = 60;
const AUTO_EVERY_MS = 6 * 3_600_000;
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("sync"), auto: z.boolean().optional(), days: z.number().int().min(1).max(90).optional() }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("setDefault"), defaultAccountId: z.string().min(1).max(128) }),
]);

/** Gmail connection for the signed-in person: status, sync now (or the quiet automatic sync), change default account, disconnect. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const a = parsed.data;
  const cfg = gmailConfig(req);
  const store = createFirestoreGmailStore();
  const uid = who.session.uid;
  try {
    const link = await store.get(uid);
    switch (a.action) {
      case "status":
        return NextResponse.json({ ok: true, configured: !!cfg, connected: !!link, email: link?.email ?? null, lastSyncAt: link?.lastSyncAt ?? null, lastResult: link?.lastResult ?? null, needsReconnect: !!link?.needsReconnect, defaultAccountId: link?.defaultAccountId ?? null });
      case "sync": {
        if (!cfg || !link) return NextResponse.json({ ok: true, skipped: "not connected" });
        if (link.needsReconnect) return NextResponse.json({ ok: true, skipped: "needs reconnect", needsReconnect: true });
        // The quiet sync when the app opens runs at most every few hours; "Sync now" always runs.
        if (a.auto && link.lastSyncAt && Date.now() - Date.parse(link.lastSyncAt) < AUTO_EVERY_MS) return NextResponse.json({ ok: true, skipped: "recent" });
        const out = await runSync(link, cfg, a.days);
        return NextResponse.json({ ok: true, counts: out.counts, needsReconnect: !!out.link.needsReconnect });
      }
      case "setDefault": {
        if (!link) return NextResponse.json({ error: "Gmail is not connected." }, { status: 400 });
        const acc = await createFirestoreRepository(link.householdId).accounts.get(a.defaultAccountId);
        if (!acc || acc.type === "cash") return NextResponse.json({ error: "Pick one of your payment methods." }, { status: 400 });
        await store.put({ ...link, defaultAccountId: a.defaultAccountId });
        return NextResponse.json({ ok: true });
      }
      case "disconnect": {
        if (link && cfg) { try { await revoke(decrypt(link.refreshTokenEnc, cfg.key)); } catch { /* removed below either way */ } }
        await store.remove(uid);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) {
    console.error("gmail action failed", String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not reach Gmail. Try again." }, { status: 502 });
  }
}
