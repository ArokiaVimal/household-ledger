import { describe, expect, it } from "vitest";
import { pairBalances } from "./balances";
import { detectDuplicate, suggestReceiptMatches } from "./dedupe";
import { formatINR, parseRupees } from "./money";
import { summarize } from "./reports";
import { computeShares, customSplit, equalSplit, percentSplit, validateSplit } from "./splits";
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
