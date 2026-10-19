import { describe, expect, it } from "vitest";
import { summarize } from "./reports";
import { brandSummaries, isVoucherPurchase, knownVoucherSeller, needsVoucherBrand, monthlyPurchases, reconcileVouchers, remainingFor, voucherOutflow, voucherTree } from "./vouchers";
import type { Account, ExpenseRecord, VoucherBrand } from "./types";

const accounts: Account[] = [{ id: "amex", name: "Amex Platinum Travel", type: "credit_card" }, { id: "hdfc", name: "HDFC Credit Card", type: "credit_card" }];
const brands: VoucherBrand[] = [{ id: "amz", name: "Amazon" }, { id: "swg", name: "Swiggy" }];
const rec = (id: string, date: string, rupees: number, o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date, merchant: "Shopwise", originalDescription: "CUST CAP SOLUTIONS BANGALORE", amountPaise: rupees * 100, currency: "INR", accountId: "amex", categoryId: "vouchers", kind: "purchase", payerId: "me",
  shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "x.pdf", ...o,
});
const data = [
  rec("a", "2026-09-03", 10000, { voucherBrandId: "amz" }),
  rec("b", "2026-09-05", 2000, { voucherBrandId: "swg" }),
  rec("c", "2026-09-07", 500, { voucherPending: true }),
  rec("u1", "2026-09-10", 1299, { merchant: "Amazon", originalDescription: "AMAZON ORDER", paidWithVoucherId: "amz", categoryId: "shopping" }),
  rec("u2", "2026-09-12", 450, { merchant: "Swiggy", originalDescription: "SWIGGY", paidWithVoucherId: "swg", categoryId: "food_delivery" }),
  rec("x", "2026-09-14", 3000, { merchant: "HDFC Mart", originalDescription: "HDFC MART", categoryId: "shopping" }),
];

describe("knownVoucherSeller", () => {
  it("recognises the statement descriptor and leaves others alone", () => {
    expect(knownVoucherSeller("POS 4471 CUST CAP SOLUTIONS BANGALORE IN")).toBe("Shopwise");
    expect(knownVoucherSeller("cust  cap solutions")).toBe("Shopwise");
    expect(knownVoucherSeller("SWIGGY")).toBeNull();
  });
});

describe("no double counting", () => {
  it("a voucher purchase is the one outflow; spending paid with the voucher adds nothing", () => {
    const s = summarize(data, "me");
    expect(s.net).toBe((10000 + 2000 + 500 + 3000) * 100); // the two voucher-funded orders (₹1,749) are not in it
    expect(voucherOutflow(data, "2026-09")).toBe(12500 * 100);
  });
  it("one amount in two brands is impossible and a paid-with record cannot also be a purchase", async () => {
    const { ExpenseRecordSchema } = await import("@/data/schemas");
    expect(ExpenseRecordSchema.safeParse(rec("z", "2026-09-01", 10, { voucherBrandId: "amz", paidWithVoucherId: "swg" })).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse(rec("z2", "2026-09-01", 10, { voucherBrandId: "amz", kind: "refund" })).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse(rec("z3", "2026-09-01", 10, { voucherBrandId: "amz" })).success).toBe(true);
  });
});

describe("brandSummaries", () => {
  it("keeps Amazon and Swiggy separate under the same card and merchant, with purchases and recorded use apart", () => {
    const s = brandSummaries(brands, data, "2026-09");
    const amz = s.brands.find((b) => b.brand.id === "amz")!, swg = s.brands.find((b) => b.brand.id === "swg")!;
    expect(amz.month).toEqual({ purchasedPaise: 1_000_000, purchases: 1, usedPaise: 129_900, uses: 1 });
    expect(swg.month).toEqual({ purchasedPaise: 200_000, purchases: 1, usedPaise: 45_000, uses: 1 });
    expect(s.unassigned).toEqual({ purchasedPaise: 50_000, purchases: 1 });
  });
  it("ignores unreviewed and excluded rows", () => {
    const s = brandSummaries(brands, [...data, rec("n", "2026-09-20", 999, { voucherBrandId: "amz", status: "unreviewed" }), rec("e", "2026-09-21", 888, { voucherBrandId: "amz", excluded: true })], "2026-09");
    expect(s.brands[0].total.purchasedPaise).toBe(1_000_000);
  });
});

describe("remaining value is never guessed", () => {
  const purchases = [rec("a", "2026-09-03", 10000, { voucherBrandId: "amz" })], uses = [rec("u", "2026-09-10", 1299, { paidWithVoucherId: "amz" })];
  it("is unknown with no balance and no promise that every use is recorded", () => {
    expect(remainingFor({ id: "amz", name: "Amazon" }, purchases, uses)).toBeNull();
  });
  it("uses a balance you recorded, plus later purchases, minus later uses", () => {
    const r = remainingFor({ id: "amz", name: "Amazon", balance: { amountPaise: 400_000, asOf: "2026-09-05" } }, purchases, uses);
    expect(r).toEqual({ amountPaise: 400_000 - 129_900, basis: "balance", inconsistent: false });
  });
  it("uses purchases minus uses only when every use is recorded, and flags impossible figures", () => {
    expect(remainingFor({ id: "amz", name: "Amazon", tracksAllUse: true }, purchases, uses)).toEqual({ amountPaise: 1_000_000 - 129_900, basis: "tracked", inconsistent: false });
    expect(remainingFor({ id: "amz", name: "Amazon", tracksAllUse: true }, [], uses)).toEqual({ amountPaise: 0, basis: "tracked", inconsistent: true });
  });
});

describe("voucherTree", () => {
  it("drills from the card to the merchant to the brand to the transactions", () => {
    const [amex, ...rest] = voucherTree(data, accounts, brands, "2026-09");
    expect(rest).toEqual([]);
    expect(amex).toMatchObject({ label: "Amex Platinum Travel", totalPaise: 1_250_000, count: 3 });
    expect(amex.children).toHaveLength(1);
    const shop = amex.children[0];
    expect(shop).toMatchObject({ label: "Shopwise", totalPaise: 1_250_000 });
    expect(shop.children.map((b) => [b.label, b.totalPaise])).toEqual([["Amazon", 1_000_000], ["Swiggy", 200_000], ["Needs a voucher brand", 50_000]]);
    expect(shop.children[0].records.map((r) => r.id)).toEqual(["a"]);
  });
  it("can be limited to one card", () => {
    expect(voucherTree(data, accounts, brands, "2026-09", "hdfc")).toEqual([]);
  });
});

describe("reconcileVouchers", () => {
  it("accounts for every rupee and points at the same merchant's unmarked transactions", () => {
    const g = reconcileVouchers([...data, rec("m", "2026-09-18", 700, { originalDescription: "SHOPWISE STORE ORDER" })], "2026-09");
    expect(g).toEqual([{ accountId: "amex", merchant: "Shopwise", outflowPaise: 1_250_000, attributedPaise: 1_200_000, waitingPaise: 50_000, unmarkedPaise: 70_000, unmarkedCount: 1 }]);
    expect(g[0].attributedPaise + g[0].waitingPaise).toBe(g[0].outflowPaise);
  });
});

describe("monthlyPurchases and isVoucherPurchase", () => {
  it("totals purchases per brand per month, newest first", () => {
    const m = monthlyPurchases(brands, [...data, rec("o", "2026-08-02", 4000, { voucherBrandId: "amz" })]);
    expect(m.map((x) => x.month)).toEqual(["2026-09", "2026-08"]);
    expect(m[0]).toMatchObject({ byBrand: { amz: 1_000_000, swg: 200_000 }, unassigned: 50_000, total: 1_250_000 });
  });
  it("a purchase paid with a voucher is not a voucher purchase", () => {
    expect(isVoucherPurchase(data[3])).toBe(false);
  });
  it("rows imported before voucher tracking, with the seller's statement text, still count as waiting for a brand", () => {
    const old = rec("old", "2026-09-27", 1017.7, { merchant: "Shopwise Voucher", originalDescription: "CUSTCAP SOLUTIONS PVT L THANE" });
    expect(isVoucherPurchase(old)).toBe(true);
    expect(needsVoucherBrand(old)).toBe(true);
    expect(needsVoucherBrand({ ...old, voucherBrandId: "amz" })).toBe(false);
    expect(brandSummaries(brands, [old], "2026-09").unassigned).toEqual({ purchasedPaise: 101_770, purchases: 1 });
    expect(knownVoucherSeller("CUSTCAP SOLUTIONS PVT L THANE")).toBe("Shopwise");
  });
});

import { personLedger, settlementFor } from "./ledger";
import { pairBalances } from "./balances";
import { signedShare } from "./reports";
import { walletActivity, walletUse } from "./vouchers";

describe("wallet top-ups and purchases from the wallet", () => {
  // Me ("me") topped up the Amazon wallet with ₹10,000 on Amex, then bought a ₹3,000 item from it, split 50/50 with my wife and a friend's ₹600 share.
  const topup = rec("t1", "2026-09-03", 10000, { voucherBrandId: "amz" });
  const buy = rec("w1", "2026-09-10", 3000, { merchant: "Amazon", originalDescription: "Amazon order", paidWithVoucherId: "amz", categoryId: "shopping", shared: true, split: { mode: "equal", participantIds: ["me", "wife"] } });
  const buy2 = rec("w2", "2026-09-12", 1800, { merchant: "Amazon", originalDescription: "Amazon gift", paidWithVoucherId: "amz", categoryId: "gifts", shared: true, split: { mode: "custom", participantIds: ["me", "friend"], values: { me: 120000, friend: 60000 } } });

  it("the top-up is the only spending; the wallet purchases add none, so nothing is counted twice", () => {
    const s = summarize([topup, buy, buy2], "me");
    expect(s.net).toBe(1_000_000);
    expect(s.sharedNet).toBe(0);
  });
  it("but the people sharing a wallet purchase still owe their share: settle-up sees it, with no top-up in it", () => {
    const wife = personLedger("wife", "me", [topup, buy, buy2], []);
    expect(wife.open.map((e) => [e.record.id, e.sharePaise])).toEqual([["w1", 150_000]]);
    expect(wife.outstandingPaise).toBe(150_000);
    const friend = personLedger("friend", "me", [topup, buy, buy2], []);
    expect(friend.outstandingPaise).toBe(60_000);
    expect(settlementFor("wife", "me", wife.open)).toMatchObject({ fromId: "wife", toId: "me", amountPaise: 150_000, recordIds: ["w1"] });
    expect(pairBalances([topup, buy, buy2], []).map((b) => [b.from, b.to, b.outstanding]).sort()).toEqual([["friend", "me", 60_000], ["wife", "me", 150_000]]);
  });
  it("the wallet owner's own share is not counted again, other people's shares are theirs to bear", () => {
    expect(signedShare(buy, "me")).toBe(0);
    expect(signedShare(buy, "wife")).toBe(150_000);
  });
  it("a wallet top-up can never be split or shared", async () => {
    const { ExpenseRecordSchema } = await import("@/data/schemas");
    expect(ExpenseRecordSchema.safeParse(rec("s", "2026-09-03", 100, { voucherBrandId: "amz", shared: true, split: { mode: "equal", participantIds: ["me", "wife"] } })).success).toBe(false);
    expect(ExpenseRecordSchema.safeParse(topup).success).toBe(true);
    expect(ExpenseRecordSchema.safeParse(buy).success).toBe(true);
  });
  it("walletActivity is a statement: top-ups increase the balance, purchases decrease it", () => {
    const lines = walletActivity("amz", [buy2, buy, topup, rec("o", "2026-09-04", 99, { voucherBrandId: "swg" })]);
    expect(lines.map((l) => [l.type, l.deltaPaise, l.trackedPaise])).toEqual([["topup", 1_000_000, 1_000_000], ["use", -300_000, 700_000], ["use", -180_000, 520_000]]);
  });
  it("walletUse shows what was bought, by category, and how much belongs to others", () => {
    const u = walletUse("amz", [topup, buy, buy2], "2026-09");
    expect(u).toEqual({ count: 2, totalPaise: 480_000, othersOweePaise: 210_000, byCategory: { shopping: 300_000, gifts: 180_000 } });
  });
});
