/** Month helpers on "YYYY-MM" strings (no Date objects, so no time-zone surprises). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" -> "Oct 2026" */
export const monthLabel = (month: string) => `${NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/**
 * The month to open on: this month if it has any data, otherwise the latest month that does (preferring one that is not in
 * the future), otherwise this month. Stops a September statement from looking "empty" when it is opened in October.
 */
export function pickMonth(today: string, dates: string[]): string {
  const current = today.slice(0, 7);
  const months = [...new Set(dates.map((d) => d.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort();
  if (months.length === 0 || months.includes(current)) return current;
  return [...months].reverse().find((m) => m <= current) ?? months[months.length - 1];
}

/** True when `month` is after `today`'s month (today is YYYY-MM-DD). */
export const isAfterMonth = (month: string, today: string) => month > today.slice(0, 7);
