import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { participantIdFor } from "@/lib/data/load";
import { createFirestoreCaptureStore } from "@/lib/capture/firestore-store";
import { captureMessage } from "@/lib/capture/service";
import { MAX_MESSAGE_CHARS } from "@/lib/capture/types";
import { trackedClaude, trackedSuggest } from "@/lib/ai-usage/server";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { authorize } from "../import/shared";

export const maxDuration = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("create"), defaultAccountId: z.string().min(1).max(128) }),
  z.object({ action: z.literal("setDefault"), defaultAccountId: z.string().min(1).max(128) }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("try"), text: z.string().min(1).max(MAX_MESSAGE_CHARS) }),
]);

/** Set up, change, switch off and test the private capture link. Needs your signed-in session; the link itself is shown only when created. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const a = parsed.data;
  const store = createFirestoreCaptureStore();
  const uid = who.session.uid;
  const householdId = who.membership.household.id;
  const repo = createFirestoreRepository(householdId);
  try {
    const mine = await store.listByUser(uid);
    const accountOk = async (id: string) => { const acc = await repo.accounts.get(id); return !!acc && acc.type !== "cash"; };
    switch (a.action) {
      case "status": {
        const t = mine[0]?.token;
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return NextResponse.json({ ok: true, active: !!t, defaultAccountId: t?.defaultAccountId ?? null, createdAt: t?.createdAt ?? null, lastUsedAt: t?.lastUsedAt ?? null, today: t && t.day === today ? t.count ?? 0 : 0 });
      }
      case "create": {
        if (!(await accountOk(a.defaultAccountId))) return NextResponse.json({ error: "Pick one of your payment methods." }, { status: 400 });
        for (const m of mine) await store.remove(m.hash); // one link at a time: creating a new one switches the old one off
        const token = `cap_${randomBytes(24).toString("base64url")}`;
        await store.put(sha256(token), { uid, householdId, defaultAccountId: a.defaultAccountId, createdAt: new Date().toISOString() });
        const h = await headers();
        const host = h.get("host") ?? "";
        const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
        return NextResponse.json({ ok: true, url: `${proto}://${host}/api/capture/${token}` });
      }
      case "setDefault": {
        if (!mine[0]) return NextResponse.json({ error: "Capture is not set up." }, { status: 400 });
        if (!(await accountOk(a.defaultAccountId))) return NextResponse.json({ error: "Pick one of your payment methods." }, { status: 400 });
        await store.put(mine[0].hash, { ...mine[0].token, defaultAccountId: a.defaultAccountId });
        return NextResponse.json({ ok: true });
      }
      case "revoke": {
        for (const m of mine) await store.remove(m.hash);
        return NextResponse.json({ ok: true });
      }
      case "try": {
        const accounts = await repo.accounts.list();
        const fallback = mine[0]?.token.defaultAccountId ?? accounts.find((x) => x.type !== "cash")?.id ?? "";
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const out = await captureMessage(repo, { uid, participantId: participantIdFor(uid), defaultAccountId: fallback }, a.text, {
          sha256, now: () => Date.now(), newId: () => randomUUID(), suggest: trackedSuggest(process.env, uid, "messages"), claude: trackedClaude(claudeFromEnv(process.env), uid, "messages"), today,
        }, { dryRun: true });
        return NextResponse.json({ ok: true, ...out });
      }
    }
  } catch (e) {
    console.error("capture setup failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
