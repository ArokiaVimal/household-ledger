// Split Groups: balances and "who pays whom" for an occasion shared by several contacts. Pure.
// A group never owns money: its expenses are ordinary ledger records tagged with `splitGroupId`, and its settlements only move balances.
// Only reviewed, counted records take part, so nothing from an import counts until it was approved, and spending is never double counted.
import { signedDebt } from "./reports";
import { computeShares } from "./splits";
import type { ExpenseRecord, Paise, SplitGroup, SplitSettlement } from "./types";

export const SPLIT_GROUP_NAME_MAX = 40;
export const MIN_PEOPLE = 2;

/** One expense of a group as the balances see it: who paid, and what each person's share came to (refunds are negative). */
export interface GroupExpense {
  record: ExpenseRecord;
  payerId: string;
  /** The whole amount, signed. */
  totalPaise: Paise;
  /** Each person's share, signed. Adds up to `totalPaise`. */
  shares: Record<string, Paise>;
}

/** Tagged records that count: reviewed, not excluded, and a kind that can create a debt. Oldest first. */
export function groupExpenses(records: ExpenseRecord[], groupId: string): GroupExpense[] {
  const out: GroupExpense[] = [];
  for (const r of records) {
    if (r.splitGroupId !== groupId || r.status !== "reviewed") continue;
    const total = signedDebt(r);
    if (total === 0) continue;
    const sign = total < 0 ? -1 : 1;
    const shares = Object.fromEntries(Object.entries(computeShares(r.amountPaise, r.split)).map(([id, v]) => [id, sign * v]));
    out.push({ record: r, payerId: r.payerId, totalPaise: total, shares });
  }
  return out.sort((a, b) => a.record.date.localeCompare(b.record.date) || a.record.id.localeCompare(b.record.id));
}

/** Tagged records still waiting for review: they do not count until approved. */
export const waitingForReview = (records: ExpenseRecord[], groupId: string): number => records.filter((r) => r.splitGroupId === groupId && r.status === "unreviewed").length;

export interface PersonBalance {
  id: string;
  /** What they paid out for the group. */
  paidPaise: Paise;
  /** What the group's expenses cost them. */
  sharePaise: Paise;
  /** Payments they made to others, minus payments they received, inside the group. */
  settledPaise: Paise;
  /** Positive: the group owes them this. Negative: they owe the group. Zero: even. */
  balancePaise: Paise;
}

export interface GroupBalances {
  /** Everyone in the group, plus anyone who turns up in its expenses or payments. Group order first. */
  people: PersonBalance[];
  /** What the group spent in total (refunds taken off). */
  totalPaise: Paise;
  expenseCount: number;
}

/** Balances of a group. balance = paid − share + (payments made − payments received). The balances always add up to zero. */
export function groupBalances(group: Pick<SplitGroup, "id" | "participantIds">, records: ExpenseRecord[], settlements: SplitSettlement[]): GroupBalances {
  const by = new Map<string, PersonBalance>();
  const person = (id: string) => { let p = by.get(id); if (!p) { p = { id, paidPaise: 0, sharePaise: 0, settledPaise: 0, balancePaise: 0 }; by.set(id, p); } return p; };
  for (const id of group.participantIds) person(id);
  const expenses = groupExpenses(records, group.id);
  for (const e of expenses) {
    person(e.payerId).paidPaise += e.totalPaise;
    for (const [id, v] of Object.entries(e.shares)) person(id).sharePaise += v;
  }
  for (const s of settlements) {
    if (s.groupId !== group.id || s.voided) continue;
    person(s.fromId).settledPaise += s.amountPaise;
    person(s.toId).settledPaise -= s.amountPaise;
  }
  const people = [...by.values()].map((p) => ({ ...p, balancePaise: p.paidPaise - p.sharePaise + p.settledPaise }));
  return { people, totalPaise: expenses.reduce((s, e) => s + e.totalPaise, 0), expenseCount: expenses.length };
}

export interface Transfer { fromId: string; toId: string; amountPaise: Paise }

/** The most people for which the fewest-payments search is exact (2^n subsets). Larger groups use the simple greedy way, which is never far off. */
const EXACT_LIMIT = 16;

/** Greedy settle-up for a set of balances: the biggest debtor pays the biggest creditor, until everyone is even. */
function greedy(balances: [string, Paise][]): Transfer[] {
  const debtors = balances.filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }));
  const creditors = balances.filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }));
  const order = (a: { id: string; left: number }, b: { id: string; left: number }) => b.left - a.left || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(order); creditors.sort(order);
    const d = debtors[0], c = creditors[0];
    const amt = Math.min(d.left, c.left);
    out.push({ fromId: d.id, toId: c.id, amountPaise: amt });
    d.left -= amt; c.left -= amt;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/**
 * Who pays whom so that everyone ends up even, with as few payments as possible. People who are even are left out. A group of n people
 * with a balance never needs more than n − 1 payments; when some of them settle among themselves it needs fewer, and this finds those
 * smaller circles exactly (for groups up to 16 people with a balance). The balances must add up to zero.
 */
export function suggestSettlements(balances: Record<string, Paise>): Transfer[] {
  const people = Object.entries(balances).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (people.reduce((s, [, v]) => s + v, 0) !== 0) throw new Error("Balances must add up to zero");
  const n = people.length;
  if (n === 0) return [];
  if (n > EXACT_LIMIT) return greedy(people);
  // Largest number of disjoint circles that cancel out on their own: each circle of k people needs k − 1 payments.
  const full = (1 << n) - 1;
  const sum = new Float64Array(1 << n);
  for (let m = 1; m <= full; m++) { const low = 31 - Math.clz32(m & -m); sum[m] = sum[m & (m - 1)] + people[low][1]; }
  const best = new Int8Array(1 << n);
  const via = new Int8Array(1 << n);
  for (let m = 1; m <= full; m++) {
    let top = -1, pick = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) { const v = best[m ^ (1 << i)]; if (v > top) { top = v; pick = i; } }
    best[m] = top + (sum[m] === 0 ? 1 : 0);
    via[m] = pick;
  }
  // Walk back through the chosen order; every prefix that sums to zero closes a circle.
  const order: number[] = [];
  for (let m = full; m > 0; m ^= 1 << via[m]) order.push(via[m]);
  order.reverse();
  const out: Transfer[] = [];
  let circle: [string, Paise][] = [], running = 0;
  for (const i of order) {
    circle.push(people[i]); running += people[i][1];
    if (running === 0) { out.push(...greedy(circle)); circle = []; }
  }
  return out;
}

/** The payments that would clear a group, from its own balances. */
export const settleUp = (b: GroupBalances): Transfer[] => suggestSettlements(Object.fromEntries(b.people.map((p) => [p.id, p.balancePaise])));

/** Why a group cannot be saved as typed, or null when it is fine. `others` are the other groups (names stay unique). */
export function checkSplitGroup(draft: { name: string; participantIds: string[] }, others: SplitGroup[]): string | null {
  const name = draft.name.replace(/\s+/g, " ").trim();
  if (!name) return "Give the group a name.";
  if (name.length > SPLIT_GROUP_NAME_MAX) return `Keep the name under ${SPLIT_GROUP_NAME_MAX} characters.`;
  if (others.some((g) => g.name.toLowerCase() === name.toLowerCase())) return "You already have a group with that name.";
  if (new Set(draft.participantIds).size !== draft.participantIds.length) return "Someone is in the group twice.";
  if (draft.participantIds.length < MIN_PEOPLE) return "A group needs at least two people.";
  return null;
}

/** People who have taken part in the group's expenses or payments (so they cannot be removed from it). Includes unreviewed tags. */
export function peopleInUse(groupId: string, records: ExpenseRecord[], settlements: SplitSettlement[]): Set<string> {
  const used = new Set<string>();
  for (const r of records) {
    if (r.splitGroupId !== groupId) continue;
    used.add(r.payerId);
    for (const id of r.split.participantIds) used.add(id);
  }
  for (const s of settlements) if (s.groupId === groupId && !s.voided) { used.add(s.fromId); used.add(s.toId); }
  return used;
}

/** Why an expense cannot belong to a group, or null. The payer and everyone in the split must be in the group, and it must count as spending or a refund. */
export function checkGroupExpense(group: SplitGroup, r: Pick<ExpenseRecord, "payerId" | "kind" | "split">, nameOf: (id: string) => string = (id) => id): string | null {
  if (r.kind !== "purchase" && r.kind !== "refund" && r.kind !== "fee") return "Only purchases, refunds and fees can belong to a group.";
  for (const id of [r.payerId, ...r.split.participantIds]) if (!group.participantIds.includes(id)) return `${nameOf(id)} is not in ${group.name}. Add them to the group first.`;
  return null;
}
