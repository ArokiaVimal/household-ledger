import { describe, expect, it } from "vitest";
import { commitmentTotals, recurringStatuses } from "./recurring";
import type { ExpenseRecord, RecurringItem } from "./types";

const item = (extra: Partial<RecurringItem> = {}): RecurringItem => ({ id: "emi", name: "Car EMI", categoryId: "loans", dueDay: 5, expectedPaise: 1000000, payerId: "me", split: { mode: "personal", participantIds: ["me"] }, ...extra });
const rec = (date: string): ExpenseRecord => ({ id: "r1", date, merchant: "Car EMI", amountPaise: 1000000, categoryId: "loans", accountId: "bank", kind: "purchase", status: "reviewed", payerId: "me", shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, recurringId: "emi", originalDescription: "EMI", currency: "INR", importSource: "t.csv" });

describe("recurring until and marked paid", () => {
  it("shows an item as ended after its last month, and still active in that month", () => {
    const x = item({ until: "2026-12-15" });
    expect(recurringStatuses([x], [], "2026-12", "2026-12-20")[0].state).toBe("overdue");
    expect(recurringStatuses([x], [], "2027-01", "2027-01-20")[0].state).toBe("ended");
  });
  it("counts a hand-marked month as paid, but a linked transaction takes over", () => {
    const x = item({ paidMonths: ["2026-10"] });
    const marked = recurringStatuses([x], [], "2026-10", "2026-10-20")[0];
    expect(marked).toMatchObject({ state: "paid", marked: true, variancePaise: 0 });
    expect(recurringStatuses([x], [], "2026-09", "2026-10-20")[0].state).toBe("overdue");
    const linked = recurringStatuses([x], [rec("2026-10-05")], "2026-10", "2026-10-20")[0];
    expect(linked).toMatchObject({ state: "paid", marked: false });
  });
  it("leaves ended items out of the monthly commitment and trims the yearly figure", () => {
    const items = [item(), item({ id: "lease", expectedPaise: 500000, until: "2026-11-30" })];
    expect(commitmentTotals(items, "2026-10").monthlyPaise).toBe(1500000);
    expect(commitmentTotals(items, "2026-10").yearlyPaise).toBe(1000000 * 12 + 500000 * 2);
    expect(commitmentTotals(items, "2026-12").monthlyPaise).toBe(1000000);
  });
});
