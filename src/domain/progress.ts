// How much of a month's transactions you have verified. Pure.
import type { ExpenseRecord } from "./types";

export interface VerifyProgress { verified: number; total: number; left: number; /** 0 to 100, rounded down so it never reads 100 while something is left. */ pct: number }

/** Verified versus all transactions dated in `month` (YYYY-MM), across every payment method and group. */
export function verifyProgress(records: Pick<ExpenseRecord, "date" | "status">[], month: string): VerifyProgress {
  const inMonth = records.filter((r) => r.date.startsWith(month));
  const verified = inMonth.filter((r) => r.status === "reviewed").length;
  const total = inMonth.length;
  return { verified, total, left: total - verified, pct: total === 0 ? 100 : Math.floor((verified / total) * 100) };
}
