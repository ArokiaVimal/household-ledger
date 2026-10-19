// Recurring Expense Intelligence: spot likely subscriptions and recurring bills in approved history, with rules only (no AI).
// A detection is only a SUGGESTION: nothing is added to Recurring until the person says yes, and "not recurring" is remembered.
// Pure: reads records and existing recurring items, writes nothing.
import { signedSpend } from "./reports";
import { everyOf } from "./recurring";
import type { ExpenseRecord, Paise, RecurringItem } from "./types";

export type Cadence = "monthly" | "bimonthly" | "yearly";
export type Flag = "price_up" | "missing" | "duplicate";
export type Confidence = "high" | "medium" | "low";

export interface Suggestion {
  /** Stable id for dismissing: the normalised merchant plus its cadence. */
  key: string;
  merchant: string;
  cadence: Cadence;
  /** True when the amount is the same each time (within a few percent); false for bills that change (electricity, phone). */
  fixed: boolean;
  /** Typical amount: the median of the payments. */
  amountPaise: Paise;
  lastDate: string;
  lastAmountPaise: Paise;
  /** The date the next payment should land, from the last payment and the cadence. */
  nextExpected: string;
  /** What it costs over a year at this cadence. */
  annualPaise: Paise;
  occurrences: number;
  confidence: Confidence;
  flags: Flag[];
  /** Price change when flagged: from the earlier typical amount to the last payment. */
  priceChange?: { fromPaise: Paise; toPaise: Paise };
  recordIds: string[];
  categoryId: string;
  accountId: string;
  dueDay: number;
}

const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const addDays = (d: string, n: number) => new Date((dayNum(d) + n) * DAY).toISOString().slice(0, 10);
export const normMerchant = (m: string) => m.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const INTERVAL: Record<Cadence, [number, number]> = { monthly: [26, 35], bimonthly: [56, 65], yearly: [355, 376] };
const PERIODS: Record<Cadence, number> = { monthly: 12, bimonthly: 6, yearly: 1 };
const MIN_RUNS: Record<Cadence, number> = { monthly: 3, bimonthly: 3, yearly: 2 };
const MIN_AMOUNT = 2_000; // ignore anything under ₹20: coffee-sized charges are habits, not subscriptions

function cadenceOf(days: number[]): Cadence | null {
  for (const c of ["monthly", "bimonthly", "yearly"] as const) {
    const [lo, hi] = INTERVAL[c];
    if (days.length > 0 && days.every((d) => d >= lo && d <= hi)) return c;
  }
  return null;
}

/** Next date a payment is due: the same day of month as the last one, one period on. */
function nextAfter(last: string, c: Cadence): string {
  const months = c === "monthly" ? 1 : c === "bimonthly" ? 2 : 12;
  const [y, m, d] = last.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

/**
 * Suggestions from approved history. Skips merchants already tracked as a recurring item, payments already linked to one, and
 * anything the person said is not recurring (`dismissed` holds suggestion keys).
 */
export function detectRecurring(records: ExpenseRecord[], items: RecurringItem[], today: string, dismissed: ReadonlySet<string> = new Set()): Suggestion[] {
  const tracked = items.map((i) => normMerchant(i.name)).filter(Boolean);
  const byMerchant = new Map<string, ExpenseRecord[]>();
  for (const r of records) {
    if (r.status !== "reviewed" || r.recurringId || r.excluded || r.paidWithVoucherId || (r.kind !== "purchase" && r.kind !== "fee") || signedSpend(r) <= 0) continue;
    const key = normMerchant(r.merchant);
    if (!key || tracked.some((t) => t === key || t.includes(key) || key.includes(t))) continue;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), r]);
  }
  const out: Suggestion[] = [];
  for (const [mk, rs] of byMerchant) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    // Two charges within a few days at the same amount are a duplicate, not two payments in the pattern.
    const dupes = new Set<string>();
    const kept: ExpenseRecord[] = [];
    for (const r of sorted) {
      const prev = kept[kept.length - 1];
      if (prev && Math.abs(dayNum(r.date) - dayNum(prev.date)) <= 3 && Math.abs(r.amountPaise - prev.amountPaise) <= Math.max(100, prev.amountPaise * 0.02)) dupes.add(r.id); else kept.push(r);
    }
    if (kept.length < 2) continue;
    const gaps = kept.slice(1).map((r, i) => dayNum(r.date) - dayNum(kept[i].date));
    const cadence = cadenceOf(gaps);
    if (!cadence || kept.length < MIN_RUNS[cadence]) continue;
    const amounts = kept.map((r) => r.amountPaise);
    const typical = median(amounts);
    if (typical < MIN_AMOUNT) continue;
    const last = kept[kept.length - 1];
    const earlier = amounts.slice(0, -1);
    const base = median(earlier);
    const fixed = earlier.every((a) => Math.abs(a - base) <= Math.max(2_000, base * 0.05));
    const flags: Flag[] = [];
    let priceChange: Suggestion["priceChange"];
    if (fixed && last.amountPaise > base * 1.05 && last.amountPaise - base >= 1_000) { flags.push("price_up"); priceChange = { fromPaise: base, toPaise: last.amountPaise }; }
    const next = nextAfter(last.date, cadence);
    if (dayNum(today) - dayNum(next) > 5) flags.push("missing");
    if (dupes.size > 0 && sorted.some((r) => dupes.has(r.id) && dayNum(today) - dayNum(r.date) <= 62)) flags.push("duplicate");
    const key = `${mk}|${cadence}`;
    if (dismissed.has(key)) continue;
    out.push({
      key, merchant: last.merchant, cadence, fixed, amountPaise: typical, lastDate: last.date, lastAmountPaise: last.amountPaise, nextExpected: next,
      annualPaise: Math.round((flags.includes("price_up") ? last.amountPaise : fixed ? typical : median(amounts)) * PERIODS[cadence]), occurrences: kept.length,
      confidence: kept.length >= 4 && fixed ? "high" : kept.length >= 3 ? "medium" : "low", flags, ...(priceChange ? { priceChange } : {}),
      recordIds: kept.map((r) => r.id), categoryId: last.categoryId, accountId: last.accountId, dueDay: Math.min(28, Number(last.date.slice(8, 10))),
    });
  }
  return out.sort((a, b) => b.annualPaise - a.annualPaise);
}

export interface TrackedAlert { itemId: string; name: string; flag: Flag; detail: string }

/**
 * Alerts on items already in Recurring: the latest payment is higher than the usual amount, a payment was expected and has not
 * come, or the same item was charged twice in a month.
 */
export function trackedAlerts(items: RecurringItem[], records: ExpenseRecord[], month: string, today: string, status: (item: RecurringItem) => string): TrackedAlert[] {
  const out: TrackedAlert[] = [];
  for (const it of items) {
    const linked = records.filter((r) => r.recurringId === it.id && r.status === "reviewed" && signedSpend(r) > 0).sort((a, b) => a.date.localeCompare(b.date));
    const last = linked[linked.length - 1];
    if (last && !it.amountVaries) {
      const usual = it.expectedPaise;
      if (last.amountPaise > usual * 1.05 && last.amountPaise - usual >= 1_000) out.push({ itemId: it.id, name: it.name, flag: "price_up", detail: `${last.date}: ${last.amountPaise} vs usual ${usual}` });
    }
    const inMonth = linked.filter((r) => r.date.startsWith(month));
    if (inMonth.length >= 2 && inMonth.some((r, i) => i > 0 && Math.abs(r.amountPaise - inMonth[i - 1].amountPaise) <= Math.max(100, r.amountPaise * 0.02) && dayNum(r.date) - dayNum(inMonth[i - 1].date) <= 5)) out.push({ itemId: it.id, name: it.name, flag: "duplicate", detail: `charged more than once in ${month}` });
    if (status(it) === "overdue" && today.slice(0, 7) === month) out.push({ itemId: it.id, name: it.name, flag: "missing", detail: `expected on the ${it.dueDay}` });
  }
  return out;
}

export { addDays, everyOf };
