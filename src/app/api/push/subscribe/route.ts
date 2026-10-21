import { NextResponse } from "next/server";
import { putSub, removeSub } from "@/lib/push/store";
import { vapidFromEnv } from "@/lib/push/server";
import { authorize } from "../../import/shared";

/** Is push set up on this server, and what is the public key the browser needs? (The public key is not a secret.) */
export async function GET() {
  const who = await authorize();
  if (!who.ok) return who.res;
  const cfg = vapidFromEnv(process.env);
  return NextResponse.json({ enabled: !!cfg, publicKey: cfg?.publicKey ?? null });
}

/** Saves this device's push address for the signed-in person, so the daily job can reach it. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (!vapidFromEnv(process.env)) return NextResponse.json({ error: "Reminders are not set up on this server yet." }, { status: 400 });
  let b: { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const s = b.subscription;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "", auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  if (!/^https:\/\/[^\s]{10,500}$/.test(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return NextResponse.json({ error: "That device cannot get reminders." }, { status: 400 });
  await putSub({ uid: who.session.uid, householdId: who.membership.household.id, endpoint, keys: { p256dh, auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  let b: { endpoint?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  if (typeof b.endpoint === "string") await removeSub(b.endpoint, who.session.uid);
  return NextResponse.json({ ok: true });
}
