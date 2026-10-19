// Voucher tracking. A voucher purchase (say ₹10,000 of Amazon vouchers bought through Shopwise on Amex) is ONE cash outflow:
// it is the transaction on the card, attributed to a brand. Spending a voucher later (an order paid with the voucher) is not a
// new outflow, so it never counts in spending totals; it only shows how the voucher was used. Purchases never equal spending.
// "Remaining" is shown only when it can be reliable: a balance you read off the brand's own app, or a brand where you record
// every use. Pure functions over records and brands.
import { signedSpend } from "./reports";
import type { Account, ExpenseRecord, Paise, VoucherBrand } from "./types";

/** Statement descriptors of voucher sellers we know about, shown under a friendly merchant name. The original text is never changed. */
export const KNOWN_VOUCHER_SELLERS: { pattern: RegExp; name: string }[] = [{ pattern: /cust\s*cap\s*solutions?/i, name: "Shopwise" }];

export function knownVoucherSeller(description: string): string | null {
  return KNOWN_VOUCHER_SELLERS.find((s) => s.pattern.test(description))?.name ?? null;
}

const counted = (r: ExpenseRecord) => r.status === "reviewed" && !r.excluded;
/**
 * A voucher purchase: a brand is chosen, it was flagged at import, or the statement text is a known voucher seller (so rows
 * imported before voucher tracking existed are recognised too). Spending paid with a voucher is never a voucher purchase.
 */
export const isVoucherPurchase = (r: ExpenseRecord) => r.kind === "purchase" && !r.paidWithVoucherId && (!!r.voucherBrandId || !!r.voucherPending || !!knownVoucherSeller(r.originalDescription));
/** A voucher purchase whose brand has not been chosen yet. */
export const needsVoucherBrand = (r: ExpenseRecord) => isVoucherPurchase(r) && !r.voucherBrandId;
const month = (d: string) => d.slice(0, 7);

export interface Remaining { amountPaise: Paise; basis: "balance" | "tracked"; /** Uses are larger than purchases and balance explain, so the figure cannot be right. */ inconsistent: boolean }
export interface BrandSummary {
  brand: VoucherBrand;
  month: { purchasedPaise: Paise; purchases: number; usedPaise: Paise; uses: number };
  total: { purchasedPaise: Paise; usedPaise: Paise };
  /** Null when there is no reliable basis: the app never guesses. */
  remaining: Remaining | null;
}

/** Remaining value, only from a balance you recorded or a brand where you record every use. */
export function remainingFor(brand: VoucherBrand, purchases: ExpenseRecord[], uses: ExpenseRecord[]): Remaining | null {
  const sum = (rs: ExpenseRecord[]) => rs.reduce((s, r) => s + r.amountPaise, 0);
  if (brand.balance) {
    const after = (r: ExpenseRecord) => r.date > brand.balance!.asOf;
    const amountPaise = brand.balance.amountPaise + sum(purchases.filter(after)) - sum(uses.filter(after));
    return { amountPaise: Math.max(0, amountPaise), basis: "balance", inconsistent: amountPaise < 0 };
  }
  if (brand.tracksAllUse) {
    const amountPaise = sum(purchases) - sum(uses);
    return { amountPaise: Math.max(0, amountPaise), basis: "tracked", inconsistent: amountPaise < 0 };
  }
  return null;
}

export function brandSummaries(brands: VoucherBrand[], records: ExpenseRecord[], forMonth: string): { brands: BrandSummary[]; unassigned: { purchasedPaise: Paise; purchases: number } } {
  const ok = records.filter(counted);
  const out: BrandSummary[] = brands.map((brand) => {
    const purchases = ok.filter((r) => r.voucherBrandId === brand.id && r.kind === "purchase");
    const uses = ok.filter((r) => r.paidWithVoucherId === brand.id);
    const inMonth = (rs: ExpenseRecord[]) => rs.filter((r) => month(r.date) === forMonth);
    const sum = (rs: ExpenseRecord[]) => rs.reduce((s, r) => s + r.amountPaise, 0);
    return {
      brand,
      month: { purchasedPaise: sum(inMonth(purchases)), purchases: inMonth(purchases).length, usedPaise: sum(inMonth(uses)), uses: inMonth(uses).length },
      total: { purchasedPaise: sum(purchases), usedPaise: sum(uses) },
      remaining: remainingFor(brand, purchases, uses),
    };
  });
  const pending = ok.filter((r) => needsVoucherBrand(r) && month(r.date) === forMonth);
  return { brands: out, unassigned: { purchasedPaise: pending.reduce((s, r) => s + r.amountPaise, 0), purchases: pending.length } };
}

/** Purchased per brand for each month (newest first), for the month-by-month view. */
export function monthlyPurchases(brands: VoucherBrand[], records: ExpenseRecord[]): { month: string; byBrand: Record<string, Paise>; unassigned: Paise; total: Paise }[] {
  const rows = new Map<string, { byBrand: Record<string, Paise>; unassigned: Paise }>();
  for (const r of records.filter(counted).filter(isVoucherPurchase)) {
    const row = rows.get(month(r.date)) ?? { byBrand: {}, unassigned: 0 };
    if (r.voucherBrandId && brands.some((b) => b.id === r.voucherBrandId)) row.byBrand[r.voucherBrandId] = (row.byBrand[r.voucherBrandId] ?? 0) + r.amountPaise;
    else row.unassigned += r.amountPaise;
    rows.set(month(r.date), row);
  }
  return [...rows].sort((a, b) => b[0].localeCompare(a[0])).map(([m, v]) => ({ month: m, ...v, total: Object.values(v.byBrand).reduce((s, x) => s + x, 0) + v.unassigned }));
}

export interface TreeNode { id: string; label: string; totalPaise: Paise; count: number; children: TreeNode[]; records: ExpenseRecord[] }

/** Payment method → merchant → voucher brand → transactions, for the voucher purchases of one month. */
export function voucherTree(records: ExpenseRecord[], accounts: Account[], brands: VoucherBrand[], forMonth: string, accountId?: string): TreeNode[] {
  const rs = records.filter(counted).filter(isVoucherPurchase).filter((r) => month(r.date) === forMonth && (!accountId || r.accountId === accountId));
  const node = (id: string, label: string): TreeNode => ({ id, label, totalPaise: 0, count: 0, children: [], records: [] });
  const roots = new Map<string, TreeNode>();
  for (const r of rs) {
    const acct = roots.get(r.accountId) ?? node(r.accountId, accounts.find((a) => a.id === r.accountId)?.name ?? r.accountId);
    roots.set(r.accountId, acct);
    const mKey = `${r.accountId}|${r.merchant.toLowerCase()}`;
    let m = acct.children.find((c) => c.id === mKey);
    if (!m) { m = node(mKey, r.merchant); acct.children.push(m); }
    const bKey = `${mKey}|${r.voucherBrandId ?? "none"}`;
    let b = m.children.find((c) => c.id === bKey);
    if (!b) { b = node(bKey, brands.find((x) => x.id === r.voucherBrandId)?.name ?? "Needs a voucher brand"); m.children.push(b); }
    for (const n of [acct, m, b]) { n.totalPaise += r.amountPaise; n.count++; }
    b.records.push(r);
  }
  const sort = (n: TreeNode) => { n.children.sort((x, y) => y.totalPaise - x.totalPaise); n.records.sort((x, y) => y.date.localeCompare(x.date)); n.children.forEach(sort); };
  const out = [...roots.values()].sort((x, y) => y.totalPaise - x.totalPaise);
  out.forEach(sort);
  return out;
}

export interface Reconciliation { accountId: string; merchant: string; outflowPaise: Paise; attributedPaise: Paise; waitingPaise: Paise; /** Same merchant on the same card this month that is not marked as a voucher purchase at all. */ unmarkedPaise: Paise; unmarkedCount: number }

/**
 * Does every rupee paid to a voucher seller this month sit under a brand? Outflow = what left the card for vouchers (counted once).
 * Attributed = under a brand. Waiting = "decide later". Unmarked = the same merchant's other transactions, which may be vouchers too.
 */
export function reconcileVouchers(records: ExpenseRecord[], forMonth: string): Reconciliation[] {
  const ok = records.filter(counted).filter((r) => month(r.date) === forMonth && r.kind === "purchase");
  const groups = new Map<string, Reconciliation>();
  for (const r of ok.filter(isVoucherPurchase)) {
    const key = `${r.accountId}|${r.merchant.toLowerCase()}`;
    const g = groups.get(key) ?? { accountId: r.accountId, merchant: r.merchant, outflowPaise: 0, attributedPaise: 0, waitingPaise: 0, unmarkedPaise: 0, unmarkedCount: 0 };
    g.outflowPaise += r.amountPaise;
    if (r.voucherBrandId) g.attributedPaise += r.amountPaise; else g.waitingPaise += r.amountPaise;
    groups.set(key, g);
  }
  for (const r of ok.filter((x) => !isVoucherPurchase(x) && !x.paidWithVoucherId)) {
    const g = groups.get(`${r.accountId}|${r.merchant.toLowerCase()}`);
    if (g) { g.unmarkedPaise += r.amountPaise; g.unmarkedCount++; }
  }
  return [...groups.values()].sort((a, b) => b.outflowPaise - a.outflowPaise);
}

/** Total cash that left for vouchers in a month. Counted once, from the purchases. Uses of vouchers are not in it. */
export const voucherOutflow = (records: ExpenseRecord[], forMonth: string): Paise => records.filter((r) => counted(r) && isVoucherPurchase(r) && month(r.date) === forMonth).reduce((s, r) => s + signedSpend(r), 0);
