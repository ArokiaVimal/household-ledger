import { computeShares } from "./splits";
import { signedSpend } from "./reports";
import type { ExpenseRecord, Paise, Settlement } from "./types";

export interface PairBalance {
  /** Debtor and creditor after netting; outstanding > 0 means `from` owes `to`. */
  from: string;
  to: string;
  owed: Paise; // gross netted amount from expenses
  settled: Paise; // applied settlements
  outstanding: Paise;
}

/**
 * Pairwise balances. An expense creates a debt from each share holder to the
 * payer for their share (not for the payer's own share). Refunds reverse it.
 * Settlements only reduce debts; they never create expenses.
 */
export function pairBalances(records: ExpenseRecord[], settlements: Settlement[]): PairBalance[] {
  const net = new Map<string, Paise>(); // key "a|b" with a<b; positive: a owes b
  const add = (debtor: string, creditor: string, amt: Paise) => {
    if (debtor === creditor || amt === 0) return;
    const [a, b] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const k = `${a}|${b}`;
    net.set(k, (net.get(k) ?? 0) + (debtor === a ? amt : -amt));
  };
  for (const r of records) {
    const v = signedSpend(r);
    if (v === 0) continue;
    const sign = v < 0 ? -1 : 1;
    for (const [pid, share] of Object.entries(computeShares(r.amountPaise, r.split))) {
      add(pid, r.payerId, sign * share);
    }
  }
  const settled = new Map<string, Paise>();
  for (const s of settlements) {
    if (s.voided) continue;
    add(s.fromId, s.toId, -s.amountPaise);
    const [a, b] = s.fromId < s.toId ? [s.fromId, s.toId] : [s.toId, s.fromId];
    const k = `${a}|${b}`;
    settled.set(k, (settled.get(k) ?? 0) + (s.fromId === a ? s.amountPaise : -s.amountPaise));
  }
  const out: PairBalance[] = [];
  for (const [k, v] of net) {
    const [a, b] = k.split("|");
    const st = settled.get(k) ?? 0;
    // owed (before settlements) is outstanding + settled in a's direction
    const owedAB = v + st;
    if (v === 0 && owedAB === 0) continue;
    out.push(
      v >= 0
        ? { from: a, to: b, owed: owedAB, settled: st, outstanding: v }
        : { from: b, to: a, owed: -owedAB, settled: -st, outstanding: -v },
    );
  }
  return out.sort((x, y) => y.outstanding - x.outstanding);
}
