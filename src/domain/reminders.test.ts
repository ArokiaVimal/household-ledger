import { describe, expect, it } from "vitest";
import { cardViews } from "./cardbills";
import { billReminder } from "./reminders";
import type { Account, CardBill } from "./types";

const cards: Account[] = [{ id: "a", name: "Amex Platinum Travel", type: "credit_card" }, { id: "h", name: "HDFC BizGrow Card", type: "credit_card" }];
const bill = (o: Partial<CardBill>): CardBill => ({ id: "b", accountId: "a", statementDate: "2026-10-02", dueDate: "2026-10-20", totalDuePaise: 4751381, source: "manual", ...o });
const views = (bills: CardBill[], today: string) => cardViews(cards, bills, [], today);

describe("billReminder", () => {
  it("reminds about a bill due within 3 days", () => {
    const r = billReminder(views([bill({})], "2026-10-18"));
    expect(r?.title).toBe("Card bill due soon");
    expect(r?.lines).toEqual(["Amex Platinum Travel ₹47,513.81 due in 2 days"]);
  });
  it("stays quiet when it is far off, paid, or long overdue", () => {
    expect(billReminder(views([bill({})], "2026-10-10"))).toBeNull();
    expect(billReminder(views([bill({ paid: true })], "2026-10-19"))).toBeNull();
    expect(billReminder(views([bill({})], "2026-11-05"))).toBeNull();
  });
  it("says overdue, and groups several bills into one message", () => {
    const r = billReminder(views([bill({}), bill({ id: "c", accountId: "h", dueDate: "2026-10-19", totalDuePaise: 100000 })], "2026-10-20"));
    expect(r?.title).toBe("2 card bills need attention");
    expect(r?.lines).toHaveLength(2);
    expect(billReminder(views([bill({ dueDate: "2026-10-15" })], "2026-10-18"))?.title).toBe("Card bill overdue");
  });
});
