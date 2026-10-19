// Spotting monthly commitments on a statement: EMIs, loan instalments, rent, insurance premiums, SIPs, subscriptions and
// auto-debits. A hint only ever pre-selects "Repeat every month" in the review form; nothing is created until you approve.
import { memoryKey } from "../memory";
import type { ExpenseRecord, TxnKind } from "../types";

const COMMITMENT = /\b(emi|equated|loan|instal?lment|nach|ecs|mandate|auto[\s-]?debit|standing\s+instruction|premium|insurance|sip|rent|maintenance|subscription)\b/i;

/** Wording that names a monthly commitment. Only spending-like debits qualify, never card-bill payments, income or refunds. */
export function looksRecurring(description: string, kind: TxnKind, direction: "debit" | "credit"): boolean {
  if (direction !== "debit" || (kind !== "purchase" && kind !== "fee" && kind !== "transfer")) return false;
  return COMMITMENT.test(description) || /^si[\s-]/i.test(description.trim());
}

/** The same merchant for about the same amount in at least two different earlier months. */
export function repeatsMonthly(description: string, amountPaise: number, date: string, history: Pick<ExpenseRecord, "originalDescription" | "amountPaise" | "date" | "kind">[]): boolean {
  const key = memoryKey(description);
  if (!key) return false;
  const months = new Set<string>();
  for (const h of history) {
    if (h.kind !== "purchase" && h.kind !== "fee") continue;
    if (h.date.slice(0, 7) === date.slice(0, 7)) continue;
    if (Math.abs(h.amountPaise - amountPaise) > Math.max(100, amountPaise * 0.05)) continue;
    if (memoryKey(h.originalDescription) === key) months.add(h.date.slice(0, 7));
  }
  return months.size >= 2;
}
