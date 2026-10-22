// Calendar helpers on "YYYY-MM-DD" and "YYYY-MM" strings (no local-time Date objects, so no time-zone surprises). Pure.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? "";
export const monthTitle = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;
export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The date `days` after (or before, when negative) a date. */
export const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Days in a month, "YYYY-MM". */
export const daysInMonth = (month: string): number => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/**
 * The weeks of a month for a Sunday-first calendar: arrays of 7, with null for the empty cells before the 1st and after the last day.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).getUTCDay();
  const cells: (string | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
