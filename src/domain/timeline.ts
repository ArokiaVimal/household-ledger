// Monthly Money Timeline: what happened, what is coming, and a forecast balance. Pure.
// Honesty rules: a balance is "recorded" only when the person entered it (with its date). Everything after that date is an estimate,
// built ONLY from confirmed transactions and from items the person entered or imported (card bills, recurring items, expected
// income). Nothing is guessed, and every estimate says how sure it is and why.
import { cardPayments, cardViews, daysBetween, upcomingBills } from "./cardbills";
import { isDueMonth } from "./recurring";
import { recurringStatuses } from "./recurring";
import { shiftMonth } from "./months";
import type { Account, CardBill, ExpenseRecord, Paise, RecurringItem } from "./types";

export type EventType = "spend" | "income" | "refund" | "card_bill_paid" | "transfer" | "card_bill" | "recurring_out" | "recurring_in";

export interface TimelineEvent {
  id: string;
  date: string;
  /** actual = a confirmed transaction. expected = something entered or imported that has not happened yet. */
  kind: "actual" | "expected";
  type: EventType;
  label: string;
  /** Money in is positive, money out negative. 0 for a transfer (its direction is not known). */
  amountPaise: Paise;
  /** The amount is an estimate (a bill that changes each time). */
  estimated?: boolean;
  /** Not verified yet: the amount is real (it came from a statement) but the details are not confirmed. */
  unverified?: boolean;
  /** Expected but already past its date: shown on today, still counted. */
  overdue?: boolean;
  href?: string;
  /** Forecast balance after this event. Only on expected events, only when a balance was recorded. */
  balanceAfterPaise?: Paise;
}

export type ConfidenceLevel = "high" | "medium" | "low" | "none";
export interface Confidence { level: ConfidenceLevel; reasons: string[] }
export interface Warning { kind: "bill_soon" | "bill_overdue" | "negative" | "stale_balance" | "no_balance"; text: string; date?: string }

export interface Timeline {
  month: string;
  events: TimelineEvent[];
  /** What was recorded, with dates. Null when no bank or cash balance was ever recorded. */
  recorded: { totalPaise: Paise; accounts: { id: string; name: string; amountPaise: Paise; asOf: string }[]; oldestAsOf: string } | null;
  /** Recorded balance plus confirmed transactions since its date, up to today. An ESTIMATE, never a confirmed balance. */
  estimatedTodayPaise: Paise | null;
  /** Forecast balance at the end of the month on screen (null for past months or without a balance). */
  forecastEndPaise: Paise | null;
  /** The lowest forecast balance in the window, when it is below zero. */
  lowest: { date: string; amountPaise: Paise } | null;
  confidence: Confidence;
  warnings: Warning[];
  totals: { actualIn: Paise; actualOut: Paise; expectedIn: Paise; expectedOut: Paise };
}

export interface TimelineInput {
  month: string;
  today: string;
  records: ExpenseRecord[];
  accounts: Account[];
  cardBills: CardBill[];
  recurringItems: RecurringItem[];
  /** Label for an account id (cards, banks). */
  accountName: (id: string) => string;
}

const monthEnd = (m: string) => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
const clampDay = (m: string, day: number) => `${m}-${String(Math.min(day, Number(monthEnd(m).slice(8, 10)))).padStart(2, "0")}`;

/** Does a confirmed record move money in or out of this bank or cash account? Returns the signed effect, or null when it does not (or is unknown). */
function effectOn(acc: Account, r: ExpenseRecord): { paise: Paise } | "unknown" | null {
  // Unverified rows count: the money really moved, only the category or split is unconfirmed.
  if (r.excluded) return null;
  const touches = r.accountId === acc.id || r.fundedBy === acc.id;
  if (!touches) return null;
  if (r.kind === "income" || r.kind === "refund") return { paise: r.amountPaise };
  if (r.kind === "purchase" || r.kind === "fee" || r.kind === "cc_payment") return { paise: -r.amountPaise };
  return "unknown"; // a transfer: in or out is not known from the record
}

export function buildTimeline(i: TimelineInput): Timeline {
  const { month, today } = i;
  const todayMonth = today.slice(0, 7);
  const events: TimelineEvent[] = [];

  // ---- what happened (verified or not; unverified ones are flagged) ----
  // A card-bill payment seen on the card and on the bank is one movement of money: list the bank's line only.
  const sameAsBank = new Set<string>();
  for (const a of i.accounts) if (a.type === "credit_card") for (const p of cardPayments(a.id, i.records)) p.recordIds.slice(1).forEach((id) => sameAsBank.add(id));
  for (const r of i.records) {
    if (r.excluded || !r.date.startsWith(month) || sameAsBank.has(r.id)) continue;
    const before = events.length;
    if (r.kind === "income") events.push({ id: r.id, date: r.date, kind: "actual", type: "income", label: r.merchant, amountPaise: r.amountPaise, href: `/transactions?month=${month}&kind=income` });
    else if (r.kind === "refund") events.push({ id: r.id, date: r.date, kind: "actual", type: "refund", label: r.merchant, amountPaise: r.amountPaise });
    else if ((r.kind === "purchase" || r.kind === "fee") && !r.paidWithVoucherId) events.push({ id: r.id, date: r.date, kind: "actual", type: "spend", label: r.merchant, amountPaise: -r.amountPaise });
    else if (r.kind === "cc_payment") events.push({ id: r.id, date: r.date, kind: "actual", type: "card_bill_paid", label: r.merchant, amountPaise: -r.amountPaise });
    else if (r.kind === "transfer") events.push({ id: r.id, date: r.date, kind: "actual", type: "transfer", label: r.merchant, amountPaise: 0 });
    if (r.status === "unreviewed") for (let k = before; k < events.length; k++) events[k].unverified = true;
  }

  // ---- recorded balances and the estimate for today ----
  const tracked = i.accounts.filter((a) => (a.type === "bank" || a.type === "cash") && a.balance && !a.archived);
  const recorded = tracked.length === 0 ? null : {
    totalPaise: tracked.reduce((s, a) => s + a.balance!.amountPaise, 0),
    accounts: tracked.map((a) => ({ id: a.id, name: a.name, amountPaise: a.balance!.amountPaise, asOf: a.balance!.asOf })),
    oldestAsOf: tracked.map((a) => a.balance!.asOf).sort()[0],
  };
  let unknownMoves = 0;
  let estimatedToday: number | null = null;
  if (recorded) {
    estimatedToday = 0;
    for (const a of tracked) {
      let bal = a.balance!.amountPaise;
      for (const r of i.records) {
        if (r.date <= a.balance!.asOf || r.date > today) continue; // the recorded balance already includes its own day
        const e = effectOn(a, r);
        if (e === "unknown") unknownMoves++;
        else if (e) bal += e.paise;
      }
      estimatedToday += bal;
    }
  }

  // ---- what is coming (entered or imported only) ----
  const expected: TimelineEvent[] = [];
  const horizon = month >= todayMonth ? monthEnd(month) : null;
  let estimatedAmounts = 0;
  let anyIncomeExpected = false;
  if (horizon) {
    for (const v of upcomingBills(cardViews(i.accounts, i.cardBills, i.records, today))) {
      if (v.bill.dueDate > horizon) continue;
      const overdue = v.daysLeft < 0;
      expected.push({ id: `bill-${v.bill.id}`, date: overdue ? today : v.bill.dueDate, kind: "expected", type: "card_bill", label: `${i.accountName(v.bill.accountId)} bill`, amountPaise: -v.remainingPaise, overdue, href: "/cards" });
    }
    for (let m = todayMonth; m <= month; m = shiftMonth(m, 1)) {
      for (const s of recurringStatuses(i.recurringItems, i.records, m, today)) {
        if (s.state === "paid" || s.state === "ended" || s.state === "notdue" || !isDueMonth(s.item, m)) continue;
        const date = clampDay(m, s.item.dueDay);
        const overdue = date < today;
        const incoming = s.item.direction === "in";
        if (s.estimated || s.item.amountVaries) estimatedAmounts++;
        if (incoming) anyIncomeExpected = true;
        expected.push({ id: `rec-${s.item.id}-${m}`, date: overdue ? today : date, kind: "expected", type: incoming ? "recurring_in" : "recurring_out", label: s.item.name, amountPaise: incoming ? s.expectedPaise : -s.expectedPaise, estimated: s.estimated || !!s.item.amountVaries, overdue, href: "/recurring" });
      }
    }
  }
  expected.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // ---- forecast walk ----
  let lowest: Timeline["lowest"] = null;
  let running = estimatedToday;
  for (const e of expected) {
    if (running !== null) {
      running += e.amountPaise;
      e.balanceAfterPaise = running;
      if (running < 0 && (!lowest || running < lowest.amountPaise)) lowest = { date: e.date, amountPaise: running };
    }
  }
  const inMonth = (e: TimelineEvent) => e.date.startsWith(month);
  const shown = [...events, ...expected.filter(inMonth)].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "actual" ? -1 : 1));
  const forecastEnd = horizon && running !== null ? running : null;

  // ---- warnings ----
  const warnings: Warning[] = [];
  for (const v of upcomingBills(cardViews(i.accounts, i.cardBills, i.records, today))) {
    const name = i.accountName(v.bill.accountId);
    if (v.daysLeft < 0) warnings.push({ kind: "bill_overdue", text: `${name} bill is ${-v.daysLeft} day${v.daysLeft === -1 ? "" : "s"} overdue`, date: v.bill.dueDate });
    else if (v.daysLeft <= 7) warnings.push({ kind: "bill_soon", text: `${name} bill is due ${v.daysLeft === 0 ? "today" : v.daysLeft === 1 ? "tomorrow" : `in ${v.daysLeft} days`}`, date: v.bill.dueDate });
  }
  if (lowest) warnings.push({ kind: "negative", text: "Forecast: your recorded balance may run out on this date if only the known items happen", date: lowest.date });
  if (recorded && daysBetween(recorded.oldestAsOf, today) > 14) warnings.push({ kind: "stale_balance", text: `Your balance was last recorded ${daysBetween(recorded.oldestAsOf, today)} days ago` });
  if (!recorded) warnings.push({ kind: "no_balance", text: "No bank balance is recorded, so there is no balance forecast. Add one under Settings → Payment methods." });

  // ---- confidence ----
  const reasons: string[] = [];
  let level: ConfidenceLevel = "none";
  if (recorded) {
    level = "high";
    const age = daysBetween(recorded.oldestAsOf, today);
    const lower = (l: ConfidenceLevel) => { const order: ConfidenceLevel[] = ["low", "medium", "high"]; if (order.indexOf(l) < order.indexOf(level)) level = l; };
    if (age > 30) { lower("low"); reasons.push(`The balance is ${age} days old.`); }
    else if (age > 7) { lower("medium"); reasons.push(`The balance is ${age} days old.`); }
    else reasons.push(age <= 0 ? "The balance was recorded today." : `The balance was recorded ${age} day${age === 1 ? "" : "s"} ago.`);
    if (unknownMoves > 0) { lower("medium"); reasons.push(`${unknownMoves} transfer${unknownMoves === 1 ? "" : "s"} since then could not be applied (their direction is unknown).`); }
    if (estimatedAmounts > 0) { lower("medium"); reasons.push(`${estimatedAmounts} upcoming amount${estimatedAmounts === 1 ? " is" : "s are"} estimated from the last bill.`); }
    if (expected.length === 0) { lower("medium"); reasons.push("No upcoming bills or recurring items are recorded, so the forecast only reflects what the app has been told."); }
    else if (!anyIncomeExpected) { lower("medium"); reasons.push("No expected income is entered, so money coming in is not in the forecast."); }
    if (i.accounts.filter((a) => a.type === "bank" && !a.archived).length > tracked.filter((a) => a.type === "bank").length) { lower("medium"); reasons.push("Some bank accounts have no recorded balance and are left out."); }
  } else reasons.push("No bank balance is recorded: this shows money flows only, not a balance.");

  const sum = (f: (e: TimelineEvent) => boolean) => shown.filter(f).reduce((s, e) => s + e.amountPaise, 0);
  return {
    month, events: shown, recorded, estimatedTodayPaise: estimatedToday, forecastEndPaise: forecastEnd, lowest, confidence: { level, reasons }, warnings,
    totals: { actualIn: sum((e) => e.kind === "actual" && e.amountPaise > 0), actualOut: -sum((e) => e.kind === "actual" && e.amountPaise < 0), expectedIn: sum((e) => e.kind === "expected" && e.amountPaise > 0), expectedOut: -sum((e) => e.kind === "expected" && e.amountPaise < 0) },
  };
}

