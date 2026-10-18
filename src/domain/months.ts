/** Month helpers on "YYYY-MM" strings (no Date objects, so no time-zone surprises). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" -> "Oct 2026" */
export const monthLabel = (month: string) => `${NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** True when `month` is after `today`'s month (today is YYYY-MM-DD). */
export const isAfterMonth = (month: string, today: string) => month > today.slice(0, 7);
