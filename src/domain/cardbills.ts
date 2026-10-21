import type { Account, CardBill, ExpenseRecord, Paise } from "./types";

export type BillState = "paid" | "partial" | "due" | "overdue";

export interface BillStatus {
  bill: CardBill;
  /** Card-bill payments you have not verified yet. They do not mark the bill paid until you verify them. */
  unverifiedPaise: Paise;
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

/** One payment towards a card, with the card's own record and your bank's record of it joined into a single entry. */
export interface CardPayment {
  id: string;
  /** The date on the card when it has one (it matches the statement), otherwise the bank's date. */
  date: string;
  amountPaise: Paise;
  /** The bank the money left, when a bank record of it exists. */
  fromId?: string;
  /** At least one of its records is verified. */
  verified: boolean;
  /** Its records, the bank's first. */
  recordIds: string[];
  onCard: boolean;
}

/** The card shows it and the bank shows it a day or two apart. Same amount within this many days is one payment. */
export const PAYMENT_MATCH_DAYS = 3;

/**
 * Every payment towards a card, newest first. The card's own "payment received" line and the bank's debit are the same money,
 * so a card line and a bank line with the same amount within a few days become one payment. Two lines on the same side merge only
 * on the same day (one payment read twice); a day apart they are two payments.
 */
export function cardPayments(cardId: string, records: ExpenseRecord[]): CardPayment[] {
  const mine = records.filter((r) => !r.excluded && r.kind === "cc_payment" && (r.accountId === cardId || r.paidCardId === cardId));
  // Verified lines first, so an unverified copy never hides the verified one; then by date.
  mine.sort((a, b) => Number(b.status === "reviewed") - Number(a.status === "reviewed") || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: (CardPayment & { hasBank: boolean })[] = [];
  for (const r of mine) {
    const cardSide = r.accountId === cardId;
    const hit = out.find((p) => p.amountPaise === r.amountPaise && Math.abs(daysBetween(p.date, r.date)) <= PAYMENT_MATCH_DAYS && (p.date === r.date || (cardSide ? !p.onCard : !p.hasBank)));
    if (hit) {
      if (cardSide) { if (!hit.onCard) hit.date = r.date; hit.onCard = true; hit.recordIds.push(r.id); } else { hit.hasBank = true; hit.fromId ??= r.accountId; hit.recordIds.unshift(r.id); }
      hit.verified = hit.verified || r.status === "reviewed";
    } else {
      out.push({ id: r.id, date: r.date, amountPaise: r.amountPaise, ...(cardSide ? {} : { fromId: r.accountId }), verified: r.status === "reviewed", recordIds: [r.id], onCard: cardSide, hasBank: !cardSide });
    }
  }
  return out.map((p) => ({ id: p.id, date: p.date, amountPaise: p.amountPaise, fromId: p.fromId, verified: p.verified, recordIds: p.recordIds, onCard: p.onCard })).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Where a card bill stands. A payment counts when it is a card-bill payment (not an expense) made on or after the statement
 * date, either recorded on the card itself or from a bank with the card named. The same payment seen from both sides (same
 * amount, dates within a few days) is counted once.
 */
export function billStatus(bill: CardBill, records: ExpenseRecord[], today: string): BillStatus {
  let paid = 0, unverified = 0;
  for (const p of cardPayments(bill.accountId, records)) {
    if (p.date < bill.statementDate || p.date > today) continue;
    if (p.verified) paid += p.amountPaise; else unverified += p.amountPaise;
  }
  const settled = !!bill.paid || paid >= bill.totalDuePaise;
  const remainingPaise = settled ? 0 : bill.totalDuePaise - paid;
  const daysLeft = daysBetween(today, bill.dueDate);
  const state: BillState = settled ? "paid" : daysLeft < 0 ? "overdue" : paid > 0 ? "partial" : "due";
  return { bill, paidPaise: paid, unverifiedPaise: unverified, remainingPaise, state, daysLeft };
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

/** The card a bank payment most likely settles: the one open bill with exactly this amount, else the only open bill. */
export function suggestPaidCard(amountPaise: number | undefined, views: CardView[]): string | undefined {
  const open = upcomingBills(views);
  const exact = amountPaise ? open.filter((b) => b.remainingPaise === amountPaise || b.bill.totalDuePaise === amountPaise) : [];
  if (exact.length === 1) return exact[0].bill.accountId;
  return open.length === 1 ? open[0].bill.accountId : undefined;
}
