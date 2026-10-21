import { NextResponse } from "next/server";
import { sendBillReminders } from "@/lib/push/send";
import { makeSender, vapidFromEnv, viewsFor } from "@/lib/push/server";
import { listSubs, markSent, removeById } from "@/lib/push/store";

export const maxDuration = 60;

/** Daily bill reminders for everyone who turned them on. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = vapidFromEnv(process.env);
  if (!cfg) return NextResponse.json({ ok: true, skipped: "push not configured" });
  // Today in India, where the bills are due, not UTC.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const result = await sendBillReminders({ list: listSubs, views: (h) => viewsFor(h, today), send: makeSender(cfg), markSent, remove: removeById, today });
  return NextResponse.json({ ok: true, ...result });
}
