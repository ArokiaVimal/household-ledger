// Sends the daily bill reminders. The store, the bill lookup and the sender are passed in so it is tested without a network.
import { billReminder, type Reminder } from "@/domain/reminders";
import type { CardView } from "@/domain/cardbills";
import type { PushSub } from "./store";

export interface SendDeps {
  list: () => Promise<PushSub[]>;
  /** The household's cards with their latest bill, as of today. */
  views: (householdId: string) => Promise<CardView[]>;
  /** Sends one notification. Returns "gone" when the device unsubscribed (HTTP 404/410) so it can be removed. */
  send: (sub: PushSub, r: Reminder) => Promise<"ok" | "gone" | "failed">;
  markSent: (id: string, day: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  today: string;
}
export interface SendResult { sent: number; skipped: number; removed: number; failed: number }

export async function sendBillReminders(d: SendDeps): Promise<SendResult> {
  const out: SendResult = { sent: 0, skipped: 0, removed: 0, failed: 0 };
  const cache = new Map<string, Reminder | null>();
  for (const sub of await d.list()) {
    if (sub.lastSent === d.today) { out.skipped++; continue; }
    if (!cache.has(sub.householdId)) cache.set(sub.householdId, billReminder(await d.views(sub.householdId)));
    const r = cache.get(sub.householdId);
    if (!r) { out.skipped++; continue; }
    const res = await d.send(sub, r);
    if (res === "ok") { await d.markSent(sub.id, d.today); out.sent++; } else if (res === "gone") { await d.remove(sub.id); out.removed++; } else out.failed++;
  }
  return out;
}
