import { describe, expect, it } from "vitest";
import { summarize } from "./reports";
import { brandSummaries, isVoucherPurchase, knownVoucherSeller, monthlyPurchases, reconcileVouchers, remainingFor, voucherOutflow, voucherTree } from "./vouchers";
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
    const g = reconcileVouchers([...data, rec("m", "2026-09-18", 700)], "2026-09");
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
});
