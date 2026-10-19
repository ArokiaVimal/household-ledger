// Payment Groups: reusable attribution of a transaction's allocated shares to a group, per profile. Pure.
// A group never changes the ledger: it only decides how much of each transaction counts in that lens. Each transaction is attributed
// to a group once (so a group's total never double-counts it), and different groups may each claim a share of the same transaction.
import { signedShare, signedSpend } from "./reports";
import type { ExpenseRecord, Paise, PaymentGroup } from "./types";

/** The group everyone has: your own share plus what you cover for others. Used when none was saved. */
export const MINE_ID = "mine";
export const virtualMine = (): PaymentGroup => ({ id: MINE_ID, name: "Mine", kind: "mine", memberIds: [], coverMembers: false, includeMe: true, order: -1 });

/** The groups to show: saved ones in order, with Mine always present (and first unless the user moved it). */
export function withMine(groups: PaymentGroup[]): PaymentGroup[] {
  const sorted = [...groups].sort((a, b) => (a.order ?? 1e6) - (b.order ?? 1e6) || a.name.localeCompare(b.name));
  return sorted.some((g) => g.kind === "mine") ? sorted : [virtualMine(), ...sorted];
}

export interface Attribution {
  /** What counts in the group for this transaction (negative for refunds). */
  allocatedPaise: Paise;
  /** Your own allocated share of the transaction. */
  myPaise: Paise;
  /** What you paid for other people's shares (only when you are the payer). */
  onBehalfPaise: Paise;
  /** What you actually paid for the whole transaction (only when you are the payer). */
  paidPaise: Paise;
}

/** The people whose shares you cover, across all groups that say so. */
export const coveredIds = (groups: PaymentGroup[], meId: string): Set<string> =>
  new Set(groups.filter((g) => g.kind === "people" && g.coverMembers).flatMap((g) => g.memberIds).filter((id) => id !== meId));

/** How a transaction counts in one group, or null when it does not belong there. */
export function attribute(r: ExpenseRecord, group: PaymentGroup, all: PaymentGroup[], meId: string): Attribution | null {
  const sh = (id: string) => signedShare(r, id);
  const mine = sh(meId);
  const paid = r.payerId === meId ? signedSpend(r) : 0;
  if (group.kind === "mine") {
    const covered = r.payerId === meId ? [...coveredIds(all, meId)].reduce((s, id) => s + sh(id), 0) : 0;
    const allocated = mine + covered;
    return allocated === 0 ? null : { allocatedPaise: allocated, myPaise: mine, onBehalfPaise: covered, paidPaise: paid };
  }
  const others = group.memberIds.filter((id) => id !== meId);
  if (!others.some((id) => sh(id) !== 0 || r.payerId === id)) return null;
  const theirs = others.reduce((s, id) => s + sh(id), 0);
  const allocated = theirs + (group.includeMe ? mine : 0);
  return allocated === 0 ? null : { allocatedPaise: allocated, myPaise: mine, onBehalfPaise: r.payerId === meId ? theirs : 0, paidPaise: paid };
}

export interface GroupSummary { allocated: Paise; my: Paise; onBehalf: Paise; paid: Paise; refunds: Paise; count: number }

/** Totals for a group over records already limited to a month. Each record is counted once. */
export function summarizeGroup(records: ExpenseRecord[], group: PaymentGroup, all: PaymentGroup[], meId: string): GroupSummary {
  const s: GroupSummary = { allocated: 0, my: 0, onBehalf: 0, paid: 0, refunds: 0, count: 0 };
  for (const r of records) {
    const a = attribute(r, group, all, meId);
    if (!a) continue;
    s.count++; s.allocated += a.allocatedPaise; s.my += a.myPaise; s.onBehalf += a.onBehalfPaise; s.paid += a.paidPaise;
    if (a.allocatedPaise < 0) s.refunds += -a.allocatedPaise;
  }
  return s;
}

/** Records that belong to the group, with their attribution. */
export function inGroup(records: ExpenseRecord[], group: PaymentGroup, all: PaymentGroup[], meId: string): { r: ExpenseRecord; a: Attribution }[] {
  return records.flatMap((r) => { const a = attribute(r, group, all, meId); return a ? [{ r, a }] : []; });
}

/** Net allocated amount per key (category, merchant, account…), using each record's attribution in the group. */
export function allocatedBy(records: ExpenseRecord[], group: PaymentGroup, all: PaymentGroup[], meId: string, key: (r: ExpenseRecord) => string): Record<string, Paise> {
  const out: Record<string, Paise> = {};
  for (const { r, a } of inGroup(records, group, all, meId)) out[key(r)] = (out[key(r)] ?? 0) + a.allocatedPaise;
  return out;
}
