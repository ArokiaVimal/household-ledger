import { describe, expect, it } from "vitest";
import { pairBalances } from "./balances";
import { attribute, summarizeGroup, withMine } from "./groups";
import type { ExpenseRecord, PaymentGroup, SplitConfig } from "./types";

const ME = "me";
const mine: PaymentGroup = { id: "mine", name: "Mine", kind: "mine", memberIds: [], coverMembers: false, includeMe: true };
const wife: PaymentGroup = { id: "g_wife", name: "Wife & Me", kind: "people", memberIds: [ME, "wife"], coverMembers: false, includeMe: true };
const parents: PaymentGroup = { id: "g_parents", name: "Parents", kind: "people", memberIds: ["mom", "dad"], coverMembers: true, includeMe: false };
const groups = [mine, wife, parents];

const rec = (over: Partial<ExpenseRecord> & { split: SplitConfig }): ExpenseRecord => ({
  id: "r1", date: "2026-10-05", merchant: "Dinner", amountPaise: 300000, categoryId: "restaurants", accountId: "cc", kind: "purchase", status: "reviewed", payerId: ME, shared: true, excluded: false,
  originalDescription: "DINNER", currency: "INR", importSource: "t.csv", ...over,
} as ExpenseRecord);
const dinner = rec({ split: { mode: "custom", participantIds: [ME, "wife", "mom", "dad"], values: { [ME]: 100000, wife: 100000, mom: 50000, dad: 50000 } } });

describe("payment groups", () => {
  it("shows one dinner differently in each group, without inflating anything", () => {
    expect(attribute(dinner, mine, groups, ME)).toMatchObject({ allocatedPaise: 200000, myPaise: 100000, onBehalfPaise: 100000, paidPaise: 300000 });
    expect(attribute(dinner, wife, groups, ME)).toMatchObject({ allocatedPaise: 200000 });
    expect(attribute(dinner, parents, groups, ME)).toMatchObject({ allocatedPaise: 100000, onBehalfPaise: 100000 });
    // The groups overlap, but each one counts the transaction exactly once and the ledger amount is untouched.
    expect(summarizeGroup([dinner], mine, groups, ME).allocated).toBe(200000);
    expect(dinner.amountPaise).toBe(300000);
  });
  it("does not count a cover-for-others share in Mine when someone else paid", () => {
    const wifePaid = { ...dinner, payerId: "wife" };
    expect(attribute(wifePaid, mine, groups, ME)).toMatchObject({ allocatedPaise: 100000, onBehalfPaise: 0, paidPaise: 0 });
    expect(attribute(wifePaid, wife, groups, ME)).toMatchObject({ allocatedPaise: 200000 });
  });
  it("leaves out transactions that do not involve the group's people", () => {
    const solo = rec({ id: "r2", shared: false, split: { mode: "personal", participantIds: [ME] }, amountPaise: 45000 });
    expect(attribute(solo, mine, groups, ME)?.allocatedPaise).toBe(45000);
    expect(attribute(solo, wife, groups, ME)).toBeNull();
    expect(attribute(solo, parents, groups, ME)).toBeNull();
  });
  it("refunds subtract, and excluded or transfer records count for nothing", () => {
    const refund = { ...dinner, id: "r3", kind: "refund" as const, amountPaise: 60000, split: { mode: "custom" as const, participantIds: [ME, "wife"], values: { [ME]: 30000, wife: 30000 } } };
    expect(attribute(refund, wife, groups, ME)?.allocatedPaise).toBe(-60000);
    expect(summarizeGroup([dinner, refund], wife, groups, ME)).toMatchObject({ allocated: 140000, refunds: 60000, count: 2 });
    expect(attribute({ ...dinner, excluded: true }, mine, groups, ME)).toBeNull();
    expect(attribute({ ...dinner, kind: "transfer" }, mine, groups, ME)).toBeNull();
  });
  it("can include your own share in a people group when asked", () => {
    const withMe = { ...parents, includeMe: true };
    expect(attribute(dinner, withMe, groups, ME)?.allocatedPaise).toBe(200000);
  });
  it("always offers Mine, first, even when none was saved", () => {
    expect(withMine([]).map((g) => g.name)).toEqual(["Mine"]);
    expect(withMine([{ ...wife, order: 1 }, { ...parents, order: 0 }]).map((g) => g.name)).toEqual(["Mine", "Parents", "Wife & Me"]);
    expect(withMine([{ ...wife, order: 0 }, { ...mine, order: 1 }]).map((g) => g.name)).toEqual(["Wife & Me", "Mine"]);
  });
  it("a gift you paid for your parents counts for them and in Mine (you cover them), and nobody owes you", () => {
    const gift = rec({ split: { mode: "equal", participantIds: ["mom", "dad"], gift: true } });
    expect(attribute(gift, parents, groups, ME)).toMatchObject({ allocatedPaise: 300000, myPaise: 0, onBehalfPaise: 300000, paidPaise: 300000 });
    expect(attribute(gift, mine, groups, ME)).toMatchObject({ allocatedPaise: 300000, onBehalfPaise: 300000 });
    expect(pairBalances([gift], [])).toEqual([]);
    // The same split without the flag is a debt.
    expect(pairBalances([rec({ split: { mode: "equal", participantIds: ["mom", "dad"] } })], []).length).toBe(2);
  });
});
