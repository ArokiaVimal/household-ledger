import { describe, expect, it } from "vitest";
import { groupCsv, groupSummary } from "./group-report";
import type { ExpenseRecord, SplitGroup, SplitSettlement } from "./types";

const g: SplitGroup = { id: "g1", name: "Goa, 2026", kind: "trip", participantIds: ["me", "asha"], createdAt: "2026-10-01" } as SplitGroup;
const rec = (id: string, date: string, merchant: string, amountPaise: number, categoryId: string, payerId = "me"): ExpenseRecord => ({
  id, date, merchant, originalDescription: merchant, amountPaise, currency: "INR", accountId: "a", categoryId, kind: "purchase", payerId, shared: true,
  split: { mode: "equal", participantIds: ["me", "asha"] }, excluded: false, status: "reviewed", importSource: "Manual entry", splitGroupId: "g1",
}) as ExpenseRecord;
const names = (id: string) => ({ me: "Me", asha: "Asha" }[id] ?? id);

describe("group summary", () => {
  const records = [rec("1", "2026-10-01", "Hotel", 600000, "travel"), rec("2", "2026-10-03", "Dinner", 200000, "restaurants", "asha"), rec("3", "2026-10-03", "Taxi", 100000, "travel"), { ...rec("4", "2026-10-02", "Pending", 99900, "travel"), status: "unreviewed" as const }];
  it("totals counted expenses only, by category, and per day over the days covered", () => {
    const s = groupSummary(g, records);
    expect(s).toMatchObject({ totalPaise: 900000, expenseCount: 3, from: "2026-10-01", to: "2026-10-03", perDayPaise: 300000 });
    expect(s.byCategory).toEqual([{ categoryId: "travel", totalPaise: 700000, count: 2 }, { categoryId: "restaurants", totalPaise: 200000, count: 1 }]);
  });
  it("is empty for a group with no counted expenses", () => {
    expect(groupSummary(g, [])).toMatchObject({ totalPaise: 0, expenseCount: 0, perDayPaise: 0, byCategory: [] });
  });
});

describe("group csv", () => {
  const records = [rec("1", "2026-10-01", "=HYPERLINK(\"x\"),Hotel", 600000, "travel"), rec("2", "2026-10-03", "Dinner", 200000, "restaurants", "asha")];
  const pay: SplitSettlement[] = [{ id: "s1", groupId: "g1", fromId: "asha", toId: "me", amountPaise: 100000, date: "2026-10-04", note: "UPI" } as SplitSettlement, { id: "s2", groupId: "g1", fromId: "asha", toId: "me", amountPaise: 5000, date: "2026-10-05", voided: true } as SplitSettlement];
  const csv = groupCsv(g, records, pay, names, (id) => (id === "travel" ? "Travel" : "Food"));
  it("lists expenses with each person's share, payments (not voided) and balances", () => {
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('Group,"Goa, 2026"');
    expect(lines[1]).toBe("Spent (₹),8000.00");
    expect(lines).toContain("Date,Description,Category,Paid by,Amount (₹),Me share (₹),Asha share (₹)");
    expect(lines).toContain("2026-10-03,Dinner,Food,Asha,2000.00,1000.00,1000.00");
    expect(lines).toContain("2026-10-04,Asha,Me,1000.00,UPI");
    expect(csv).not.toContain("50.00,"); // the voided payment is left out
    expect(lines).toContain("Me,6000.00,4000.00,-1000.00,1000.00");
    expect(lines).toContain("Asha,2000.00,4000.00,1000.00,-1000.00");
  });
  it("defangs text a spreadsheet would run as a formula and quotes commas", () => {
    expect(csv).toContain(`'=HYPERLINK(""x""),Hotel`);
    expect(csv).toContain(`"'=HYPERLINK(""x""),Hotel"`);
  });
});
