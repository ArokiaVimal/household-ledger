import { describe, expect, it } from "vitest";
import { cardViews } from "@/domain/cardbills";
import type { Account, CardBill } from "@/domain/types";
import { sendBillReminders } from "./send";
import type { PushSub } from "./store";

const cards: Account[] = [{ id: "a", name: "Amex Platinum Travel", type: "credit_card" }];
const bills: CardBill[] = [{ id: "b", accountId: "a", statementDate: "2026-10-02", dueDate: "2026-10-20", totalDuePaise: 100000, source: "manual" }];
const sub = (id: string, o: Partial<PushSub> = {}): PushSub => ({ id, uid: "u", householdId: "h1", endpoint: `https://push.example/${id}`, keys: { p256dh: "x", auth: "y" }, createdAt: "2026-10-01", ...o });

function run(subs: PushSub[], outcome: (s: PushSub) => "ok" | "gone" | "failed", today = "2026-10-19") {
  const log = { sent: [] as string[], marked: [] as string[], removed: [] as string[], viewCalls: 0 };
  return sendBillReminders({
    list: async () => subs, views: async () => { log.viewCalls++; return cardViews(cards, bills, [], today); },
    send: async (s) => { const r = outcome(s); if (r === "ok") log.sent.push(s.id); return r; },
    markSent: async (id) => { log.marked.push(id); }, remove: async (id) => { log.removed.push(id); }, today,
  }).then((res) => ({ res, log }));
}

describe("sendBillReminders", () => {
  it("sends one reminder per device, marks the day, and looks up each household once", async () => {
    const { res, log } = await run([sub("1"), sub("2")], () => "ok");
    expect(res).toEqual({ sent: 2, skipped: 0, removed: 0, failed: 0 });
    expect(log.marked).toEqual(["1", "2"]);
    expect(log.viewCalls).toBe(1);
  });
  it("sends at most one a day", async () => {
    const { res, log } = await run([sub("1", { lastSent: "2026-10-19" })], () => "ok");
    expect(res.skipped).toBe(1);
    expect(log.sent).toEqual([]);
  });
  it("removes devices that unsubscribed, and keeps going after a failure", async () => {
    const { res, log } = await run([sub("1"), sub("2"), sub("3")], (s) => (s.id === "1" ? "gone" : s.id === "2" ? "failed" : "ok"));
    expect(res).toEqual({ sent: 1, skipped: 0, removed: 1, failed: 1 });
    expect(log.removed).toEqual(["1"]);
    expect(log.marked).toEqual(["3"]);
  });
  it("sends nothing when no bill needs attention", async () => {
    const { res } = await run([sub("1")], () => "ok", "2026-10-01");
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
  });
});
