// The numbers the AI analysis is based on. Pure: totals by category, top merchants, month-on-month change, recurring
// payments, card bills and a few things worth a look. Nothing here contains bank text, account numbers or notes: Claude
// is given these figures and nothing else, and the prompt tells it not to invent any.
import { dueLabel, upcomingBills, cardViews } from "@/domain/cardbills";
import { recurringStatuses } from "@/domain/recurring";
import { byCategory, byMerchant, byMonth, signedSpend, summarize } from "@/domain/reports";
import type { Account, Category, CardBill, ExpenseRecord, RecurringItem } from "@/domain/types";
import { maskNote } from "@/lib/notes/ai";

export interface InsightFacts {
  month: string;
  daysIntoMonth: number;
  totals: { spent: number; myShare: number; refunds: number; transactions: number; waitingForReview: number };
  /** The three months before, newest first. */
  earlier: { month: string; spent: number }[];
  categories: { name: string; amount: number; percent: number; vsEarlierAverage: number | null }[];
  merchants: { name: string; amount: number; times: number }[];
  recurring: { name: string; expected: number; state: string }[];
  cardBills: { card: string; amountToPay: number; due: string; when: string }[];
  /** The notes you wrote on this month's payments: the best context for what the money was for (long numbers, emails and phones hidden). */
  notes: { merchant: string; amount: number; category: string; note: string }[];
  worthALook: string[];
}

const rupees = (paise: number) => Math.round(paise / 100);
const prevMonth = (m: string, back: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 - back, 1)).toISOString().slice(0, 7); };

export function buildFacts(input: { month: string; today: string; meId: string; records: ExpenseRecord[]; staged: number; categories: Category[]; accounts: Account[]; recurringItems: RecurringItem[]; cardBills: CardBill[] }): InsightFacts {
  const { month, today, meId, categories, accounts } = input;
  const reviewed = input.records.filter((r) => r.status === "reviewed");
  const inMonth = reviewed.filter((r) => r.date.startsWith(month));
  const sum = summarize(inMonth, meId);
  const monthly = byMonth(reviewed);
  const earlier = [1, 2, 3].map((n) => ({ month: prevMonth(month, n), spent: rupees(monthly[prevMonth(month, n)] ?? 0) }));
  const cname = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const cats = Object.entries(byCategory(inMonth)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalSpent = Math.max(1, sum.net);
  const priorByCat = [1, 2, 3].map((n) => byCategory(reviewed.filter((r) => r.date.startsWith(prevMonth(month, n)))));
  const categoriesOut = cats.map(([id, v]) => {
    const priors = priorByCat.map((p) => p[id] ?? 0).filter((x, i) => earlier[i].spent > 0 || x > 0);
    const avg = priors.length ? priors.reduce((s, x) => s + x, 0) / priors.length : null;
    return { name: cname(id), amount: rupees(v), percent: Math.round((v / totalSpent) * 100), vsEarlierAverage: avg && avg > 0 ? Math.round(((v - avg) / avg) * 100) : null };
  });

  const merchTimes = new Map<string, number>();
  for (const r of inMonth) if (signedSpend(r) > 0) merchTimes.set(r.merchant, (merchTimes.get(r.merchant) ?? 0) + 1);
  const merchants = Object.entries(byMerchant(inMonth)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => ({ name, amount: rupees(v), times: merchTimes.get(name) ?? 1 }));

  const recurring = recurringStatuses(input.recurringItems, reviewed, month, today).map((r) => ({ name: r.item.name, expected: rupees(r.item.expectedPaise), state: r.state }));
  const views = cardViews(accounts, input.cardBills, reviewed, today);
  const cardBills = upcomingBills(views).map((b) => ({ card: accounts.find((a) => a.id === b.bill.accountId)?.name ?? "Card", amountToPay: rupees(b.remainingPaise), due: b.bill.dueDate, when: dueLabel(b.daysLeft) }));

  // Your own notes are the best context for a payment ("gift for dad", "Goa trip"), so the analysis gets the biggest ones.
  const notes = inMonth.filter((r) => signedSpend(r) > 0 && (r.notes ?? "").trim().length >= 3)
    .sort((a, b) => b.amountPaise - a.amountPaise).slice(0, 20)
    .map((r) => ({ merchant: r.merchant, amount: rupees(r.amountPaise), category: cname(r.categoryId), note: maskNote(r.notes ?? "").slice(0, 160) }));
  const worthALook: string[] = [];
  const spends = inMonth.filter((r) => signedSpend(r) > 0);
  const biggest = [...spends].sort((a, b) => b.amountPaise - a.amountPaise)[0];
  const others = spends.filter((r) => r !== biggest);
  const avgOthers = others.length ? others.reduce((s, r) => s + r.amountPaise, 0) / others.length : 0;
  if (biggest && avgOthers > 0 && biggest.amountPaise > avgOthers * 5) worthALook.push(`Largest single purchase: ${biggest.merchant}, ₹${rupees(biggest.amountPaise)}`);
  const unc = spends.filter((r) => r.categoryId === "uncategorized" && !r.voucherBrandId);
  if (unc.length >= 3) worthALook.push(`${unc.length} purchases (₹${rupees(unc.reduce((s, r) => s + r.amountPaise, 0))}) have no category`);
  if (input.staged > 0) worthALook.push(`${input.staged} imported transactions are still waiting for review and are not counted`);
  const dups = inMonth.filter((r) => r.duplicateOf).length;
  if (dups > 0) worthALook.push(`${dups} entries were flagged as possible duplicates`);

  return {
    month, daysIntoMonth: month === today.slice(0, 7) ? Number(today.slice(8, 10)) : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(),
    totals: { spent: rupees(sum.net), myShare: rupees(sum.myShare), refunds: rupees(sum.refunds), transactions: spends.length, waitingForReview: input.staged },
    earlier, categories: categoriesOut, merchants, recurring, cardBills, notes, worthALook,
  };
}
