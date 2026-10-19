import { signedSpend } from "./reports";
import { computeShares } from "./splits";
import type { ExpenseRecord, Paise, Settlement } from "./types";

/** One shared payment between you and one other person. */
export interface LedgerEntry {
  record: ExpenseRecord;
  /** Positive: they owe you this share. Negative: you owe them. (Refunds flip the sign.) */
  sharePaise: Paise;
  /** The settlement that paid this off, when there is one. */
  settlementId?: string;
}

export interface PersonLedger {
  personId: string;
  /** Payments not yet settled, newest first. */
  open: LedgerEntry[];
  settled: LedgerEntry[];
  /** After all settlements. Positive: they owe you. Negative: you owe them. */
  outstandingPaise: Paise;
  /** Part of the balance that no listed payment explains (a plain-amount settlement made earlier). */
  unlinkedPaise: Paise;
}

const involves = (s: Settlement, a: string, b: string) => (s.fromId === a && s.toId === b) || (s.fromId === b && s.toId === a);

/** Every shared payment between `meId` and `personId`, what is settled, and what is still owed. */
export function personLedger(personId: string, meId: string, records: ExpenseRecord[], settlements: Settlement[]): PersonLedger {
  const live = settlements.filter((s) => !s.voided && involves(s, meId, personId));
  const paidBy = new Map<string, string>();
  for (const s of live) for (const id of s.recordIds ?? []) paidBy.set(id, s.id);

  const entries: LedgerEntry[] = [];
  for (const r of records) {
    const v = signedSpend(r);
    if (v === 0) continue;
    const sign = v < 0 ? -1 : 1;
    const shares = computeShares(r.amountPaise, r.split);
    let share = 0;
    if (r.payerId === meId && shares[personId]) share = sign * shares[personId];
    else if (r.payerId === personId && shares[meId]) share = -sign * shares[meId];
    if (share !== 0) entries.push({ record: r, sharePaise: share, settlementId: paidBy.get(r.id) });
  }
  entries.sort((a, b) => b.record.date.localeCompare(a.record.date) || a.record.id.localeCompare(b.record.id));

  // What they owe you, minus what they paid you, plus what you paid them.
  const owed = entries.reduce((s, e) => s + e.sharePaise, 0);
  const paid = live.reduce((s, x) => s + (x.fromId === personId ? x.amountPaise : -x.amountPaise), 0);
  const outstanding = owed - paid;
  const open = entries.filter((e) => !e.settlementId);
  return { personId, open, settled: entries.filter((e) => !!e.settlementId), outstandingPaise: outstanding, unlinkedPaise: outstanding - open.reduce((s, e) => s + e.sharePaise, 0) };
}

/** The settlement that clears `entries`: the person who owes pays the other, the net amount. Null when they cancel out. */
export function settlementFor(personId: string, meId: string, entries: LedgerEntry[], amountOverride?: Paise): { fromId: string; toId: string; amountPaise: Paise; recordIds: string[] } | null {
  const net = amountOverride ?? entries.reduce((s, e) => s + e.sharePaise, 0);
  if (net === 0) return null;
  const [fromId, toId] = net > 0 ? [personId, meId] : [meId, personId];
  return { fromId, toId, amountPaise: Math.abs(net), recordIds: entries.map((e) => e.record.id) };
}
