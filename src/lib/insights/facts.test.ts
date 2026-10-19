import { describe, expect, it } from "vitest";
import { buildFacts } from "./facts";
import type { Account, CardBill, Category, ExpenseRecord, RecurringItem } from "@/domain/types";

const cats: Category[] = [{ id: "food", name: "Food" }, { id: "fuel", name: "Fuel" }, { id: "uncategorized", name: "Uncategorized" }];
const accounts: Account[] = [{ id: "cc", name: "HDFC Credit Card", type: "credit_card" }];
const rec = (id: string, date: string, rupees: number, categoryId = "food", merchant = "Swiggy", over: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date, merchant, originalDescription: "SECRET BANK TEXT 1234567890", amountPaise: rupees * 100, currency: "INR", accountId: "cc", categoryId, kind: "purchase", payerId: "me", shared: false,
  split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "m", notes: "private note", ...over,
});
const base = { month: "2026-09", today: "2026-09-20", meId: "me", staged: 2, categories: cats, accounts, recurringItems: [] as RecurringItem[], cardBills: [] as CardBill[] };

describe("buildFacts", () => {
  const records = [rec("a", "2026-09-02", 1000), rec("b", "2026-09-05", 3000, "fuel", "Indian Oil"), rec("c", "2026-09-06", 500), rec("d", "2026-08-03", 1000), rec("e", "2026-07-03", 800), rec("f", "2026-09-07", 100, "uncategorized", "A", { kind: "refund" })];
  it("totals the month, ranks categories and merchants, and compares with earlier months", () => {
    const f = buildFacts({ ...base, records });
    expect(f.totals).toMatchObject({ spent: 4400, transactions: 3, waitingForReview: 2 });
    expect(f.categories.map((c) => [c.name, c.amount])).toEqual([["Fuel", 3000], ["Food", 1500]]);
    expect(f.categories.find((c) => c.name === "Food")!.vsEarlierAverage).toBe(67); // 1500 vs the average of 1000 and 800
    expect(f.merchants[0]).toEqual({ name: "Indian Oil", amount: 3000, times: 1 });
    expect(f.earlier.map((e) => e.spent)).toEqual([1000, 800, 0]);
  });
  it("contains no bank text or notes: only names and numbers", () => {
    expect(JSON.stringify(buildFacts({ ...base, records }))).not.toMatch(/SECRET|private note|1234567890/);
  });
  it("lists what is still to pay on card bills and points at things worth a look", () => {
    const f = buildFacts({ ...base, records: [...records, rec("big", "2026-09-10", 90000, "food", "Jewellers")], cardBills: [{ id: "b", accountId: "cc", statementDate: "2026-09-15", dueDate: "2026-10-05", totalDuePaise: 4125000, source: "manual" }] });
    expect(f.cardBills).toEqual([{ card: "HDFC Credit Card", amountToPay: 41250, due: "2026-10-05", when: "due in 15 days" }]);
    expect(f.worthALook.join(" ")).toMatch(/Largest single purchase: Jewellers/);
    expect(f.worthALook.join(" ")).toMatch(/2 imported transactions are still waiting/);
  });
});
