import { signedSpend } from "./reports";
import type { ExpenseRecord, Paise, RecurringItem } from "./types";

export type RecurringState = "paid" | "upcoming" | "overdue";

export interface RecurringStatus {
  item: RecurringItem;
  month: string;
  records: ExpenseRecord[];
  /** Net spending recorded against this item in the month (refunds subtract). */
  actualPaise: Paise;
  /** actual - expected. Positive = paid more than expected. */
  variancePaise: Paise;
  state: RecurringState;
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
    const paid = linked.some((r) => signedSpend(r) > 0);
    const state: RecurringState = paid
      ? "paid"
      : month < todayMonth || (month === todayMonth && item.dueDay < todayDay)
        ? "overdue"
        : "upcoming";
    return { item, month, records: linked, actualPaise, variancePaise: actualPaise - item.expectedPaise, state };
  });
}

/** Expected monthly commitment and the 12-month projection (no float math). */
export function commitmentTotals(items: RecurringItem[]): { monthlyPaise: Paise; yearlyPaise: Paise } {
  const monthlyPaise = items.reduce((s, i) => s + i.expectedPaise, 0);
  return { monthlyPaise, yearlyPaise: monthlyPaise * 12 };
}
