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

/** Signed share of one participant in a record (negative for refunds). */
export function signedShare(r: ExpenseRecord, participantId: string): Paise {
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
