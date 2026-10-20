// Bill reminders: what to tell someone about card bills that are due soon or late. Pure; the push sender lives in src/lib/push.
import { formatINR } from "./money";
import { dueLabel, upcomingBills, type CardView } from "./cardbills";
import { shortName } from "./accounts";

export interface Reminder { title: string; body: string; url: string; tag: string; /** One entry per bill, for tests and logs. */ lines: string[] }

/** Remind from this many days before the due date, and keep reminding for this many days after it. */
export const REMIND_BEFORE_DAYS = 3;
export const REMIND_AFTER_DAYS = 7;

/** One reminder covering every unpaid card bill that is due within 3 days or up to a week late; null when there is nothing to say. */
export function billReminder(views: CardView[]): Reminder | null {
  const due = upcomingBills(views).filter((b) => b.daysLeft <= REMIND_BEFORE_DAYS && b.daysLeft >= -REMIND_AFTER_DAYS);
  if (due.length === 0) return null;
  const lines = due.map((b) => `${shortName(views.find((v) => v.card.id === b.bill.accountId)?.card.name ?? "Card")} ${formatINR(b.remainingPaise)} ${dueLabel(b.daysLeft)}`);
  const overdue = due.some((b) => b.daysLeft < 0);
  return {
    title: due.length === 1 ? (overdue ? "Card bill overdue" : "Card bill due soon") : `${due.length} card bills ${overdue ? "need attention" : "due soon"}`,
    body: lines.slice(0, 3).join("\n") + (lines.length > 3 ? `\n+${lines.length - 3} more` : ""),
    url: "/cards", tag: "card-bills", lines,
  };
}
