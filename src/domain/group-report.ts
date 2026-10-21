// A split group's summary and its spreadsheet export. Pure. Uses the same counted expenses as the balances, so the numbers always agree.
import { groupBalances, groupExpenses } from "./split-groups";
import type { ExpenseRecord, Paise, SplitGroup, SplitSettlement } from "./types";

export interface GroupSummary {
  totalPaise: Paise;
  expenseCount: number;
  /** First and last expense date, when there are expenses. */
  from?: string;
  to?: string;
  /** Total over the days the expenses cover (both days counted). */
  perDayPaise: Paise;
  /** Biggest first. Refunds take their category's total down. */
  byCategory: { categoryId: string; totalPaise: Paise; count: number }[];
}

const dayCount = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export function groupSummary(group: Pick<SplitGroup, "id">, records: ExpenseRecord[]): GroupSummary {
  const expenses = groupExpenses(records, group.id);
  const cat = new Map<string, { totalPaise: Paise; count: number }>();
  for (const e of expenses) { const c = cat.get(e.record.categoryId) ?? { totalPaise: 0, count: 0 }; c.totalPaise += e.totalPaise; c.count += 1; cat.set(e.record.categoryId, c); }
  const total = expenses.reduce((s, e) => s + e.totalPaise, 0);
  const from = expenses[0]?.record.date, to = expenses[expenses.length - 1]?.record.date;
  return {
    totalPaise: total, expenseCount: expenses.length, from, to,
    perDayPaise: from && to ? Math.round(total / dayCount(from, to)) : 0,
    byCategory: [...cat].map(([categoryId, v]) => ({ categoryId, ...v })).sort((a, b) => b.totalPaise - a.totalPaise || a.categoryId.localeCompare(b.categoryId)),
  };
}

const rupees = (p: Paise) => (p / 100).toFixed(2);
/** One CSV cell. Text that a spreadsheet could run as a formula is defanged with a leading apostrophe. */
function cell(v: string | number, numeric = false): string {
  let s = String(v);
  if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cols: (string | number | { n: string })[]) => cols.map((c) => (typeof c === "object" ? cell(c.n, true) : cell(c))).join(",");
const num = (p: Paise) => ({ n: rupees(p) });

/** Everything about a group in one CSV: expenses with each person's share, payments made, and who owes what. Amounts are in rupees. */
export function groupCsv(group: SplitGroup, records: ExpenseRecord[], settlements: SplitSettlement[], nameOf: (id: string) => string, categoryName: (id: string) => string): string {
  const expenses = groupExpenses(records, group.id);
  const bal = groupBalances(group, records, settlements);
  const people = bal.people.map((p) => p.id);
  const rows: string[] = [
    line(["Group", group.name]),
    line(["Spent (₹)", num(bal.totalPaise)]),
    "",
    line(["Date", "Description", "Category", "Paid by", "Amount (₹)", ...people.map((id) => `${nameOf(id)} share (₹)`)]),
    ...expenses.map((e) => line([e.record.date, e.record.merchant, categoryName(e.record.categoryId), nameOf(e.payerId), num(e.totalPaise), ...people.map((id) => num(e.shares[id] ?? 0))])),
    "",
    line(["Payments"]),
    line(["Date", "From", "To", "Amount (₹)", "Note"]),
    ...settlements.filter((s) => s.groupId === group.id && !s.voided).sort((a, b) => a.date.localeCompare(b.date)).map((s) => line([s.date, nameOf(s.fromId), nameOf(s.toId), num(s.amountPaise), s.note ?? ""])),
    "",
    line(["Balances"]),
    line(["Person", "Paid (₹)", "Share (₹)", "Payments (₹)", "Balance (₹)"]),
    ...bal.people.map((p) => line([nameOf(p.id), num(p.paidPaise), num(p.sharePaise), num(p.settledPaise), num(p.balancePaise)])),
  ];
  return rows.join("\r\n") + "\r\n";
}
