import { describe, expect, it } from "vitest";
import { personLedger, settlementFor } from "./ledger";
import type { ExpenseRecord, Settlement } from "./types";

const rec = (id: string, payerId: string, amountPaise: number, who: string[], date = "2026-09-01", over: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date, merchant: id, originalDescription: id, amountPaise, currency: "INR", accountId: "a", categoryId: "food", kind: "purchase", payerId, shared: true,
  split: { mode: "equal", participantIds: who }, excluded: false, status: "reviewed", importSource: "m", ...over,
});
const settle = (id: string, fromId: string, toId: string, amountPaise: number, recordIds?: string[], voided?: boolean): Settlement => ({ id, date: "2026-09-10", fromId, toId, amountPaise, recordIds, voided });

describe("personLedger", () => {
  const records = [rec("r1", "me", 100000, ["me", "v"]), rec("r2", "v", 40000, ["me", "v"]), rec("r3", "me", 30000, ["me", "k"]), rec("solo", "me", 9999, ["me"])];
  it("lists only payments with that person; + they owe you, - you owe them", () => {
    const l = personLedger("v", "me", records, []);
    expect(l.open.map((e) => [e.record.id, e.sharePaise])).toEqual([["r1", 50000], ["r2", -20000]]);
    expect(l.outstandingPaise).toBe(30000);
    expect(l.unlinkedPaise).toBe(0);
  });
  it("a settlement that names its payments marks them settled and reduces the balance", () => {
    const l = personLedger("v", "me", records, [settle("s1", "v", "me", 50000, ["r1"])]);
    expect(l.settled.map((e) => e.record.id)).toEqual(["r1"]);
    expect(l.open.map((e) => e.record.id)).toEqual(["r2"]);
    expect(l.outstandingPaise).toBe(-20000); // now you owe them for r2
    expect(l.unlinkedPaise).toBe(0);
  });
  it("a plain-amount settlement shows up as an unlinked part of the balance, and a voided one does not count", () => {
    expect(personLedger("v", "me", records, [settle("s1", "v", "me", 10000)]).unlinkedPaise).toBe(-10000);
    expect(personLedger("v", "me", records, [settle("s1", "v", "me", 10000, undefined, true)]).outstandingPaise).toBe(30000);
  });
  it("refunds reverse the debt, and settlements with someone else never count", () => {
    const withRefund = [...records, rec("rf", "me", 20000, ["me", "v"], "2026-09-02", { kind: "refund" })];
    expect(personLedger("v", "me", withRefund, []).outstandingPaise).toBe(30000 - 10000);
    expect(personLedger("v", "me", records, [settle("s9", "k", "me", 15000)]).outstandingPaise).toBe(30000);
  });
});

describe("settlementFor", () => {
  const records = [rec("r1", "me", 100000, ["me", "v"]), rec("r2", "v", 40000, ["me", "v"])];
  const l = personLedger("v", "me", records, []);
  it("the person who owes pays the net of the chosen payments", () => {
    expect(settlementFor("v", "me", l.open)).toEqual({ fromId: "v", toId: "me", amountPaise: 30000, recordIds: ["r1", "r2"] });
    expect(settlementFor("v", "me", [l.open[1]])).toEqual({ fromId: "me", toId: "v", amountPaise: 20000, recordIds: ["r2"] });
  });
  it("is null when the chosen payments cancel out", () => {
    expect(settlementFor("v", "me", [{ ...l.open[0], sharePaise: 5 }, { ...l.open[1], sharePaise: -5 }])).toBeNull();
  });
});
