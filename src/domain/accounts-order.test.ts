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
