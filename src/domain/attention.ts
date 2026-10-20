// "Needs attention": the few things that deserve a look today, from what the app already knows. Pure, no AI.
import type { BillStatus } from "./cardbills";
import type { RecurringStatus } from "./recurring";

export interface AttentionItem { key: string; label: string; count: number; href: string; tone: "bad" | "warn" }

export interface AttentionInput {
  /** Imported rows waiting for review. */
  waiting: number;
  /** Card bills still to pay (see upcomingBills). */
  bills: BillStatus[];
  /** Recurring items for the month on screen. */
  recurring: RecurringStatus[];
  /** Approved transactions of the month with no category. */
  uncategorized: number;
  /** Recurring suggestions waiting for a yes or no. */
  suggestions?: number;
  /** A bill this close to due counts as "soon". */
  soonDays?: number;
}

export function needsAttention(i: AttentionInput): AttentionItem[] {
  const soon = i.soonDays ?? 3;
  const overdueBills = i.bills.filter((b) => b.state === "overdue").length;
  const dueSoon = i.bills.filter((b) => b.state !== "overdue" && b.daysLeft <= soon).length;
  const overdueRecurring = i.recurring.filter((r) => r.state === "overdue").length;
  const items: AttentionItem[] = [
    { key: "review", label: "unverified", count: i.waiting, href: "/transactions?v=unverified", tone: "warn" },
    { key: "bills-overdue", label: "bills overdue", count: overdueBills, href: "/cards", tone: "bad" },
    { key: "bills-soon", label: `bills due in ${soon} days`, count: dueSoon, href: "/cards", tone: "warn" },
    { key: "recurring-overdue", label: "recurring overdue", count: overdueRecurring, href: "/recurring", tone: "bad" },
    { key: "suggestions", label: "suggested recurring", count: i.suggestions ?? 0, href: "/recurring#suggestions", tone: "warn" },
    { key: "uncategorized", label: "uncategorized", count: i.uncategorized, href: "/transactions?category=uncategorized", tone: "warn" },
  ];
  return items.filter((x) => x.count > 0);
}

export const attentionTotal = (items: AttentionItem[]) => items.reduce((s, x) => s + x.count, 0);
