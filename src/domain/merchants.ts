// Merchant suggestions for the add-expense form, ranked from the person's own approved history. The few "common" names below are only
// a starting point for someone with little history: they drop out of the suggestions as soon as real merchants fill the list.
import type { ExpenseRecord } from "./types";

export const COMMON_MERCHANTS = ["Zepto", "Swiggy", "Instamart", "Amazon"] as const;

export interface MerchantInfo { name: string; count: number; lastDate: string; categoryId?: string }
export interface MerchantSuggestions {
  /** The last distinct merchants paid, newest first. */
  recent: MerchantInfo[];
  /** The most used merchants that are not already in `recent`. */
  frequent: MerchantInfo[];
  /** Common names to start from; only when there is little history of your own. */
  popular: string[];
  /** Every known merchant, A to Z. */
  all: MerchantInfo[];
}

const key = (s: string) => s.trim().toLowerCase();

/** Merchants of purchases and fees in `records`, newest and most used first. Pass approved records; rows still in review can be added after. */
export function rankMerchants(records: ExpenseRecord[], opts: { recent?: number; frequent?: number; startAt?: number } = {}): MerchantSuggestions {
  const nRecent = opts.recent ?? 5, nFrequent = opts.frequent ?? 5, startAt = opts.startAt ?? 6;
  const byKey = new Map<string, MerchantInfo>();
  const sorted = [...records].filter((r) => (r.kind === "purchase" || r.kind === "fee") && r.merchant.trim()).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  for (const r of sorted) {
    const k = key(r.merchant);
    const cur = byKey.get(k);
    if (cur) cur.count++; else byKey.set(k, { name: r.merchant.trim(), count: 1, lastDate: r.date, categoryId: r.categoryId });
  }
  const all = [...byKey.values()];
  const recent = [...all].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name)).slice(0, nRecent);
  const inRecent = new Set(recent.map((m) => key(m.name)));
  const frequent = [...all].filter((m) => !inRecent.has(key(m.name)) && m.count >= 2).sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)).slice(0, nFrequent);
  const shown = new Set([...recent, ...frequent].map((m) => key(m.name)));
  const popular = recent.length + frequent.length >= startAt ? [] : COMMON_MERCHANTS.filter((m) => !shown.has(key(m)));
  return { recent, frequent, popular, all: all.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Matches for the search box: known merchants and the common names, best (most used) first. */
export function searchMerchants(s: MerchantSuggestions, q: string): { name: string; categoryId?: string; known: boolean }[] {
  const needle = key(q);
  if (!needle) return [];
  const known = s.all.filter((m) => key(m.name).includes(needle)).sort((a, b) => Number(key(b.name).startsWith(needle)) - Number(key(a.name).startsWith(needle)) || b.count - a.count).map((m) => ({ name: m.name, categoryId: m.categoryId, known: true }));
  const have = new Set(known.map((m) => key(m.name)));
  const common = COMMON_MERCHANTS.filter((m) => key(m).includes(needle) && !have.has(key(m))).map((m) => ({ name: m as string, known: false }));
  return [...known, ...common];
}
