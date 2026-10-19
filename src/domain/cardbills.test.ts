import { describe, expect, it } from "vitest";
import { billStatus, cardViews, dueLabel, upcomingBills } from "./cardbills";
import type { Account, CardBill, ExpenseRecord } from "./types";

const bill = (o: Partial<CardBill> = {}): CardBill => ({ id: "b1", accountId: "cc", statementDate: "2026-09-15", dueDate: "2026-10-05", totalDuePaise: 1_000_000, source: "manual", ...o });
const pay = (id: string, o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date: "2026-09-30", merchant: "Card payment", originalDescription: "x", amountPaise: 400_000, currency: "INR", accountId: "bank", categoryId: "transfers", kind: "cc_payment", payerId: "me",
  shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "m", paidCardId: "cc", ...o,
});

describe("billStatus", () => {
  it("is due with the full amount before anything is paid, never the minimum", () => {
    const s = billStatus(bill(), [], "2026-09-28");
    expect(s).toMatchObject({ state: "due", paidPaise: 0, remainingPaise: 1_000_000, daysLeft: 7 });
  });
  it("counts bank payments that name the card, as partial until the full amount is covered", () => {
    expect(billStatus(bill(), [pay("p1")], "2026-10-01")).toMatchObject({ state: "partial", paidPaise: 400_000, remainingPaise: 600_000 });
    expect(billStatus(bill(), [pay("p1"), pay("p2", { date: "2026-10-02", amountPaise: 600_000 })], "2026-10-03").state).toBe("paid");
  });
  it("counts the same payment once when it shows on the bank and on the card", () => {
    const s = billStatus(bill(), [pay("p1"), pay("p2", { accountId: "cc", paidCardId: undefined })], "2026-10-01");
    expect(s.paidPaise).toBe(400_000);
  });
  it("ignores payments before the statement date, other cards, unreviewed rows and purchases", () => {
    const s = billStatus(bill(), [pay("a", { date: "2026-09-10" }), pay("b", { paidCardId: "other" }), pay("c", { status: "unreviewed" }), pay("d", { kind: "purchase" })], "2026-10-01");
    expect(s.paidPaise).toBe(0);
  });
  it("is overdue after the due date, and 'mark as paid' wins", () => {
    expect(billStatus(bill(), [], "2026-10-08")).toMatchObject({ state: "overdue", daysLeft: -3 });
    expect(billStatus(bill({ paid: true }), [], "2026-10-08")).toMatchObject({ state: "paid", remainingPaise: 0 });
  });
});

describe("cardViews and upcomingBills", () => {
  const cards: Account[] = [{ id: "cc", name: "HDFC Credit Card", type: "credit_card" }, { id: "cc2", name: "Amex", type: "credit_card" }, { id: "bank", name: "HDFC Bank", type: "bank" }];
  const bills = [bill(), bill({ id: "b0", statementDate: "2026-08-15", dueDate: "2026-09-05" }), bill({ id: "b2", accountId: "cc2", dueDate: "2026-10-02" })];
  it("shows the latest bill per card, earlier ones after, and only credit cards", () => {
    const v = cardViews(cards, bills, [], "2026-09-28");
    expect(v.map((x) => x.card.id)).toEqual(["cc", "cc2"]);
    expect(v[0].current!.bill.id).toBe("b1");
    expect(v[0].earlier.map((x) => x.bill.id)).toEqual(["b0"]);
  });
  it("lists what is still to pay, soonest first", () => {
    expect(upcomingBills(cardViews(cards, bills, [], "2026-09-28")).map((s) => s.bill.id)).toEqual(["b2", "b1"]);
  });
});

describe("dueLabel", () => {
  it("reads naturally", () => {
    expect([0, 1, 5, -1, -3].map(dueLabel)).toEqual(["due today", "due tomorrow", "due in 5 days", "1 day overdue", "3 days overdue"]);
  });
});
