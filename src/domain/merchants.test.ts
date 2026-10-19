import { describe, expect, it } from "vitest";
import { rankMerchants, searchMerchants } from "./merchants";
import type { ExpenseRecord } from "./types";

let n = 0;
const rec = (date: string, merchant: string, extra: Partial<ExpenseRecord> = {}): ExpenseRecord => ({ id: `r${++n}`, date, merchant, kind: "purchase", categoryId: "x", amountPaise: 100, ...extra } as ExpenseRecord);

describe("merchant suggestions", () => {
  it("ranks recent by date and frequent by use, without repeating, from your own history", () => {
    const rows = [rec("2026-10-01", "Zepto"), rec("2026-10-02", "Zepto"), rec("2026-10-03", "Zepto"), rec("2026-09-01", "Swiggy"), rec("2026-09-02", "Swiggy"), rec("2026-10-10", "Cult.fit"), rec("2026-10-09", "Uber"), rec("2026-10-08", "Apollo"), rec("2026-10-07", "BigBasket"), rec("2026-10-06", "Truffles")];
    const s = rankMerchants(rows);
    expect(s.recent.map((m) => m.name)).toEqual(["Cult.fit", "Uber", "Apollo", "BigBasket", "Truffles"]);
    expect(s.frequent.map((m) => [m.name, m.count])).toEqual([["Zepto", 3], ["Swiggy", 2]]);
    expect(s.popular).toEqual([]); // plenty of history: no starter names
    expect(s.all.map((m) => m.name)[0]).toBe("Apollo");
  });
  it("offers the common names only while history is thin, and never ones you already use", () => {
    const thin = rankMerchants([rec("2026-10-01", "Swiggy"), rec("2026-10-02", "Local Cafe")]);
    expect(thin.popular).toEqual(["Zepto", "Instamart", "Amazon", "Geetham", "A2B", "Netflix", "Airtel", "Shell"]); // eight at a time; search finds the rest
    expect(rankMerchants([]).popular).toEqual(["Zepto", "Swiggy", "Instamart", "Amazon", "Geetham", "A2B", "Netflix", "Airtel"]);
  });
  it("ignores refunds, transfers and blank names, and keeps the last category used", () => {
    const s = rankMerchants([rec("2026-10-01", "Zepto", { categoryId: "groceries" }), { ...rec("2026-10-02", "Refund Co"), kind: "refund" } as ExpenseRecord, { ...rec("2026-10-03", "  "), kind: "purchase" } as ExpenseRecord]);
    expect(s.all.map((m) => m.name)).toEqual(["Zepto"]);
    expect(s.all[0].categoryId).toBe("groceries");
  });
  it("searches known merchants first and the common names too", () => {
    const s = rankMerchants([rec("2026-10-01", "Amazon Fresh"), rec("2026-10-02", "Amazon Fresh"), rec("2026-10-03", "Mamaearth")]);
    expect(searchMerchants(s, "ama").map((m) => m.name)).toEqual(["Amazon Fresh", "Mamaearth", "Instamart", "Amazon", "Amazon Prime"]);
    expect(searchMerchants(s, "zep").map((m) => [m.name, m.known])).toEqual([["Zepto", false]]);
    expect(searchMerchants(s, "")).toEqual([]);
  });
});
