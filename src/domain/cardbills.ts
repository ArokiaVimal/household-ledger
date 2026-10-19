import type { Account, CardBill, ExpenseRecord, Paise } from "./types";

export type BillState = "paid" | "partial" | "due" | "overdue";

export interface BillStatus {
  bill: CardBill;
  /** Card-bill payments recorded since the statement date (each date and amount counted once). */
  paidPaise: Paise;
  /** What is still to pay of the full amount due. 0 once paid. */
  remainingPaise: Paise;
  state: BillState;
  /** Whole days from `today` to the due date. Negative once it has passed. */
  daysLeft: number;
}

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/**
 * Where a card bill stands. A payment counts when it is a card-bill payment (not an expense) made on or after the statement
 * date, either recorded on the card itself or from a bank with the card named. The same payment seen from both sides (same
 * date and amount) is counted once.
 */
export function billStatus(bill: CardBill, records: ExpenseRecord[], today: string): BillStatus {
  const seen = new Set<string>();
  let paid = 0;
  for (const r of records) {
    if (r.status !== "reviewed" || r.excluded || r.kind !== "cc_payment") continue;
    if (r.date < bill.statementDate || r.date > today) continue;
    if (r.accountId !== bill.accountId && r.paidCardId !== bill.accountId) continue;
    const key = `${r.date}|${r.amountPaise}`;
    if (seen.has(key)) continue;
    seen.add(key);
    paid += r.amountPaise;
  }
  const settled = !!bill.paid || paid >= bill.totalDuePaise;
  const remainingPaise = settled ? 0 : bill.totalDuePaise - paid;
  const daysLeft = daysBetween(today, bill.dueDate);
  const state: BillState = settled ? "paid" : daysLeft < 0 ? "overdue" : paid > 0 ? "partial" : "due";
  return { bill, paidPaise: paid, remainingPaise, state, daysLeft };
}

export interface CardView { card: Account; /** The latest bill, or null when none has been added. */ current: BillStatus | null; earlier: BillStatus[] }

/** Every credit card with its latest bill first and earlier ones after. */
export function cardViews(cards: Account[], bills: CardBill[], records: ExpenseRecord[], today: string): CardView[] {
  return cards.filter((c) => c.type === "credit_card").map((card) => {
    const mine = bills.filter((b) => b.accountId === card.id).sort((a, b) => b.statementDate.localeCompare(a.statementDate)).map((b) => billStatus(b, records, today));
    return { card, current: mine[0] ?? null, earlier: mine.slice(1) };
  });
}

/** Bills still to pay across all cards, soonest due date first. */
export function upcomingBills(views: CardView[]): BillStatus[] {
  return views.flatMap((v) => (v.current && v.current.state !== "paid" ? [v.current] : [])).sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate));
}

/** "due today", "due tomorrow", "due in 5 days", "3 days overdue". */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  if (daysLeft > 1) return `due in ${daysLeft} days`;
  return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue`;
}
