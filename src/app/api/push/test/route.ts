import { NextResponse } from "next/server";
import { makeSender, vapidFromEnv } from "@/lib/push/server";
import { removeById, subsFor } from "@/lib/push/store";
import { authorize } from "../../import/shared";

/** Sends a test notification to the signed-in person's own devices. */
export async function POST() {
  const who = await authorize();
  if (!who.ok) return who.res;
  const cfg = vapidFromEnv(process.env);
  if (!cfg) return NextResponse.json({ error: "Reminders are not set up on this server yet." }, { status: 400 });
  const send = makeSender(cfg);
  let sent = 0;
  for (const sub of await subsFor(who.session.uid)) {
    const r = await send(sub, { title: "Reminders are on", body: "You'll hear from us when a card bill is due.", url: "/cards", tag: "test" });
    if (r === "ok") sent++; else if (r === "gone") await removeById(sub.id);
  }
  if (sent === 0) return NextResponse.json({ error: "No device is subscribed. Turn reminders on first." }, { status: 404 });
  return NextResponse.json({ ok: true, sent });
}
