import { describe, expect, it } from "vitest";
import { pairBalances } from "./balances";
import { commitmentTotals, recurringStatuses } from "./recurring";
import { detectDuplicate, planImport, suggestReceiptMatches } from "./dedupe";
import { pickMonth } from "./months";
import { suggestCategory } from "./rules";
import { formatINR, parseRupees } from "./money";
import { summarize } from "./reports";
import { computeShares, customSplit, equalSplit, percentSplit, ratioSplit, sameSplit, validateSplit } from "./splits";
import type { ExpenseRecord, Settlement } from "./types";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function rec(p: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: "e1", date: "2026-09-05", merchant: "Test", originalDescription: "TEST", amountPaise: 10000, currency: "INR",
    accountId: "a1", categoryId: "groceries", kind: "purchase", payerId: "me", shared: false,
    split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "mock", ...p,
  };
}

describe("money", () => {
  it("parses and formats", () => {
    expect(parseRupees("1,234.5")).toBe(123450);
    expect(parseRupees("12.345")).toBeNull();
    expect(formatINR(123450)).toContain("1,234.50");
  });
});

describe("splits", () => {
  it("equal split distributes remainder deterministically", () => {
    expect(equalSplit(10000, ["a", "b", "c"])).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(equalSplit(1, ["a", "b"])).toEqual({ a: 1, b: 0 });
  });
  it("every split sums to total (property check)", () => {
    for (let t = 0; t < 500; t++) {
      for (const n of [2, 3, 4, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `p${i}`);
        expect(sum(equalSplit(t * 37 + 1, ids))).toBe(t * 37 + 1);
      }
    }
  });
  it("percent split uses largest remainder and sums exactly", () => {
    const s = percentSplit(10001, { a: 3333, b: 3333, c: 3334 });
    expect(sum(s)).toBe(10001);
    expect(() => percentSplit(100, { a: 5000, b: 4000 })).toThrow(/100%/);
  });
  it("custom split must equal total", () => {
    expect(customSplit(500, { a: 200, b: 300 })).toEqual({ a: 200, b: 300 });
    expect(() => customSplit(500, { a: 200, b: 299 })).toThrow();
    expect(validateSplit(500, { mode: "custom", participantIds: ["a", "b"], values: { a: 1, b: 1 } })).toMatch(/equal/);
  });
  it("personal assigns all", () => {
    expect(computeShares(999, { mode: "personal", participantIds: ["me"] })).toEqual({ me: 999 });
  });
});

describe("reports", () => {
  it("refunds reduce net; transfers, cc payments, income and excluded are ignored", () => {
    const rs = [
      rec({ id: "1", amountPaise: 100000 }),
      rec({ id: "2", amountPaise: 30000, kind: "refund" }),
      rec({ id: "3", amountPaise: 500000, kind: "cc_payment" }),
      rec({ id: "4", amountPaise: 700000, kind: "transfer" }),
      rec({ id: "5", amountPaise: 900000, kind: "income" }),
      rec({ id: "6", amountPaise: 20000, excluded: true }),
    ];
    const s = summarize(rs, "me");
    expect(s).toMatchObject({ grossPurchases: 100000, refunds: 30000, net: 70000, myShare: 70000 });
  });
  it("my share differs from total paid for shared expenses", () => {
    const r = rec({ amountPaise: 10000, shared: true, split: { mode: "equal", participantIds: ["me", "wife", "friend"] } });
    expect(summarize([r], "me")).toMatchObject({ net: 10000, myShare: 3334, sharedNet: 10000 });
  });
});

describe("balances and settlements", () => {
  const dinner = rec({ amountPaise: 9000, shared: true, payerId: "me", split: { mode: "equal", participantIds: ["me", "k", "p"] } });
  it("friends owe the payer their share only", () => {
    const b = pairBalances([dinner], []);
    expect(b.map((x) => [x.from, x.to, x.outstanding])).toEqual(expect.arrayContaining([["k", "me", 3000], ["p", "me", 3000]]));
  });
  it("settlement reduces outstanding and creates no expense", () => {
    const set: Settlement = { id: "s1", date: "2026-09-20", fromId: "k", toId: "me", amountPaise: 1000 };
    const rs = [dinner];
    const b = pairBalances(rs, [set]).find((x) => x.from === "k")!;
    expect(b).toMatchObject({ owed: 3000, settled: 1000, outstanding: 2000 });
    expect(summarize(rs, "me").net).toBe(9000);
  });
  it("full settlement leaves zero; voiding restores debt", () => {
    const set: Settlement = { id: "s1", date: "2026-09-20", fromId: "k", toId: "me", amountPaise: 3000 };
    expect(pairBalances([dinner], [set]).find((x) => x.from === "k")!.outstanding).toBe(0);
    expect(pairBalances([dinner], [{ ...set, voided: true }]).find((x) => x.from === "k")!.outstanding).toBe(3000);
  });
  it("refund reverses debt", () => {
    const refund = rec({ id: "r", kind: "refund", amountPaise: 9000, shared: true, payerId: "me", split: dinner.split });
    expect(pairBalances([dinner, refund], []).every((x) => x.outstanding === 0)).toBe(true);
  });
});

describe("duplicates and receipt matching", () => {
  const existing = [rec({ id: "x", referenceId: "REF1", merchant: "Swiggy", amountPaise: 45000 })];
  it("same reference id is an exact duplicate", () => {
    expect(detectDuplicate({ accountId: "a1", date: "2026-09-06", amountPaise: 1, merchant: "z", referenceId: "REF1" }, existing).status).toBe("exact");
  });
  it("same date+amount+merchant is only possible", () => {
    expect(detectDuplicate({ accountId: "a1", date: "2026-09-05", amountPaise: 45000, merchant: "SWIGGY" }, existing).status).toBe("possible");
  });
  it("a refund of a purchase (same merchant, date, amount) is not a duplicate of it, in either order", () => {
    const purchase = [rec({ id: "p", merchant: "Shop", amountPaise: 999, kind: "purchase" })];
    expect(detectDuplicate({ accountId: "a1", date: "2026-09-05", amountPaise: 999, merchant: "Shop", direction: "credit" }, purchase).status).toBe("none");
    expect(detectDuplicate({ accountId: "a1", date: "2026-09-05", amountPaise: 999, merchant: "Shop", direction: "debit" }, purchase).status).toBe("possible");
    const rows = [
      { accountId: "a1", date: "2026-09-05", amountPaise: 999, merchant: "Shop", direction: "debit" as const },
      { accountId: "a1", date: "2026-09-05", amountPaise: 999, merchant: "Shop", direction: "credit" as const },
    ];
    expect(planImport(rows, []).map((p) => p.dup.status)).toEqual(["none", "none"]);
  });
  it("amount alone never matches", () => {
    expect(detectDuplicate({ accountId: "a1", date: "2026-09-05", amountPaise: 45000, merchant: "Uber" }, existing).status).toBe("none");
  });
  it("receipt needs exact amount plus merchant or order id", () => {
    const r = { id: "r", merchant: "Swiggy", date: "2026-09-05", amountPaise: 45000, filename: "r.pdf" };
    expect(suggestReceiptMatches(r, existing)[0].recordId).toBe("x");
    expect(suggestReceiptMatches({ ...r, amountPaise: 45001 }, existing)).toEqual([]);
    expect(suggestReceiptMatches({ ...r, merchant: "Uber" }, existing)).toEqual([]);
  });
});

describe("recurring", () => {
  const item = { id: "rent", name: "Rent", categoryId: "rent", dueDay: 5, expectedPaise: 100000, payerId: "me", split: { mode: "personal" as const, participantIds: ["me"] } };
  const paid = rec({ id: "p", date: "2026-09-05", amountPaise: 100000, recurringId: "rent" });
  it("paid, upcoming, overdue", () => {
    expect(recurringStatuses([item], [paid], "2026-09", "2026-09-20")[0].state).toBe("paid");
    expect(recurringStatuses([item], [], "2026-09", "2026-09-03")[0].state).toBe("upcoming");
    expect(recurringStatuses([item], [], "2026-09", "2026-09-06")[0].state).toBe("overdue");
    expect(recurringStatuses([item], [], "2026-08", "2026-09-01")[0].state).toBe("overdue");
  });
  it("variance and excluded/refunds", () => {
    const more = rec({ id: "q", date: "2026-09-06", amountPaise: 5000, recurringId: "rent", kind: "fee" });
    const refund = rec({ id: "r", date: "2026-09-07", amountPaise: 2000, recurringId: "rent", kind: "refund" });
    const st = recurringStatuses([item], [paid, more, refund, rec({ id: "x", date: "2026-09-08", amountPaise: 9999, recurringId: "rent", excluded: true })], "2026-09", "2026-09-30")[0];
    expect(st.actualPaise).toBe(103000);
    expect(st.variancePaise).toBe(3000);
  });
  it("totals", () => {
    expect(commitmentTotals([item, { ...item, id: "b", expectedPaise: 5050 }])).toEqual({ monthlyPaise: 105050, yearlyPaise: 1260600 });
  });
});

describe("import planning and rules", () => {
  const existing = [rec({ id: "x", referenceId: "R1", merchant: "Swiggy", amountPaise: 45000 })];
  it("skips exact duplicates, keeps possible and new, catches repeats inside the file", () => {
    const rows = [
      { accountId: "a1", date: "2026-09-09", amountPaise: 1, merchant: "A", referenceId: "R1" },
      { accountId: "a1", date: "2026-09-05", amountPaise: 45000, merchant: "Swiggy" },
      { accountId: "a1", date: "2026-09-10", amountPaise: 700, merchant: "B", referenceId: "R2" },
      { accountId: "a1", date: "2026-09-10", amountPaise: 700, merchant: "B", referenceId: "R2" },
    ];
    expect(planImport(rows, existing).map((p) => p.dup.status)).toEqual(["exact", "possible", "none", "exact"]);
  });
  it("suggests category from merchant rule with fallback", () => {
    const rules = [{ merchant: "Swiggy", categoryId: "food_delivery" }];
    expect(suggestCategory(rules, " swiggy ")).toBe("food_delivery");
    expect(suggestCategory(rules, "Unknown")).toBe("uncategorized");
    expect(suggestCategory(rules, "SWIGGY BANGALORE IN")).toBe("food_delivery");
    expect(suggestCategory(rules, "Swiggy Instamart")).toBe("food_delivery");
    expect(suggestCategory([{ merchant: "Uber", categoryId: "transport" }], "Superb Uberlike Co")).toBe("uncategorized"); // whole words only
  });
});

describe("household 64/36 ratio", () => {
  const cfg = ratioSplit("owner", "partner", 6400);
  it("builds a percent split that sums to 100%", () => {
    expect(cfg).toEqual({ mode: "percent", participantIds: ["owner", "partner"], values: { owner: 6400, partner: 3600 } });
    expect(() => ratioSplit("a", "b", 0)).toThrow();
    expect(() => ratioSplit("a", "b", 10000)).toThrow();
    expect(() => ratioSplit("a", "b", 64.5)).toThrow();
  });
  it("is exact to the paise for known amounts", () => {
    expect(computeShares(10000, cfg)).toEqual({ owner: 6400, partner: 3600 });
    expect(computeShares(10001, cfg)).toEqual({ owner: 6401, partner: 3600 }); // the odd paisa goes to the larger remainder, deterministically
  });
  it("never loses or invents a paisa, for every amount up to Rs 2000", () => {
    for (let paise = 1; paise <= 200000; paise += 7) {
      const s = computeShares(paise, cfg);
      expect(s.owner + s.partner).toBe(paise);
      expect(Math.abs(s.owner - (paise * 64) / 100)).toBeLessThan(1);
    }
  });
  it("sameSplit recognises presets regardless of order", () => {
    expect(sameSplit(cfg, ratioSplit("owner", "partner", 6400))).toBe(true);
    expect(sameSplit(cfg, { mode: "percent", participantIds: ["partner", "owner"], values: { owner: 6400, partner: 3600 } })).toBe(true);
    expect(sameSplit(cfg, ratioSplit("owner", "partner", 5000))).toBe(false);
    expect(sameSplit({ mode: "equal", participantIds: ["a", "b"] }, { mode: "equal", participantIds: ["b", "a"] })).toBe(true);
    expect(sameSplit({ mode: "equal", participantIds: ["a", "b"] }, cfg)).toBe(false);
  });
});

describe("pickMonth (which month the dashboard opens on)", () => {
  it("prefers this month when it has data, else the latest earlier month, else this month", () => {
    expect(pickMonth("2026-10-20", ["2026-10-02", "2026-09-30"])).toBe("2026-10");
    expect(pickMonth("2026-10-20", ["2026-09-03", "2026-08-30"])).toBe("2026-09"); // a September statement opened in October
    expect(pickMonth("2026-10-20", [])).toBe("2026-10");
    expect(pickMonth("2026-10-20", ["bad", ""])).toBe("2026-10");
  });
  it("copes with future-dated data and year boundaries", () => {
    expect(pickMonth("2026-10-20", ["2027-01-05"])).toBe("2027-01");
    expect(pickMonth("2026-10-20", ["2027-01-05", "2026-07-01"])).toBe("2026-07");
    expect(pickMonth("2027-01-02", ["2026-12-30", "2026-03-01"])).toBe("2026-12");
  });
});
