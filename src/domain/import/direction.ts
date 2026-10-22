import type { Account } from "../types";

/**
 * A reader that is guessing (Claude reading a layout we have no native reader for) can get the direction of every row wrong at once.
 * On a credit card, purchases are the normal case and money in is the exception, so a file where EVERY row came out as money in
 * is almost certainly misread. Returns a plain warning to show before anything is saved, or null.
 */
export function directionWarning(rows: { direction: "debit" | "credit" }[], account: Pick<Account, "type"> | undefined): string | null {
  if (!account || account.type !== "credit_card" || rows.length < 3) return null;
  if (rows.some((r) => r.direction === "debit")) return null;
  return `Every one of the ${rows.length} rows was read as money in. On a credit card most rows are purchases (out), so the direction is probably wrong. Do not send this to review: import the statement as a CSV or Excel file, or ask for a native reader for this bank.`;
}
