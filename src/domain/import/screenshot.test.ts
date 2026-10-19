import { describe, expect, it } from "vitest";
import type { ExpenseRecord, VoucherBrand } from "../types";
import { brandFor, planShots, shotNote, type ShotLike } from "./screenshot";

const rec = (id: string, date: string, amountPaise: number, o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id, date, merchant: "Shopwise", originalDescription: "CUSTCAP SOLUTIONS PVT L THANE", amountPaise, currency: "INR", accountId: "cc_amex", categoryId: "uncategorized", kind: "purchase", payerId: "me",
  shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "unreviewed", ...o,
} as ExpenseRecord);
const item = (date: string, amountPaise: number, o: Partial<ShotLike> = {}): ShotLike => ({ date, merchant: "Shopwise", amountPaise, direction: "debit", status: "done", ...o });
const records = [rec("a", "2026-10-17", 508850), rec("b", "2026-09-20", 508850), rec("c", "2026-10-03", 1017700), rec("d", "2026-09-27", 101770)];

describe("planShots", () => {
  it("skips failed orders and matches the rest to the card transaction with the same amount", () => {
    const plans = planShots([item("2026-10-17", 508850, { status: "failed" }), item("2026-10-17", 508850, { voucherBrand: "Amazon Pay", faceValuePaise: 500000 }), item("2026-10-03", 1017700)], records);
    expect(plans.map((p) => p.action)).toEqual(["skip", "tag", "tag"]);
    expect(plans[1].action === "tag" && plans[1].record.id).toBe("a");
  });
  it("never uses one transaction for two orders, and prefers the closest date", () => {
    const plans = planShots([item("2026-09-20", 508850), item("2026-10-17", 508850)], records);
    expect(plans.map((p) => p.action === "tag" && p.record.id)).toEqual(["b", "a"]);
    const two = planShots([item("2026-10-17", 508850), item("2026-10-17", 508850)], [rec("a", "2026-10-17", 508850)]);
    expect(two.map((p) => p.action)).toEqual(["tag", "add"]);
  });
  it("adds a payment that is not in your records, and ignores dates too far away", () => {
    expect(planShots([item("2026-10-17", 777700)], records)[0].action).toBe("add");
    expect(planShots([item("2026-10-30", 508850)], records)[0].action).toBe("add");
  });
  it("does not match refunds, vouchers already spent, or other kinds of transaction", () => {
    const other = [rec("x", "2026-10-17", 508850, { kind: "refund" }), rec("y", "2026-10-17", 508850, { paidWithVoucherId: "vb" })];
    expect(planShots([item("2026-10-17", 508850)], other)[0].action).toBe("add");
  });
});

describe("brandFor and shotNote", () => {
  const brands: VoucherBrand[] = [{ id: "1", name: "Amazon" }, { id: "2", name: "Swiggy" }];
  it("finds your brand by its main word", () => {
    expect(brandFor("Amazon Pay", brands)?.id).toBe("1");
    expect(brandFor("Swiggy Money", brands)?.id).toBe("2");
    expect(brandFor("Myntra", brands)).toBeNull();
    expect(brandFor("", brands)).toBeNull();
  });
  it("writes a short note once, after any existing note", () => {
    const n = shotNote(item("2026-10-17", 508850, { voucherBrand: "Amazon Pay", faceValuePaise: 500000, orderId: "A0HM1" }));
    expect(n).toBe("₹5,000 Amazon Pay e-gift card · order A0HM1");
    expect(shotNote(item("2026-10-17", 508850, { voucherBrand: "Amazon Pay", faceValuePaise: 500000, orderId: "A0HM1" }), n)).toBe(n);
    expect(shotNote(item("2026-10-17", 1), "mine").startsWith("mine")).toBe(true);
  });
});
