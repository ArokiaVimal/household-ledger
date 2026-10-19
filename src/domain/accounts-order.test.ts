import { describe, expect, it } from "vitest";
import { orderByUse, sortAccounts } from "./accounts";
import type { Account } from "./types";

const A = (id: string, extra: Partial<Account> = {}): Account => ({ id, name: id, type: "credit_card", ...extra });

describe("payment method order", () => {
  it("follows the saved order, keeping never-ordered ones after, in their original order", () => {
    const out = sortAccounts([A("x"), A("b", { order: 1 }), A("y"), A("a", { order: 0 })]);
    expect(out.map((a) => a.id)).toEqual(["a", "b", "x", "y"]);
  });
  it("by most used: primaries by their own plus their sub methods' use, subs by their own use", () => {
    const accts = [A("amex"), A("hdfc"), A("w1", { type: "wallet", parentId: "amex" }), A("w2", { type: "wallet", parentId: "amex" })];
    const use: Record<string, number> = { amex: 2, hdfc: 5, w1: 1, w2: 9 };
    expect(orderByUse(accts, (id) => use[id] ?? 0)).toEqual(["amex", "w2", "w1", "hdfc"]);
  });
});

import { planUpiSetup } from "./accounts";
import { resolveChannel } from "./import/channel";

describe("UPI apps under each bank", () => {
  const base: Account[] = [A("bank_hdfc", { name: "HDFC Bank", type: "bank" }), A("bank_icici", { name: "ICICI Savings Account", type: "bank" }), A("upi_gpay", { name: "GPay", type: "upi" }), A("cc_amex", { name: "Amex" })];
  it("adds four apps per bank named for the bank, and hides the old stand-alone GPay", () => {
    const plan = planUpiSetup(base);
    expect(plan.add).toHaveLength(8);
    expect(plan.add.find((a) => a.id === "upi_gpay_bank_hdfc")).toMatchObject({ name: "GPay HDFC UPI", type: "upi", parentId: "bank_hdfc" });
    expect(plan.add.some((a) => a.name === "CRED ICICI UPI")).toBe(true);
    expect(plan.hide).toEqual(["upi_gpay"]);
  });
  it("is idempotent and does nothing without a bank", () => {
    const first = planUpiSetup(base);
    const after = [...base.map((a) => (first.hide.includes(a.id) ? { ...a, archived: true } : a)), ...first.add];
    expect(planUpiSetup(after)).toEqual({ add: [], hide: [] });
    expect(planUpiSetup([A("upi_gpay", { name: "GPay", type: "upi" })])).toEqual({ add: [], hide: [] });
  });
  it("files a GPay row of an HDFC statement under GPay HDFC UPI, funded by HDFC", () => {
    const accts = [...base, ...planUpiSetup(base).add];
    const bank = { id: "bank_icici", name: "ICICI Savings Account", type: "bank" as const };
    expect(resolveChannel("UPI-ZEPTO-GPAY-x@y", "purchase", { id: "bank_hdfc", name: "HDFC Bank", type: "bank" }, accts)).toMatchObject({ accountId: "upi_gpay_bank_hdfc", fundedBy: "bank_hdfc" });
    expect(resolveChannel("UPI-ZEPTO-GPAY-x@y", "purchase", bank, accts)).toMatchObject({ accountId: "upi_gpay_bank_icici" });
  });
});
