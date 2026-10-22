import { assertPaise } from "./money";
import type { Paise, SplitConfig, SplitItem, SplitMode } from "./types";

export type Shares = Record<string, Paise>;

export class SplitError extends Error {}

/**
 * Equal split. Remainder paise go one each to the first participants in the
 * order given, so results are deterministic and always sum to the total.
 */
export function equalSplit(total: Paise, ids: string[]): Shares {
  assertPaise(total);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  if (new Set(ids).size !== ids.length) throw new SplitError("Duplicate participant");
  const base = Math.floor(total / ids.length);
  const rem = total - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < rem ? 1 : 0)]));
}

/**
 * Percentage split. Percentages are basis points (10000 = 100%) and must sum
 * to exactly 10000. Uses largest-remainder so shares sum to the total; ties
 * are broken by participant order.
 */
export function percentSplit(total: Paise, bps: Record<string, number>): Shares {
  assertPaise(total);
  const ids = Object.keys(bps);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  ids.forEach((id) => {
    if (!Number.isInteger(bps[id]) || bps[id] < 0) throw new SplitError("Invalid percentage");
  });
  const sum = ids.reduce((s, id) => s + bps[id], 0);
  if (sum !== 10000) throw new SplitError("Percentages must total 100%");
  const exact = ids.map((id, i) => {
    const n = total * bps[id];
    return { id, i, floor: Math.floor(n / 10000), frac: n % 10000 };
  });
  let left = total - exact.reduce((s, e) => s + e.floor, 0);
  const order = [...exact].sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out: Shares = {};
  exact.forEach((e) => (out[e.id] = e.floor));
  for (const e of order) {
    if (left <= 0) break;
    out[e.id] += 1;
    left -= 1;
  }
  return out;
}

export function customSplit(total: Paise, amounts: Record<string, Paise>): Shares {
  assertPaise(total);
  const ids = Object.keys(amounts);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  ids.forEach((id) => {
    assertPaise(amounts[id]);
    if (amounts[id] < 0) throw new SplitError("Amounts cannot be negative");
  });
  const sum = ids.reduce((s, id) => s + amounts[id], 0);
  if (sum !== total) throw new SplitError("Custom amounts must equal the expense total");
  return { ...amounts };
}

const ZERO = BigInt(0);
const ONE = BigInt(1);

/**
 * Proportional split with whole-number weights, using exact integer maths (BigInt, so large amounts cannot overflow).
 * Shares always sum to the total; leftover paise go to the largest fractions, ties by order.
 */
export function weightedSplit(total: Paise, weights: Record<string, number>): Shares {
  const ids = Object.keys(weights);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  ids.forEach((id) => { if (!Number.isInteger(weights[id]) || weights[id] < 0) throw new SplitError("Shares must be whole numbers"); });
  const sum = ids.reduce((s, id) => s + BigInt(weights[id]), ZERO);
  if (sum === ZERO) throw new SplitError("Give at least one person a share");
  const t = BigInt(total);
  const rows = ids.map((id, i) => { const n = t * BigInt(weights[id]); return { id, i, floor: n / sum, frac: n % sum }; });
  let left = t - rows.reduce((s, r) => s + r.floor, ZERO);
  const out: Shares = Object.fromEntries(rows.map((r) => [r.id, Number(r.floor)]));
  for (const r of [...rows].sort((a, b) => (b.frac > a.frac ? 1 : b.frac < a.frac ? -1 : a.i - b.i))) {
    if (left <= ZERO) break;
    out[r.id] += 1;
    left -= ONE;
  }
  return out;
}

/** "By shares": 2 shares pay twice what 1 share pays. */
export function sharesSplit(total: Paise, ids: string[], counts: Record<string, number>): Shares {
  assertPaise(total);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  return weightedSplit(total, Object.fromEntries(ids.map((id) => [id, counts[id] ?? 1])));
}

/** "By adjustment": take the adjustments out, split the rest equally, then add each person's adjustment back. */
export function adjustSplit(total: Paise, ids: string[], adj: Record<string, number>): Shares {
  assertPaise(total);
  if (ids.length === 0) throw new SplitError("Select at least one participant");
  ids.forEach((id) => assertPaise(adj[id] ?? 0));
  const rest = total - ids.reduce((s, id) => s + (adj[id] ?? 0), 0);
  if (rest < 0) throw new SplitError("The adjustments add up to more than the total");
  const base = equalSplit(rest, ids);
  const out = Object.fromEntries(ids.map((id) => [id, base[id] + (adj[id] ?? 0)]));
  const neg = ids.find((id) => out[id] < 0);
  if (neg) throw new SplitError("An adjustment makes someone's share negative");
  return out;
}

/** What each person's items came to, before tax, tip and fees. */
export function itemSubtotals(ids: string[], items: SplitItem[]): Shares {
  const sub: Shares = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const it of items) {
    assertPaise(it.amountPaise);
    if (it.amountPaise <= 0) throw new SplitError("Every item needs an amount");
    if (it.participantIds.length === 0) throw new SplitError(`Choose who shared ${it.name || "each item"}`);
    for (const id of it.participantIds) if (!(id in sub)) throw new SplitError("An item is shared with someone who is not in this expense");
    const part = equalSplit(it.amountPaise, it.participantIds);
    for (const id of it.participantIds) sub[id] += part[id];
  }
  return sub;
}

/**
 * Item-wise split. The bill total minus the items is the tax, tip, delivery or discount; it is shared between people in
 * proportion to what their items came to.
 */
export function itemsSplit(total: Paise, ids: string[], items: SplitItem[]): Shares {
  assertPaise(total);
  if (items.length === 0) throw new SplitError("Add at least one item");
  const sub = itemSubtotals(ids, items);
  const itemsTotal = Object.values(sub).reduce((s, v) => s + v, 0);
  const extra = total - itemsTotal;
  const spread = extra === 0 ? Object.fromEntries(ids.map((id) => [id, 0])) : extra > 0 ? weightedSplit(extra, sub) : Object.fromEntries(Object.entries(weightedSplit(-extra, sub)).map(([id, v]) => [id, -v]));
  const out = Object.fromEntries(ids.map((id) => [id, sub[id] + spread[id]]));
  if (ids.some((id) => out[id] < 0)) throw new SplitError("The discount is bigger than someone's items");
  return out;
}

/** What is left of the bill after the items: tax, tip, delivery (positive) or a discount (negative). */
export const itemsExtra = (total: Paise, items: SplitItem[]) => total - items.reduce((s, i) => s + i.amountPaise, 0);

export function computeShares(total: Paise, split: SplitConfig): Shares {
  switch (split.mode) {
    case "personal":
      if (split.participantIds.length !== 1) throw new SplitError("Personal expense needs one participant");
      return { [split.participantIds[0]]: total };
    case "equal":
      return equalSplit(total, split.participantIds);
    case "percent":
      return percentSplit(total, split.values ?? {});
    case "custom":
      return customSplit(total, split.values ?? {});
    case "shares":
      return sharesSplit(total, split.participantIds, split.values ?? {});
    case "adjust":
      return adjustSplit(total, split.participantIds, split.values ?? {});
    case "items":
      return itemsSplit(total, split.participantIds, split.items ?? []);
  }
}

/** Non-throwing validation for forms. Returns an error message or null. */
export function validateSplit(total: Paise, split: SplitConfig): string | null {
  try {
    computeShares(total, split);
    return null;
  } catch (e) {
    if (e instanceof SplitError) return e.message;
    throw e;
  }
}

/** The household's usual two-way ratio: `leaderId` bears `leaderBps` (6400 = 64%), the other person the rest. */
export function ratioSplit(leaderId: string, otherId: string, leaderBps: number): SplitConfig {
  if (!Number.isInteger(leaderBps) || leaderBps <= 0 || leaderBps >= 10000) throw new SplitError("Ratio must be between 0% and 100%");
  return { mode: "percent", participantIds: [leaderId, otherId], values: { [leaderId]: leaderBps, [otherId]: 10000 - leaderBps } };
}

/** True when two configs mean the same split (order of people does not matter). */
export function sameSplit(a: SplitConfig, b: SplitConfig): boolean {
  if (a.mode !== b.mode || !!a.gift !== !!b.gift || a.participantIds.length !== b.participantIds.length) return false;
  if (!a.participantIds.every((id) => b.participantIds.includes(id))) return false;
  if (a.mode === "items") return JSON.stringify(a.items ?? []) === JSON.stringify(b.items ?? []);
  if (a.mode === "percent" || a.mode === "custom" || a.mode === "shares" || a.mode === "adjust") return a.participantIds.every((id) => (a.values?.[id] ?? 0) === (b.values?.[id] ?? 0));
  return true;
}

/**
 * Which way to split is selected when a NEW expense's split sheet opens: the Quick splits button, until a method is chosen.
 * Not when the split is only between you and your linked partner (their usual split is already chosen), not once a method was
 * picked, and not for a split that is not the plain "everyone pays the same" default.
 */
export function quickSplitIsDefault(o: { newExpense: boolean; methodPicked: boolean; mode: SplitMode; gift?: boolean; others: string[]; partnerId?: string | null }): boolean {
  if (!o.newExpense || o.methodPicked || o.mode !== "equal" || o.gift || o.others.length === 0) return false;
  return !(o.others.length === 1 && !!o.partnerId && o.others[0] === o.partnerId);
}

