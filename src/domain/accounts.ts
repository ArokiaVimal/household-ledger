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

/** What a payment made from this account is paid with: a purchase or fee from a voucher wallet (Amazon Pay) is paid with that voucher, so it never counts again. Undefined for anything else. */
export function impliedVoucherId(account: Account | undefined, kind: string, brands: VoucherBrand[]): string | undefined {
  if (kind !== "purchase" && kind !== "fee") return undefined;
  return walletBrandFor(account, brands)?.id;
}

/**
 * Can the payment method of this transaction be changed? A row read from a statement file belongs to that statement's card, so it
 * is locked with the rest of what the bank wrote. A row from an email, a text message or pasted text had its card worked out (or
 * guessed), and a manual entry is yours: those can be corrected.
 */
export function accountIsEditable(r: { importSource: string; needsCard?: boolean }): boolean {
  return r.importSource === "Manual entry" || !!r.needsCard || /^(Captured message|Pasted text)/.test(r.importSource);
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

/**
 * A very short label for a card in a narrow place: just the bank or issuer ("SBI", "Amex", "HDFC"). When two cards share the same bank,
 * the longer short name is used so they stay apart ("HDFC BizGrow", "HDFC Regalia").
 */
export function cardLabel(name: string, all: { name: string }[]): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const bank = /^american$/i.test(first) ? "Amex" : first;
  const same = all.filter((a) => { const f = a.name.trim().split(/\s+/)[0] ?? ""; return (/^american$/i.test(f) ? "Amex" : f).toLowerCase() === bank.toLowerCase(); }).length;
  return same > 1 ? shortName(name).split(/\s+/).slice(0, 2).join(" ") : bank;
}
