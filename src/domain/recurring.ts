import { shiftMonth } from "./months";
import { signedSpend } from "./reports";
import type { ExpenseRecord, Paise, RecurringItem } from "./types";

export type RecurringState = "paid" | "upcoming" | "overdue" | "ended" | "notdue";

export interface RecurringStatus {
  item: RecurringItem;
  month: string;
  records: ExpenseRecord[];
  /** Net spending recorded against this item in the month (refunds subtract). */
  actualPaise: Paise;
  /** What this month's bill is expected to be: the planned amount for the month, or an estimate from the last bill when the amount varies. */
  expectedPaise: Paise;
  /** True when `expectedPaise` is an estimate from the last bill rather than a fixed amount. */
  estimated: boolean;
  /** actual - expected. Positive = paid more than expected. */
  variancePaise: Paise;
  state: RecurringState;
  /** Paid only because the user marked it, with no transaction linked. */
  marked: boolean;
  /** For a bill that is not due this month: the next month it is billed (YYYY-MM). */
  nextDue?: string;
}

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
export const everyOf = (item: RecurringItem) => item.everyMonths && item.everyMonths > 1 ? item.everyMonths : 1;

/** Has it ended before this month? (`until` is the last month it applies.) */
export const hasEnded = (item: RecurringItem, month: string) => !!item.until && month > item.until.slice(0, 7);

/** Is `month` one of its billing months? Every month for a monthly item; for "every N months", counted from its start month. */
export function isDueMonth(item: RecurringItem, month: string): boolean {
  const n = everyOf(item);
  if (n === 1) return true;
  const start = item.startMonth ?? month;
  return month >= start && (monthIndex(month) - monthIndex(start)) % n === 0;
}

/** The planned amount for a month: the latest change (a rent increase) that has started, else the original amount. */
export function plannedFor(item: RecurringItem, month: string): Paise {
  const hit = [...(item.changes ?? [])].filter((c) => c.from <= month).sort((a, b) => b.from.localeCompare(a.from))[0];
  return hit ? hit.paise : item.expectedPaise;
}

/** Next billing month after `month` (within five years), or undefined when it has ended by then. */
function nextDueAfter(item: RecurringItem, month: string): string | undefined {
  for (let i = 1; i <= 60; i++) {
    const m = shiftMonth(month, i);
    if (hasEnded(item, m)) return undefined;
    if (isDueMonth(item, m)) return m;
  }
  return undefined;
}

/**
 * Status of every recurring item for a month. "paid" needs at least one counted record linked to the item in that month, or a
 * month the user marked paid by hand. A bill that is not billed this month is "notdue" and one past its last month is "ended".
 * Otherwise it is overdue once the due day has passed on `today` (YYYY-MM-DD), else upcoming.
 * For items whose amount varies, the expectation is the last linked bill before the month.
 */
export function recurringStatuses(items: RecurringItem[], records: ExpenseRecord[], month: string, today: string): RecurringStatus[] {
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  return items.map((item) => {
    const linked = records.filter((r) => r.recurringId === item.id && r.date.startsWith(month));
    // Money coming in is "received" by an income record; money going out is "paid" by a counted purchase.
    const amountOf = (r: ExpenseRecord) => (item.direction === "in" ? (r.kind === "income" && !r.excluded ? r.amountPaise : 0) : signedSpend(r));
    const actualPaise = linked.reduce((s, r) => s + amountOf(r), 0);
    const byRecord = linked.some((r) => amountOf(r) > 0);
    const marked = !byRecord && !!item.paidMonths?.includes(month);
    const paid = byRecord || marked;
    const ended = hasEnded(item, month);
    const due = isDueMonth(item, month);
    let expectedPaise = plannedFor(item, month);
    let estimated = false;
    if (item.amountVaries) {
      const last = records.filter((r) => r.recurringId === item.id && r.date.slice(0, 7) < month && amountOf(r) > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) { expectedPaise = amountOf(last); estimated = true; }
    }
    const state: RecurringState = ended ? "ended" : paid ? "paid" : !due ? "notdue"
      : month < todayMonth || (month === todayMonth && item.dueDay < todayDay) ? "overdue" : "upcoming";
    return { item, month, records: linked, actualPaise, expectedPaise, estimated, variancePaise: marked || !byRecord ? 0 : actualPaise - expectedPaise, state, marked, ...(state === "notdue" ? { nextDue: nextDueAfter(item, month) } : {}) };
  });
}

/**
 * What is committed this month, and over the next twelve months. Months an item is not billed, or after it has ended, add nothing.
 * Without a month it is the plain monthly sum times twelve.
 */
export function commitmentTotals(all: RecurringItem[], month?: string): { monthlyPaise: Paise; yearlyPaise: Paise } {
  const items = all.filter((i) => i.direction !== "in"); // expected income is not a commitment
  if (!month) {
    const sum = items.reduce((s, i) => s + i.expectedPaise, 0);
    return { monthlyPaise: sum, yearlyPaise: sum * 12 };
  }
  const inMonth = (m: string) => items.filter((i) => !hasEnded(i, m) && isDueMonth(i, m)).reduce((s, i) => s + plannedFor(i, m), 0);
  let yearly = 0;
  for (let i = 0; i < 12; i++) yearly += inMonth(shiftMonth(month, i));
  return { monthlyPaise: inMonth(month), yearlyPaise: yearly };
}
