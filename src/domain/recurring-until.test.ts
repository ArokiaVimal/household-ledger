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

describe("bills every N months, varying amounts and rent increases", () => {
  it("a two-monthly bill is due every second month from its first bill, and not due in between", () => {
    const eb = item({ id: "eb", everyMonths: 2, startMonth: "2026-09" });
    const st = (m: string) => recurringStatuses([eb], [], m, "2026-12-31")[0];
    expect(st("2026-09").state).toBe("overdue");
    expect(st("2026-10")).toMatchObject({ state: "notdue", nextDue: "2026-11" });
    expect(st("2026-11").state).toBe("overdue");
    expect(st("2026-08").state).toBe("notdue"); // before the first bill
    expect(commitmentTotals([eb], "2026-10").monthlyPaise).toBe(0);
    expect(commitmentTotals([eb], "2026-11").monthlyPaise).toBe(1000000);
    expect(commitmentTotals([eb], "2026-11").yearlyPaise).toBe(1000000 * 6);
  });
  it("a varying bill expects about the last bill", () => {
    const gas = item({ id: "emi", amountVaries: true, expectedPaise: 80000 });
    const last = { ...rec("2026-08-05"), amountPaise: 123400 };
    expect(recurringStatuses([gas], [last], "2026-09", "2026-09-01")[0]).toMatchObject({ expectedPaise: 123400, estimated: true });
    expect(recurringStatuses([gas], [], "2026-09", "2026-09-01")[0]).toMatchObject({ expectedPaise: 80000, estimated: false });
  });
  it("a rent increase applies from its month and leaves earlier months alone", () => {
    const rent = item({ id: "rent", expectedPaise: 2500000, changes: [{ from: "2026-11", paise: 2700000 }] });
    expect(recurringStatuses([rent], [], "2026-10", "2026-10-01")[0].expectedPaise).toBe(2500000);
    expect(recurringStatuses([rent], [], "2026-12", "2026-10-01")[0].expectedPaise).toBe(2700000);
    expect(commitmentTotals([rent], "2026-10").yearlyPaise).toBe(2500000 * 1 + 2700000 * 11);
  });
});
