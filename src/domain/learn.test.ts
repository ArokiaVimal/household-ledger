import { describe, expect, it } from "vitest";
import { bestIcons, learnFromVerified, type LearnNames } from "./learn";
import { memoryDocId } from "./memory";
import type { Account, Category, ExpenseRecord, MerchantMemory } from "./types";

const names: LearnNames = {
  meId: "me", categoryName: (id) => ({ groceries: "Groceries", fuel: "Fuel", uncategorized: "Uncategorized", transfers: "Transfers", utilities: "Utilities" }[id] ?? id),
  accountName: (id) => ({ cc: "Test Card", wl: "Test Wallet" }[id] ?? id), nameOf: (id) => ({ me: "Asha", sam: "Sam", mum: "Mum" }[id] ?? id), voucherName: (id) => (id === "vb1" ? "Gift card" : id),
};
const rec = (id: string, merchant: string, amount: number, o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date: "2026-09-10", merchant, originalDescription: merchant.toUpperCase(), amountPaise: amount * 100, currency: "INR", accountId: "cc", categoryId: "groceries", kind: "purchase", payerId: "me",
  shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "a.pdf (import abc)", ...o,
}) as ExpenseRecord;
const shared = (id: string, m: string, amt: number, bps = 6400, o: Partial<ExpenseRecord> = {}) => rec(id, m, amt, { shared: true, split: { mode: "percent", participantIds: ["me", "sam"], values: { me: bps, sam: 10000 - bps } }, ...o });

describe("learning from verified transactions", () => {
  const records = [
    rec("1", "Green Mart", 500), rec("2", "Green Mart", 700), shared("3", "Petrol Hub", 1000, 6400, { categoryId: "fuel" }), shared("4", "Petrol Hub", 2000, 6400, { categoryId: "fuel", date: "2026-10-02" }),
    rec("5", "Card Payment", 9000, { kind: "cc_payment", categoryId: "transfers" }), rec("6", "Shopwise", 3000, { voucherBrandId: "vb1", categoryId: "uncategorized" }),
    rec("7", "Power Bill", 600, { shared: true, categoryId: "utilities", payerId: "me", split: { mode: "equal", participantIds: ["mum"], gift: true } }),
    rec("8", "Unverified", 1, { status: "unreviewed" }),
  ];
  const r = learnFromVerified(records, [], names);
  it("remembers each verified merchant once, counts confirmations and marks voucher sellers", () => {
    expect(r.counts).toMatchObject({ verified: 7, added: r.memory.length, upgraded: 0, kept: 0 });
    const green = r.memory.find((m) => m.name === "Green Mart")!;
    expect(green).toMatchObject({ categoryId: "groceries", kind: "purchase", source: "user", confirmed: 2 });
    expect(r.memory.find((m) => m.name === "Shopwise")?.voucherSeller).toBe(true);
    expect(r.memory.find((m) => m.name === "Unverified")).toBeUndefined();
  });
  it("describes habits: categories, card bills, sharing, usual ratio, gifts, vouchers", () => {
    const all = r.lessons.map((l) => l.text).join("\n");
    expect(all).toContain("Learned from 7 verified transactions");
    expect(all).toContain("Green Mart → Groceries (2×)");
    expect(all).toContain("Card bill payments are kept out of spending: 1 payment");
    expect(all).toContain("Usually with: Sam 2×");
    expect(all).toContain("usual share is 64%");
    expect(all).toContain("Power Bill for Mum");
    expect(all).toContain("Gift card ₹3,000"); // voucher purchases
    expect(all).toContain("You paid for every shared transaction so far.");
  });
  it("never replaces a choice you made, upgrades an AI guess, and grows the count when history agrees", () => {
    const base = { kind: "purchase" as const, lastSeen: "2026-08-01", key: "green mart", name: "Green Mart", id: memoryDocId("green mart") };
    const yours: MerchantMemory = { ...base, categoryId: "fuel", source: "user", confident: true, confirmed: 5 };
    expect(learnFromVerified(records, [yours], names).memory.find((m) => m.id === yours.id)).toBeUndefined(); // disagrees: left alone
    const ai: MerchantMemory = { ...base, categoryId: "uncategorized", source: "ai", confident: false, confirmed: 0, icon: "tag" };
    const up = learnFromVerified(records, [ai], names).memory.find((m) => m.id === ai.id)!;
    expect(up).toMatchObject({ categoryId: "groceries", source: "user", confirmed: 2, icon: "tag" });
    const agree: MerchantMemory = { ...base, categoryId: "groceries", source: "user", confident: true, confirmed: 1 };
    expect(learnFromVerified(records, [agree], names).memory.find((m) => m.id === agree.id)?.confirmed).toBe(2);
  });
  it("says so when there is nothing verified", () => {
    const e = learnFromVerified([rec("9", "X", 1, { status: "unreviewed" })], [], names);
    expect(e.memory).toEqual([]);
    expect(e.lessons[0].text).toContain("no verified transactions");
  });
});

describe("best icons", () => {
  const categories: Category[] = [{ id: "fuel", name: "Fuel", icon: "fuel" }, { id: "date", name: "Date plans" }, { id: "misc", name: "Zzz" }] as Category[];
  const accounts: Account[] = [{ id: "a1", name: "Test Card", type: "credit_card" }, { id: "a2", name: "HDFC Bank", type: "bank" }, { id: "a3", name: "Some UPI", type: "upi", icon: "zap" }] as Account[];
  const memory: MerchantMemory[] = [
    { id: "m1", key: "swiggy", name: "Swiggy", categoryId: "fuel", kind: "purchase", source: "user", confident: true, confirmed: 1, lastSeen: "2026-09-01" },
    { id: "m2", key: "petrol hub", name: "Petrol Hub", categoryId: "fuel", kind: "purchase", source: "user", confident: true, confirmed: 1, lastSeen: "2026-09-01" },
    { id: "m3", key: "x", name: "Has Icon", categoryId: "fuel", kind: "purchase", source: "user", confident: true, confirmed: 1, lastSeen: "2026-09-01", icon: "bag" },
  ];
  const plan = bestIcons({ categories, accounts, memory, logoFor: (n) => (n === "HDFC Bank" ? "/logos/hdfc.png" : n === "Swiggy" ? "/logos/swiggy.png" : null) });
  it("fills only what is empty", () => {
    expect(plan.categories).toEqual([{ id: "date", icon: "sparkles" }, { id: "misc", icon: "tag" }]);
    expect(plan.accounts).toEqual([{ id: "a1", icon: "card" }]); // the bank has a logo, the UPI app already has an icon
    expect(plan.merchants.map((x) => [x.memory.name, x.icon ?? x.logo])).toEqual([["Swiggy", "swiggy"], ["Petrol Hub", "fuel"]]);
  });
});
