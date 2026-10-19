import { computeShares } from "./splits";
import type { ExpenseRecord, Paise } from "./types";

/**
 * Single authority for what counts as spending.
 * Purchases and fees add; refunds subtract. Income, transfers and credit-card
 * bill payments are never spending. Excluded records count for nothing.
 */
export function signedSpend(r: ExpenseRecord): Paise {
  if (r.excluded) return 0;
  // Paid with a voucher: the voucher purchase was already the outflow, so this must not count again.
  if (r.paidWithVoucherId) return 0;
  if (r.kind === "purchase" || r.kind === "fee") return r.amountPaise;
  if (r.kind === "refund") return -r.amountPaise;
  return 0;
}

export function isCounted(r: ExpenseRecord): boolean {
  return signedSpend(r) !== 0;
}

/**
 * What a transaction does to who owes whom. Like `signedSpend`, but a purchase paid from a voucher wallet counts here: the person
 * whose wallet it was paid the cash at top-up time, and the others in the split still owe them their shares. Settlements and
 * balances use this; spending totals use `signedSpend`.
 */
export function signedDebt(r: ExpenseRecord): Paise {
  if (r.excluded) return 0;
  if (r.kind === "purchase" || r.kind === "fee") return r.amountPaise;
  if (r.kind === "refund") return -r.amountPaise;
  return 0;
}

/**
 * Signed share of one participant in a record (negative for refunds). For a purchase paid from the payer's voucher wallet, the
 * payer's own share is already counted in the top-up (the cash outflow), so only the other people's shares count here.
 */
export function signedShare(r: ExpenseRecord, participantId: string): Paise {
  if (r.paidWithVoucherId) {
    const d = signedDebt(r);
    if (d === 0 || participantId === r.payerId) return 0;
    return (d < 0 ? -1 : 1) * (computeShares(r.amountPaise, r.split)[participantId] ?? 0);
  }
  const sign = signedSpend(r) < 0 ? -1 : 1;
  if (!isCounted(r)) return 0;
  return sign * (computeShares(r.amountPaise, r.split)[participantId] ?? 0);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export interface Summary {
  grossPurchases: Paise;
  refunds: Paise;
  net: Paise;
  myShare: Paise;
  sharedNet: Paise;
  personalNet: Paise;
  unreviewed: number;
}

export function summarize(records: ExpenseRecord[], myId: string): Summary {
  const s: Summary = { grossPurchases: 0, refunds: 0, net: 0, myShare: 0, sharedNet: 0, personalNet: 0, unreviewed: 0 };
  for (const r of records) {
    if (r.status === "unreviewed") s.unreviewed++;
    // Bought with a voucher wallet: never new spending (the top-up was), but other people's shares of it are theirs to bear.
    if (r.paidWithVoucherId) { s.myShare += signedShare(r, myId); continue; }
    const v = signedSpend(r);
    if (v === 0) continue;
    if (v > 0) s.grossPurchases += v;
    else s.refunds += -v;
    s.net += v;
    if (r.shared) s.sharedNet += v;
    else s.personalNet += v;
    s.myShare += signedShare(r, myId);
  }
  return s;
}

export function groupNet(records: ExpenseRecord[], key: (r: ExpenseRecord) => string): Record<string, Paise> {
  const out: Record<string, Paise> = {};
  for (const r of records) {
    const v = signedSpend(r);
    if (v !== 0) out[key(r)] = (out[key(r)] ?? 0) + v;
  }
  return out;
}

export const byCategory = (rs: ExpenseRecord[]) => groupNet(rs, (r) => r.categoryId);
export const byMerchant = (rs: ExpenseRecord[]) => groupNet(rs, (r) => r.merchant);
export const byMonth = (rs: ExpenseRecord[]) => groupNet(rs, (r) => monthOf(r.date));
