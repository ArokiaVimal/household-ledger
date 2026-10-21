import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";
import type { Account, CardBill, ExpenseRecord, RecurringItem } from "./types";

let n = 0;
const rec = (date: string, merchant: string, rupees: number, extra: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: `r${++n}`, date, merchant, amountPaise: Math.round(rupees * 100), categoryId: "x", accountId: "bank", kind: "purchase", status: "reviewed", payerId: "me", shared: false, excluded: false,
  split: { mode: "personal", participantIds: ["me"] }, originalDescription: merchant, currency: "INR", importSource: "t.csv", ...extra,
} as ExpenseRecord);
const bank = (balance?: { amountPaise: number; asOf: string }): Account => ({ id: "bank", name: "HDFC Bank", type: "bank", ...(balance ? { balance } : {}) });
const card: Account = { id: "cc", name: "Amex", type: "credit_card" };
const item = (extra: Partial<RecurringItem>): RecurringItem => ({ id: "i", name: "Rent", categoryId: "rent", dueDay: 28, expectedPaise: 2500000, payerId: "me", split: { mode: "personal", participantIds: ["me"] }, ...extra } as RecurringItem);
const bill = (due: string, rupees: number): CardBill => ({ id: "b1", accountId: "cc", statementDate: "2026-09-25", dueDate: due, totalDuePaise: rupees * 100, source: "manual" });
const base = { month: "2026-10", today: "2026-10-19", records: [] as ExpenseRecord[], accounts: [bank({ amountPaise: 5_000_000, asOf: "2026-10-19" }), card], cardBills: [] as CardBill[], recurringItems: [] as RecurringItem[], accountName: (id: string) => (id === "cc" ? "Amex" : "HDFC Bank") };

describe("money timeline", () => {
  it("without a recorded balance it shows flows only and says so", () => {
    const t = buildTimeline({ ...base, accounts: [bank(), card], records: [rec("2026-10-02", "Salary", 185000, { kind: "income" })] });
    expect(t.recorded).toBeNull();
    expect(t.estimatedTodayPaise).toBeNull();
    expect(t.forecastEndPaise).toBeNull();
    expect(t.confidence.level).toBe("none");
    expect(t.warnings.map((w) => w.kind)).toContain("no_balance");
    expect(t.events[0]).toMatchObject({ kind: "actual", type: "income", amountPaise: 18500000 });
  });
  it("forecasts from the recorded balance using only entered items, and marks them expected", () => {
    const t = buildTimeline({ ...base, cardBills: [bill("2026-10-25", 18420)], recurringItems: [item({}), item({ id: "s", name: "Salary", direction: "in", dueDay: 30, expectedPaise: 18500000 })] });
    const expected = t.events.filter((e) => e.kind === "expected");
    expect(expected.map((e) => [e.label, e.amountPaise])).toEqual([["Amex bill", -1842000], ["Rent", -2500000], ["Salary", 18500000]]);
    expect(expected.map((e) => e.balanceAfterPaise)).toEqual([3158000, 658000, 19158000]);
    expect(t.forecastEndPaise).toBe(19158000);
    expect(t.recorded?.totalPaise).toBe(5000000);
    expect(t.confidence.level).toBe("high");
  });
  it("applies confirmed bank transactions since the balance date, but not transfers (and says so)", () => {
    const t = buildTimeline({ ...base, accounts: [bank({ amountPaise: 1_000_000, asOf: "2026-10-10" }), card], records: [rec("2026-10-10", "Same day", 500), rec("2026-10-12", "Groceries", 2000), rec("2026-10-14", "Interest", 100, { kind: "income" }), rec("2026-10-15", "To Varru", 5000, { kind: "transfer" })] });
    expect(t.estimatedTodayPaise).toBe(1_000_000 - 200_000 + 10_000);
    expect(t.confidence.level).toBe("medium");
    expect(t.confidence.reasons.join(" ")).toMatch(/transfer/);
  });
  it("warns about a bill due soon or overdue, and about running out of money", () => {
    const soon = buildTimeline({ ...base, cardBills: [bill("2026-10-21", 9300)] });
    expect(soon.warnings.find((w) => w.kind === "bill_soon")?.text).toMatch(/in 2 days/);
    const late = buildTimeline({ ...base, cardBills: [bill("2026-10-17", 9300)] });
    expect(late.warnings.find((w) => w.kind === "bill_overdue")?.text).toMatch(/2 days overdue/);
    expect(late.events.find((e) => e.type === "card_bill")).toMatchObject({ overdue: true, date: "2026-10-19" });
    const broke = buildTimeline({ ...base, accounts: [bank({ amountPaise: 100_000, asOf: "2026-10-19" }), card], recurringItems: [item({})] });
    expect(broke.lowest).toMatchObject({ date: "2026-10-28", amountPaise: -2400000 });
    expect(broke.warnings.map((w) => w.kind)).toContain("negative");
  });
  it("lowers confidence for an old balance, an estimated bill and no expected income", () => {
    const old = buildTimeline({ ...base, accounts: [bank({ amountPaise: 5_000_000, asOf: "2026-08-01" }), card], recurringItems: [item({ amountVaries: true })] });
    expect(old.confidence.level).toBe("low");
    expect(old.confidence.reasons.join(" ")).toMatch(/days old/);
    expect(old.warnings.map((w) => w.kind)).toContain("stale_balance");
  });
  it("a past month has actual events only; a paid or ended item is not expected; a future month carries earlier items forward", () => {
    const past = buildTimeline({ ...base, month: "2026-09", records: [rec("2026-09-05", "EMI", 18500)], recurringItems: [item({})] });
    expect(past.events.every((e) => e.kind === "actual")).toBe(true);
    expect(past.forecastEndPaise).toBeNull();
    const paid = buildTimeline({ ...base, records: [rec("2026-10-03", "Rent", 25000, { recurringId: "i" })], recurringItems: [item({})] });
    expect(paid.events.filter((e) => e.kind === "expected")).toEqual([]);
    const ended = buildTimeline({ ...base, recurringItems: [item({ until: "2026-09" })] });
    expect(ended.events.filter((e) => e.kind === "expected")).toEqual([]);
    const next = buildTimeline({ ...base, month: "2026-11", recurringItems: [item({})] });
    expect(next.events.filter((e) => e.kind === "expected").map((e) => e.date)).toEqual(["2026-11-28"]);
    expect(next.forecastEndPaise).toBe(5_000_000 - 2_500_000 - 2_500_000); // October's rent is still unpaid and counted too
  });
});

describe("timeline with unverified rows", () => {
  it("lists them as flagged events, and they move the estimated balance", () => {
    const acc = { id: "bank", name: "Bank", type: "bank" as const, balance: { amountPaise: 100_000, asOf: "2026-09-01" } };
    const spend = rec("2026-09-10", "Cafe", 100, { status: "unreviewed" });
    const t = buildTimeline({ month: "2026-09", today: "2026-09-20", records: [spend], accounts: [acc], cardBills: [], recurringItems: [], accountName: (id: string) => id });
    expect(t.events.find((e) => e.label === "Cafe")?.unverified).toBe(true);
    expect(t.estimatedTodayPaise).toBe(90_000);
  });
});
