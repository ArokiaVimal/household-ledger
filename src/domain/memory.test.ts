import { describe, expect, it } from "vitest";
import type { ExpenseRecord, MerchantMemory } from "./types";
import { isConfident, kindFits, learnFromUser, lookupMemory, memoryKey, rememberSuggestion, seedMemory } from "./memory";

const mem = (o: Partial<MerchantMemory>): MerchantMemory => ({ id: "mm_x", key: "swiggy", name: "Swiggy", categoryId: "food", kind: "purchase", source: "user", confident: true, confirmed: 1, lastSeen: "2026-09-01", ...o });
const rec = (o: Partial<ExpenseRecord>): ExpenseRecord => ({
  id: "r", date: "2026-09-10", merchant: "Swiggy", originalDescription: "SWIGGY BANGALORE IN", amountPaise: 10000, currency: "INR", accountId: "a", categoryId: "food", kind: "purchase", payerId: "p",
  shared: false, split: { mode: "personal", participantIds: ["p"] }, excluded: false, status: "reviewed", importSource: "x.pdf", ...o,
});

describe("memoryKey", () => {
  it("is the same across cities, ids and processor prefixes", () => {
    expect(memoryKey("SWIGGY BANGALORE IN")).toBe(memoryKey("cca*Swiggy Bangalore"));
    expect(memoryKey("PayU*Zomato 1234567890")).toBe("zomato");
    expect(memoryKey("UPI-AMAZON PAY-amazon@apl-ref123456")).toContain("amazon");
  });
  it("is empty for text with no letters", () => { expect(memoryKey("1234567")).toBe(""); });
});

describe("lookupMemory", () => {
  const m = [mem({ key: "swiggy" }), mem({ key: "swiggy instamart", name: "Instamart", categoryId: "groceries" })];
  it("prefers exact, then the longest remembered prefix", () => {
    expect(lookupMemory(m, "swiggy")?.name).toBe("Swiggy");
    expect(lookupMemory(m, "swiggy instamart bengaluru")?.name).toBe("Instamart");
    expect(lookupMemory(m, "swiggy bangalore")?.name).toBe("Swiggy");
  });
  it("does not match short or unrelated keys", () => {
    expect(lookupMemory([mem({ key: "sw" })], "sw something")).toBeNull();
    expect(lookupMemory(m, "zomato")).toBeNull();
    expect(lookupMemory(m, "")).toBeNull();
  });
});

describe("learning", () => {
  it("your choice replaces an AI guess and counts confirmations", () => {
    const ai = mem({ source: "ai", confident: false, confirmed: 0, categoryId: "shopping" });
    const first = learnFromUser(ai, { key: "swiggy", name: "Swiggy", categoryId: "food", kind: "purchase", date: "2026-10-01" });
    expect(first).toMatchObject({ source: "user", categoryId: "food", confirmed: 1, confident: true });
    expect(learnFromUser(first, { key: "swiggy", name: "Swiggy", categoryId: "food", kind: "purchase", date: "2026-11-01" }).confirmed).toBe(2);
    expect(learnFromUser(first, { key: "swiggy", name: "Swiggy", categoryId: "fuel", kind: "purchase", date: "2026-11-01" })).toMatchObject({ categoryId: "fuel", confirmed: 1 });
  });
  it("an AI suggestion never overwrites anything", () => {
    expect(rememberSuggestion(mem({}), { key: "swiggy", name: "X", categoryId: "y", kind: "purchase", date: "2026-10-01", confident: true })).toBeNull();
    expect(rememberSuggestion(null, { key: "a b", name: "A B", categoryId: "y", kind: "purchase", date: "2026-10-01", confident: false })).toMatchObject({ source: "ai", confirmed: 0 });
  });
  it("confidence: user entries and sure AI entries", () => {
    expect(isConfident(mem({}))).toBe(true);
    expect(isConfident(mem({ source: "ai", confident: false }))).toBe(false);
    expect(isConfident(mem({ source: "ai", confident: true }))).toBe(true);
  });
});

describe("kindFits", () => {
  it("keeps direction and kind consistent", () => {
    expect(kindFits("refund", "debit")).toBe(false);
    expect(kindFits("purchase", "credit")).toBe(false);
    expect(kindFits("fee", "debit")).toBe(true);
    expect(kindFits("cc_payment", "credit")).toBe(true);
  });
});

describe("seedMemory", () => {
  it("builds memory from approved history, using the most common choice", () => {
    const out = seedMemory([rec({ id: "1" }), rec({ id: "2", categoryId: "food" }), rec({ id: "3", categoryId: "shopping" }), rec({ id: "4", status: "unreviewed", categoryId: "fuel" }), rec({ id: "5", merchant: "Rent", originalDescription: "Entered manually", importSource: "Manual entry", categoryId: "rent" })]);
    expect(out.find((m) => m.key === "swiggy bangalore")).toMatchObject({ categoryId: "food", confirmed: 2, source: "user" });
    expect(out.find((m) => m.key === "rent")?.categoryId).toBe("rent");
    expect(out.some((m) => m.categoryId === "fuel")).toBe(false);
  });
});
