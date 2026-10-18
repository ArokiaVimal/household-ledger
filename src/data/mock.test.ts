import { describe, expect, it } from "vitest";
import { pairBalances } from "@/domain/balances";
import { byCategory, byMerchant, byMonth, signedShare, summarize } from "@/domain/reports";
import { computeShares } from "@/domain/splits";
import { detectDuplicate } from "@/domain/dedupe";
import { initialRecords, initialSettlements, mockImportRows, participants } from "./mock";

const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("mock data reconciles", () => {
  const s = summarize(initialRecords, "me");
  it("every grouping sums to net spending", () => {
    expect(total(byCategory(initialRecords))).toBe(s.net);
    expect(total(byMerchant(initialRecords))).toBe(s.net);
    expect(total(byMonth(initialRecords))).toBe(s.net);
    expect(s.sharedNet + s.personalNet).toBe(s.net);
    expect(s.grossPurchases - s.refunds).toBe(s.net);
  });
  it("participant shares add up to net spending", () => {
    expect(participants.reduce((a, p) => a + initialRecords.reduce((x, r) => x + signedShare(r, p.id), 0), 0)).toBe(s.net);
  });
  it("all mock splits are valid", () => {
    for (const r of initialRecords) expect(() => computeShares(r.amountPaise, r.split)).not.toThrow();
  });
  it("balances are antisymmetric and settlements create no spending", () => {
    const withS = pairBalances(initialRecords, initialSettlements);
    expect(withS.every((b) => b.outstanding >= 0)).toBe(true);
    expect(summarize(initialRecords, "me").net).toBe(s.net);
  });
  it("import sample: one exact duplicate, one possible, rest new", () => {
    const st = mockImportRows.map((r) => detectDuplicate(r, initialRecords).status);
    expect(st).toEqual(["none", "exact", "possible", "none", "none"]);
  });
});
