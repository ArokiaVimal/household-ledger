import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode } from "@/lib/auth/config";
import { participantIdFor } from "@/lib/data/load";
import { createFirestoreCaptureStore } from "@/lib/capture/firestore-store";
import { captureMessage } from "@/lib/capture/service";
import { DAILY_LIMIT, MAX_MESSAGE_CHARS } from "@/lib/capture/types";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { trackedClaude, trackedSuggest } from "@/lib/ai-usage/server";
import { claudeFromEnv } from "@/lib/import/ai-extract";

export const maxDuration = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const gone = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

/**
 * The private capture link. A phone automation (an iPhone Shortcut, or an Android SMS forwarder) POSTs each bank message here:
 * JSON `{ "text": "..." }` or the message as the plain body. The secret in the URL is the only credential, so it is
 * stored hashed, capped per day and revocable. Messages go to the review queue; nothing counts until you approve it.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (getAuthMode(process.env) === "off") return gone();
  const { token } = await ctx.params;
  if (!/^cap_[A-Za-z0-9_-]{20,64}$/.test(token)) return gone();
  if (Number(req.headers.get("content-length") ?? 0) > 16_000) return NextResponse.json({ ok: false, error: "Message too large" }, { status: 413 });

  let text = "";
  try {
    const raw = await req.text();
    if ((req.headers.get("content-type") ?? "").includes("json")) { const j = JSON.parse(raw) as { text?: unknown; message?: unknown; body?: unknown }; text = String(j.text ?? j.message ?? j.body ?? ""); }
    else text = raw;
  } catch { return NextResponse.json({ ok: false, error: "Could not read the message" }, { status: 400 }); }
  text = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });

  try {
    const store = createFirestoreCaptureStore();
    const hash = sha256(token);
    const rec = await store.get(hash);
    if (!rec) return gone();
    const membership = await getMembership(createFirestoreHouseholdStore(), rec.uid);
    if (!membership || membership.household.id !== rec.householdId) { await store.remove(hash); return gone(); }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const count = rec.day === today ? (rec.count ?? 0) : 0;
    if (count >= DAILY_LIMIT) return NextResponse.json({ ok: false, error: "Daily limit reached" }, { status: 429 });
    await store.put(hash, { ...rec, day: today, count: count + 1, lastUsedAt: new Date().toISOString() });

    const repo = createFirestoreRepository(rec.householdId);
    const out = await captureMessage(repo, { uid: rec.uid, participantId: participantIdFor(rec.uid), defaultAccountId: rec.defaultAccountId }, text, {
      sha256, now: () => Date.now(), newId: () => randomUUID(), suggest: trackedSuggest(process.env, rec.uid, "messages"), claude: trackedClaude(claudeFromEnv(process.env), rec.uid, "messages"), today,
    });
    return NextResponse.json({ ok: true, result: out.result, message: out.message });
  } catch (e) {
    console.error("capture failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ ok: false, error: "Could not process that message" }, { status: 500 });
  }
}
