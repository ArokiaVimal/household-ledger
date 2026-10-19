import { signedSpend } from "./reports";
import type { ExpenseRecord, Paise, RecurringItem } from "./types";

export type RecurringState = "paid" | "upcoming" | "overdue" | "ended";

export interface RecurringStatus {
  item: RecurringItem;
  month: string;
  records: ExpenseRecord[];
  /** Net spending recorded against this item in the month (refunds subtract). */
  actualPaise: Paise;
  /** actual - expected. Positive = paid more than expected. */
  variancePaise: Paise;
  state: RecurringState;
  /** Paid only because the user marked it, with no transaction linked. */
  marked: boolean;
}

/**
 * Status of every recurring item for a month. "paid" needs at least one counted
 * record linked to the item in that month. Otherwise it is overdue once the due
 * day has passed on `today` (YYYY-MM-DD), else upcoming. Past months with no
 * payment are overdue; future months are upcoming.
 */
export function recurringStatuses(items: RecurringItem[], records: ExpenseRecord[], month: string, today: string): RecurringStatus[] {
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  return items.map((item) => {
    const linked = records.filter((r) => r.recurringId === item.id && r.date.startsWith(month));
    const actualPaise = linked.reduce((s, r) => s + signedSpend(r), 0);
    const byRecord = linked.some((r) => signedSpend(r) > 0);
    const marked = !byRecord && !!item.paidMonths?.includes(month);
    const paid = byRecord || marked;
    const ended = !!item.until && month > item.until.slice(0, 7);
    const state: RecurringState = ended
      ? "ended"
      : paid
      ? "paid"
      : month < todayMonth || (month === todayMonth && item.dueDay < todayDay)
        ? "overdue"
        : "upcoming";
    return { item, month, records: linked, actualPaise, variancePaise: marked ? 0 : actualPaise - item.expectedPaise, state, marked };
  });
}

/** Expected monthly commitment and the 12-month projection (no float math). */
export function commitmentTotals(items: RecurringItem[], month?: string): { monthlyPaise: Paise; yearlyPaise: Paise } {
  // Items that have ended before `month` no longer commit anything. The yearly figure counts only the months each item still runs.
  const live = month ? items.filter((i) => !i.until || month <= i.until.slice(0, 7)) : items;
  const monthlyPaise = live.reduce((s, i) => s + i.expectedPaise, 0);
  const monthsLeft = (i: RecurringItem) => (month && i.until ? Math.min(12, (Number(i.until.slice(0, 4)) - Number(month.slice(0, 4))) * 12 + Number(i.until.slice(5, 7)) - Number(month.slice(5, 7)) + 1) : 12);
  return { monthlyPaise, yearlyPaise: live.reduce((s, i) => s + i.expectedPaise * monthsLeft(i), 0) };
}
