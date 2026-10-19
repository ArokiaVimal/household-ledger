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
    const parentType = SUGGESTED_ACCOUNTS.find((x) => x.id === s.parentId)?.type;
    const mine = issuers.length ? existing.find((e) => e.type === parentType && issuerKeys(e.name).some((k) => issuers.includes(k))) : undefined;
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

/** The user's own order first (0, 1, 2…); anything never ordered keeps its place after them. Stable. */
export function sortAccounts(accounts: Account[]): Account[] {
  return accounts.map((a, i) => ({ a, i })).sort((x, y) => (x.a.order ?? 1e9) - (y.a.order ?? 1e9) || x.i - y.i).map((x) => x.a);
}

/** Primary methods by how much they are used (their own and their sub methods' transactions), then sub methods within each. Returns every id. */
export function orderByUse(accounts: Account[], countOf: (id: string) => number): string[] {
  const roots = accounts.filter((a) => !a.parentId || !accounts.some((x) => x.id === a.parentId));
  const total = (id: string) => countOf(id) + accounts.filter((c) => c.parentId === id).reduce((s, c) => s + countOf(c.id), 0);
  const byUse = (list: Account[], f: (id: string) => number) => [...list].sort((x, y) => f(y.id) - f(x.id));
  return byUse(roots, total).flatMap((r) => [r.id, ...byUse(accounts.filter((c) => c.parentId === r.id), countOf).map((c) => c.id)]);
}

/** The UPI apps offered under every bank, named for the bank behind them: "GPay HDFC UPI". */
export const UPI_APPS = [{ key: "gpay", label: "GPay" }, { key: "cred", label: "CRED" }, { key: "paytm", label: "Paytm" }, { key: "bhim", label: "BHIM" }] as const;
/** "HDFC Bank" -> "HDFC", "ICICI Savings Account" -> "ICICI". */
export const bankShort = (name: string) => name.replace(/\b(bank|account|savings|current)\b/gi, "").replace(/\s+/g, " ").trim() || name;
const GENERIC_UPI = /^(gpay|google pay|cred|bhim( upi)?|paytm( upi)?)$/i;

/**
 * Puts GPay, CRED, Paytm and BHIM under every bank as "<App> <Bank> UPI" (only the ones missing), and hides the old stand-alone UPI apps
 * (hidden, never deleted: their transactions stay). Pure, so the screen and the server agree.
 */
export function planUpiSetup(accounts: Account[]): { add: Account[]; hide: string[] } {
  const banks = accounts.filter((a) => a.type === "bank" && !a.archived && !a.parentId);
  const add: Account[] = [];
  for (const bank of banks) {
    for (const app of UPI_APPS) {
      const name = `${app.label} ${bankShort(bank.name)} UPI`;
      const id = `upi_${app.key}_${bank.id}`;
      if (accounts.some((a) => a.id === id || a.name.toLowerCase() === name.toLowerCase())) continue;
      add.push({ id, name, type: "upi", parentId: bank.id });
    }
  }
  const hide = banks.length === 0 ? [] : accounts.filter((a) => a.type === "upi" && !a.parentId && !a.archived && GENERIC_UPI.test(a.name.trim())).map((a) => a.id);
  return { add, hide };
}

/** A shorter name for tight places such as the transaction form's chips: "HDFC BizGrow Card" -> "HDFC BizGrow". */
export const shortName = (name: string) => name.replace(/\s+(credit\s+)?card$/i, "").replace(/\s+/g, " ").trim() || name;
