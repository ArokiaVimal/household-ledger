import { describe, expect, it } from "vitest";
import { childrenOf, rootOf, suggestedWithParents, walletAccountFor, walletBrandFor } from "./accounts";
import type { Account, VoucherBrand } from "./types";

const accounts: Account[] = [
  { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" },
  { id: "wl_amazonpay", name: "Amazon Pay", type: "wallet", parentId: "cc_amex" },
  { id: "wl_swiggymoney", name: "Swiggy Money", type: "wallet", parentId: "cc_amex" },
  { id: "orphan", name: "Orphan", type: "wallet", parentId: "gone" },
];
const brands: VoucherBrand[] = [{ id: "amz", name: "Amazon" }, { id: "swg", name: "Swiggy" }];

describe("hierarchy", () => {
  it("a child rolls up into its parent; one whose parent is missing stands alone", () => {
    expect(rootOf(accounts, "wl_amazonpay")).toBe("cc_amex");
    expect(rootOf(accounts, "cc_amex")).toBe("cc_amex");
    expect(rootOf(accounts, "orphan")).toBe("orphan");
    expect(childrenOf(accounts, "cc_amex").map((a) => a.id)).toEqual(["wl_amazonpay", "wl_swiggymoney"]);
  });
});

describe("suggestedWithParents", () => {
  const wallets: Account[] = [{ id: "wl_amazonpay", name: "Amazon Pay", type: "wallet", parentId: "cc_amex" }];
  it("keeps the parent when it is among the accounts, finds your own Amex by name, and drops it when there is none", () => {
    expect(suggestedWithParents(wallets, [{ id: "cc_amex", name: "Amex", type: "credit_card" }])[0].parentId).toBe("cc_amex");
    expect(suggestedWithParents(wallets, [{ id: "my-amex", name: "My Amex Gold", type: "credit_card" }])[0].parentId).toBe("my-amex");
    expect(suggestedWithParents(wallets, [{ id: "hdfc", name: "HDFC Credit Card", type: "credit_card" }])[0]).not.toHaveProperty("parentId");
  });
});

describe("wallet and voucher wallet link", () => {
  it("Amazon Pay is the Amazon wallet and Swiggy Money the Swiggy wallet, and back", () => {
    expect(walletBrandFor(accounts[1], brands)?.id).toBe("amz");
    expect(walletBrandFor(accounts[2], brands)?.id).toBe("swg");
    expect(walletBrandFor(accounts[0], brands)).toBeNull(); // a card is not a wallet
    expect(walletAccountFor(brands[1], accounts)?.id).toBe("wl_swiggymoney");
    expect(walletAccountFor({ id: "x", name: "Flipkart" }, accounts)).toBeNull();
  });
});
