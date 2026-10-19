// Payment methods can sit under another one: Amazon Pay and Swiggy Money (wallets topped up by card purchases) come under Amex.
// Reports and groupings roll the children up into the parent; nothing is counted twice because each transaction has one account.
import type { Account, VoucherBrand } from "./types";
import { SUGGESTED_ACCOUNTS } from "./defaults";
import { issuerKeys } from "./import/sense";

/** The top-level payment method for an account: its parent when it has one that exists, otherwise itself. */
export function rootOf(accounts: Account[], id: string): string {
  const a = accounts.find((x) => x.id === id);
  return a?.parentId && accounts.some((x) => x.id === a.parentId) ? a.parentId : id;
}

export const childrenOf = (accounts: Account[], id: string) => accounts.filter((a) => a.parentId === id);

/**
 * Suggested payment methods with their parents resolved against what you already have: a suggestion that sits under Amex goes
 * under YOUR Amex card (matched by id, then by the issuer word in its name), or under none if you have no such card.
 */
export function suggestedWithParents(suggested: Account[], existing: Account[]): Account[] {
  return suggested.map((s) => {
    if (!s.parentId) return s;
    if (existing.some((k) => k.id === s.parentId)) return s;
    // Your own card of that issuer wins over a card we are about to suggest.
    const issuers = issuerKeys(SUGGESTED_ACCOUNTS.find((x) => x.id === s.parentId)?.name ?? "");
    const mine = issuers.length ? existing.find((e) => e.type === "credit_card" && issuerKeys(e.name).some((k) => issuers.includes(k))) : undefined;
    if (mine) return { ...s, parentId: mine.id };
    if (suggested.some((k) => k.id === s.parentId)) return s;
    const { parentId: _drop, ...rest } = s; void _drop;
    return rest;
  });
}

/** The voucher wallet a wallet payment method stands for: "Amazon Pay" is the Amazon wallet, "Swiggy Money" the Swiggy wallet. */
export function walletBrandFor(account: Account | undefined, brands: VoucherBrand[]): VoucherBrand | null {
  if (!account || account.type !== "wallet") return null;
  const n = account.name.toLowerCase();
  return [...brands].sort((a, b) => b.name.length - a.name.length).find((b) => n.includes(b.name.toLowerCase())) ?? null;
}

/** The wallet payment method for a voucher wallet, when there is one. */
export function walletAccountFor(brand: VoucherBrand | undefined, accounts: Account[]): Account | null {
  if (!brand) return null;
  return accounts.find((a) => a.type === "wallet" && a.name.toLowerCase().includes(brand.name.toLowerCase())) ?? null;
}
