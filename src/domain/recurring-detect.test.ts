import { describe, expect, it } from "vitest";
import { detectRecurring, trackedAlerts } from "./recurring-detect";
import type { ExpenseRecord, RecurringItem } from "./types";

let n = 0;
const rec = (date: string, merchant: string, rupees: number, extra: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: `r${++n}`, date, merchant, amountPaise: Math.round(rupees * 100), categoryId: "subscriptions", accountId: "cc", kind: "purchase", status: "reviewed", payerId: "me", shared: false, excluded: false,
  split: { mode: "personal", participantIds: ["me"] }, originalDescription: merchant, currency: "INR", importSource: "t.csv", ...extra,
} as ExpenseRecord);
const TODAY = "2026-10-19";

describe("recurring detection", () => {
  it("finds a monthly subscription, with annual cost, next date and last payment", () => {
    const s = detectRecurring([rec("2026-07-04", "Netflix", 649), rec("2026-08-04", "Netflix", 649), rec("2026-09-04", "Netflix", 649)], [], TODAY);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ merchant: "Netflix", cadence: "monthly", fixed: true, amountPaise: 64900, lastDate: "2026-09-04", nextExpected: "2026-10-04", annualPaise: 64900 * 12, occurrences: 3, confidence: "medium", dueDay: 4 });
  });
  it("needs a real pattern: too few payments, irregular dates and tiny charges are ignored", () => {
    expect(detectRecurring([rec("2026-08-04", "A", 500), rec("2026-09-04", "A", 500)], [], TODAY)).toEqual([]);
    expect(detectRecurring([rec("2026-06-04", "B", 500), rec("2026-08-20", "B", 500), rec("2026-09-02", "B", 500)], [], TODAY)).toEqual([]);
    expect(detectRecurring([rec("2026-07-04", "Chai", 10), rec("2026-08-04", "Chai", 10), rec("2026-09-04", "Chai", 10)], [], TODAY)).toEqual([]);
  });
  it("recognises a bill every two months and a yearly one with two payments", () => {
    const eb = detectRecurring([rec("2026-03-10", "TNEB", 1800), rec("2026-05-10", "TNEB", 2100), rec("2026-07-10", "TNEB", 1950)], [], TODAY);
    expect(eb[0]).toMatchObject({ cadence: "bimonthly", fixed: false, nextExpected: "2026-09-10" });
    const yr = detectRecurring([rec("2025-09-15", "Amazon Prime", 1499), rec("2026-09-15", "Amazon Prime", 1499)], [], TODAY);
    expect(yr[0]).toMatchObject({ cadence: "yearly", annualPaise: 149900, nextExpected: "2027-09-15" });
  });
  it("flags a price increase, a missing payment and a duplicate charge", () => {
    const up = detectRecurring([rec("2026-07-04", "Spotify", 119), rec("2026-08-04", "Spotify", 119), rec("2026-09-04", "Spotify", 149)], [], "2026-09-20");
    expect(up[0].flags).toContain("price_up");
    expect(up[0].priceChange).toEqual({ fromPaise: 11900, toPaise: 14900 });
    const missing = detectRecurring([rec("2026-06-02", "Hotstar", 299), rec("2026-07-02", "Hotstar", 299), rec("2026-08-02", "Hotstar", 299)], [], TODAY);
    expect(missing[0].flags).toContain("missing");
    const dup = detectRecurring([rec("2026-07-04", "Gym", 1500), rec("2026-08-04", "Gym", 1500), rec("2026-09-04", "Gym", 1500), rec("2026-09-05", "Gym", 1500)], [], "2026-09-20");
    expect(dup[0].flags).toContain("duplicate");
    expect(dup[0].occurrences).toBe(3);
  });
  it("leaves out what is tracked, linked, dismissed, excluded or not reviewed", () => {
    const rows = [rec("2026-07-04", "Netflix", 649), rec("2026-08-04", "Netflix", 649), rec("2026-09-04", "Netflix", 649)];
    const item = { id: "i", name: "Netflix", categoryId: "subscriptions", dueDay: 4, expectedPaise: 64900, payerId: "me", split: { mode: "personal", participantIds: ["me"] } } as RecurringItem;
    expect(detectRecurring(rows, [item], TODAY)).toEqual([]);
    expect(detectRecurring(rows.map((r) => ({ ...r, recurringId: "i" })), [], TODAY)).toEqual([]);
    expect(detectRecurring(rows, [], TODAY, new Set(["netflix|monthly"]))).toEqual([]);
    expect(detectRecurring(rows.map((r) => ({ ...r, status: "unreviewed" as const })), [], TODAY)).toEqual([]);
    expect(detectRecurring(rows.map((r) => ({ ...r, excluded: true })), [], TODAY)).toEqual([]);
    expect(detectRecurring(rows.map((r) => ({ ...r, kind: "transfer" as const })), [], TODAY)).toEqual([]);
  });
  it("alerts on tracked items: price up, duplicate in a month, and overdue", () => {
    const item = { id: "i", name: "Rent", categoryId: "rent", dueDay: 1, expectedPaise: 2500000, payerId: "me", split: { mode: "personal", participantIds: ["me"] } } as RecurringItem;
    const rows = [rec("2026-10-01", "Rent", 27000, { recurringId: "i" }), rec("2026-10-02", "Rent", 27000, { recurringId: "i" })];
    const alerts = trackedAlerts([item], rows, "2026-10", TODAY, () => "overdue");
    expect(alerts.map((a) => a.flag).sort()).toEqual(["duplicate", "missing", "price_up"]);
    expect(trackedAlerts([item], [], "2026-10", TODAY, () => "paid")).toEqual([]);
  });
});
