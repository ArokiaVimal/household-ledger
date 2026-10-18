import { assertPaise } from "./money";
import type { Paise, SplitConfig } from "./types";

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
  if (a.mode !== b.mode || a.participantIds.length !== b.participantIds.length) return false;
  if (!a.participantIds.every((id) => b.participantIds.includes(id))) return false;
  if (a.mode === "percent" || a.mode === "custom") return a.participantIds.every((id) => (a.values?.[id] ?? 0) === (b.values?.[id] ?? 0));
  return true;
}
