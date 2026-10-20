"use client";
import { Bell, ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui";
import { useStore } from "@/data/store";
import { cardLabel } from "@/domain/accounts";
import { cardViews, dueLabel, upcomingBills } from "@/domain/cardbills";
import { formatINR } from "@/domain/money";
import { recurringStatuses } from "@/domain/recurring";

interface Note { key: string; text: string; sub: string; href: string; bad: boolean }

/** The bell: everything that needs a heads-up (card bills due or late, recurring payments overdue), plus the switch for push reminders. */
export function NotificationsBell({ className = "" }: { className?: string }) {
  const { accounts, cardBills, records, recurringItems, today, live } = useStore();
  const [open, setOpen] = useState(false);
  const notes = useMemo<Note[]>(() => {
    const cards = accounts.filter((a) => a.type === "credit_card");
    const bills = upcomingBills(cardViews(accounts, cardBills, records, today)).filter((b) => b.daysLeft <= 3).map((b) => ({
      key: `bill-${b.bill.id}`, text: `${cardLabel(accounts.find((a) => a.id === b.bill.accountId)?.name ?? "Card", cards)} bill ${formatINR(b.remainingPaise)}`, sub: dueLabel(b.daysLeft), href: "/cards", bad: b.daysLeft < 0,
    }));
    const recurring = recurringStatuses(recurringItems.filter((i) => i.direction !== "in"), records, today.slice(0, 7), today).filter((r) => r.state === "overdue").map((r) => ({
      key: `rec-${r.item.id}`, text: r.item.name, sub: "Recurring payment overdue", href: "/recurring", bad: true,
    }));
    return [...bills, ...recurring];
  }, [accounts, cardBills, records, recurringItems, today]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={notes.length ? `Notifications, ${notes.length} new` : "Notifications"} className={`relative grid size-10 shrink-0 place-items-center rounded-full bg-surface ${className}`}>
        <Bell size={18} aria-hidden />
        {notes.length > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Notifications">
        <div className="space-y-3 pb-1 text-sm">
          {notes.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-background p-3 text-muted"><CircleCheck size={18} aria-hidden className="text-good" />You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {notes.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${n.bad ? "bg-danger" : "bg-warn"}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{n.text}</span><span className={`block text-xs ${n.bad ? "text-danger" : "text-muted"}`}>{n.sub}</span></span>
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {live && <Link href="/settings?s=reminders" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-between rounded-xl bg-background px-3.5 text-muted hover:text-foreground"><span>Reminder settings</span><ChevronRight size={16} aria-hidden /></Link>}
        </div>
      </Dialog>
    </>
  );
}
