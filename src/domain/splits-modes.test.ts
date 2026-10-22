import { describe, expect, it } from "vitest";
import { ExpenseRecordSchema } from "@/data/schemas";
import { computeShares, quickSplitIsDefault, sameSplit, validateSplit, weightedSplit } from "./splits";
import type { ExpenseRecord, SplitConfig, SplitItem } from "./types";

const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);
const item = (id: string, amountPaise: number, who: string[], name = id): SplitItem => ({ id, name, amountPaise, participantIds: who });

describe("shares", () => {
  it("2 shares pay twice what 1 share pays, and always add up", () => {
    const r = computeShares(10000, { mode: "shares", participantIds: ["a", "b", "c"], values: { a: 2, b: 1, c: 1 } });
    expect(r).toEqual({ a: 5000, b: 2500, c: 2500 });
    const odd = computeShares(10001, { mode: "shares", participantIds: ["a", "b", "c"], values: { a: 1, b: 1, c: 1 } });
    expect(sum(odd)).toBe(10001);
  });
  it("0 shares pays nothing, which is how 'they owe it all' works", () => {
    expect(computeShares(45000, { mode: "shares", participantIds: ["me", "v"], values: { me: 0, v: 1 } })).toEqual({ me: 0, v: 45000 });
  });
  it("refuses everyone having 0 shares or fractions", () => {
    expect(validateSplit(100, { mode: "shares", participantIds: ["a", "b"], values: { a: 0, b: 0 } })).toMatch(/at least one person/);
    expect(validateSplit(100, { mode: "shares", participantIds: ["a", "b"], values: { a: 1.5, b: 1 } })).toMatch(/whole numbers/);
  });
});

describe("weightedSplit", () => {
  it("does not overflow with large amounts", () => {
    const r = weightedSplit(9_000_000_000_000, { a: 999_999_999_999, b: 1 });
    expect(sum(r)).toBe(9_000_000_000_000);
  });
});

describe("adjustment", () => {
  it("splits the rest equally, then adds each adjustment: ₹1000 with +₹100 for Varru", () => {
    expect(computeShares(100000, { mode: "adjust", participantIds: ["me", "v"], values: { v: 10000 } })).toEqual({ me: 45000, v: 55000 });
  });
  it("a negative adjustment works too, and the total always matches", () => {
    const r = computeShares(100001, { mode: "adjust", participantIds: ["a", "b", "c"], values: { a: -5000, c: 2000 } });
    expect(sum(r)).toBe(100001);
    expect(r.a).toBeLessThan(r.b);
  });
  it("refuses adjustments bigger than the bill or that make a share negative", () => {
    expect(validateSplit(1000, { mode: "adjust", participantIds: ["a", "b"], values: { a: 5000 } })).toMatch(/more than the total/);
    expect(validateSplit(10000, { mode: "adjust", participantIds: ["a", "b"], values: { a: -20000 } })).toMatch(/negative/);
  });
});

describe("items", () => {
  const split = (items: SplitItem[], ids = ["me", "v", "k"]): SplitConfig => ({ mode: "items", participantIds: ids, items });
  it("each person pays for their items; a shared item is divided between its people", () => {
    const r = computeShares(100000, split([item("i1", 60000, ["me"]), item("i2", 20000, ["v"]), item("i3", 20000, ["me", "v"])]));
    expect(r).toEqual({ me: 70000, v: 30000, k: 0 });
  });
  it("tax and tip are shared in proportion to what each person ordered", () => {
    // items 800 + 200 = 1000, bill 1180 (18% GST): extras 180 split 80/20
    const r = computeShares(118000, split([item("i1", 80000, ["me"]), item("i2", 20000, ["v"])]));
    expect(r).toEqual({ me: 94400, v: 23600, k: 0 });
    expect(sum(r)).toBe(118000);
  });
  it("a discount (bill smaller than the items) is shared the same way", () => {
    const r = computeShares(90000, split([item("i1", 80000, ["me"]), item("i2", 20000, ["v"])]));
    expect(r).toEqual({ me: 72000, v: 18000, k: 0 });
  });
  it("odd paise still add up exactly", () => {
    const r = computeShares(100003, split([item("i1", 33333, ["me", "v", "k"]), item("i2", 66667, ["me"])]));
    expect(sum(r)).toBe(100003);
  });
  it("refuses empty lists, itemless people, strangers and zero amounts", () => {
    expect(validateSplit(100, split([]))).toMatch(/at least one item/);
    expect(validateSplit(100, split([item("i1", 100, [])]))).toMatch(/who shared/);
    expect(validateSplit(100, split([item("i1", 100, ["ghost"])]))).toMatch(/not in this expense/);
    expect(validateSplit(100, split([item("i1", 0, ["me"])]))).toMatch(/amount/);
  });
});

describe("persistence", () => {
  const base: ExpenseRecord = {
    id: "r", date: "2026-10-01", merchant: "Dinner", originalDescription: "x", amountPaise: 118000, currency: "INR", accountId: "a", categoryId: "food", kind: "purchase", payerId: "me",
    shared: true, split: { mode: "items", participantIds: ["me", "v"], items: [item("i1", 80000, ["me"]), item("i2", 20000, ["v"])] }, excluded: false, status: "reviewed", importSource: "manual",
  };
  it("an itemised expense is accepted, and rejected if the items do not fit", () => {
    expect(ExpenseRecordSchema.safeParse(base).success).toBe(true);
    expect(ExpenseRecordSchema.safeParse({ ...base, split: { ...base.split, items: [item("i1", 80000, ["ghost"])] } }).success).toBe(false);
  });
  it("sameSplit tells itemised splits apart", () => {
    expect(sameSplit(base.split, structuredClone(base.split))).toBe(true);
    expect(sameSplit(base.split, { ...base.split, items: [item("i1", 1, ["me"])] })).toBe(false);
  });
});

describe("quickSplitIsDefault", () => {
  const base = { newExpense: true, methodPicked: false, mode: "equal" as const, others: ["karthik"], partnerId: "varru" };
  it("is the selected method for a new expense split with one friend", () => expect(quickSplitIsDefault(base)).toBe(true));
  it("is not, for a group of three or more: they split equally", () => {
    expect(quickSplitIsDefault({ ...base, others: ["karthik", "priya"] })).toBe(false);
    expect(quickSplitIsDefault({ ...base, others: ["karthik", "priya", "varru"] })).toBe(false);
  });
  it("is not, for just you and your linked partner (their usual split is already chosen)", () => expect(quickSplitIsDefault({ ...base, others: ["varru"] })).toBe(false));
  it("is not, when there is no partner, a friend alone still gets it", () => expect(quickSplitIsDefault({ ...base, others: ["varru"], partnerId: undefined })).toBe(true));
  it("is not, once a method was picked, for a saved expense, for a gift, for nobody or for any other method", () => {
    expect(quickSplitIsDefault({ ...base, methodPicked: true })).toBe(false);
    expect(quickSplitIsDefault({ ...base, newExpense: false })).toBe(false);
    expect(quickSplitIsDefault({ ...base, gift: true })).toBe(false);
    expect(quickSplitIsDefault({ ...base, others: [] })).toBe(false);
    expect(quickSplitIsDefault({ ...base, mode: "percent" })).toBe(false);
  });
});

