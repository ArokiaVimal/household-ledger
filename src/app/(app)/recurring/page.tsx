"use client";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { MerchantAvatar } from "@/components/txn-row";
import { useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { commitmentTotals } from "@/domain/recurring";
import { formatINR } from "@/domain/money";
import { monthLabel } from "@/domain/months";
import type { RecurringState } from "@/domain/recurring";
import type { RecurringItem } from "@/domain/types";
import { RecurringDialog } from "./recurring-form";
import { LinkPaymentDialog } from "./link-payment";
import { Suggestions } from "./suggestions";

const tone: Record<RecurringState, "good" | "warn" | "bad" | "neutral"> = { paid: "good", upcoming: "warn", overdue: "bad", ended: "neutral", notdue: "neutral" };
const text: Record<RecurringState, string> = { paid: "Paid", upcoming: "Upcoming", overdue: "Overdue", ended: "Ended", notdue: "Not due" };

export default function Recurring() {
  const { live, recurring, month, nameOf, categoryName, accountName, recurringItems, meId, deleteRecurring, markRecurringPaid, recurringAlerts } = useStore();
  const [linking, setLinking] = useState<RecurringItem | null>(null);
  const [editing, setEditing] = useState<RecurringItem | "new" | null>(null);
  const [removing, setRemoving] = useState<RecurringItem | null>(null);
  const totals = commitmentTotals(recurringItems, month);
  const paid = recurring.filter((r) => r.item.direction !== "in" && r.state === "paid").reduce((s, r) => s + (r.marked ? r.expectedPaise : r.actualPaise), 0);
  const left = recurring.filter((r) => r.item.direction !== "in" && r.state !== "paid" && r.state !== "ended" && r.state !== "notdue").reduce((s, r) => s + r.expectedPaise, 0);
  const groups = [...new Set(recurring.map((r) => r.item.place ?? "Personal"))];

  return (
    <>
      <PageHeader tip="Rent, EMIs, subscriptions and other repeating payments." title="Recurring" sub={`Monthly commitments · ${month}`} actions={<><Link href={`/transactions?month=${month}&recurring=1`} className="rounded-full border border-border bg-surface px-3 py-2 text-sm">View payments</Link><Button variant="primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden />Add recurring</Button></>} />
      <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Expected</div><div className="num text-base font-semibold sm:text-xl">{formatINR(totals.monthlyPaise)}</div><div className="hidden text-xs text-muted sm:block">≈ {formatINR(totals.yearlyPaise)} over the next 12 months</div></Card>
        <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Paid</div><div className="num text-base font-semibold text-good sm:text-xl">{formatINR(paid)}</div></Card>
        <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Left to pay</div><div className="num text-base font-semibold sm:text-xl">{formatINR(left)}</div><div className="hidden text-xs text-muted sm:block">based on expected amounts</div></Card>
      </div>
      <Suggestions />
      {recurringItems.length === 0 ? <Card className="space-y-3 text-center"><EmptyState art="bills" title="No recurring payments yet" hint="Add rent, EMIs and bills once. See what's paid, due or late each month." /><div><Button variant="primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden />Add your first</Button></div></Card> : (
        <div className="space-y-4">
          {groups.map((place) => (
            <section key={place} aria-label={place}>
              <h2 className="mb-2 px-1 text-sm font-medium text-muted">{place}</h2>
              <ul className="space-y-2">
                {recurring.filter((r) => (r.item.place ?? "Personal") === place).sort((a, b) => a.item.dueDay - b.item.dueDay).map((r) => {
                  const rec = r.records[0];
                  return (
                    <li key={r.item.id} className={`flex flex-col rounded-[var(--radius-card)] bg-surface hover:shadow-md sm:flex-row sm:items-center sm:pr-2 ${r.state === "notdue" || r.state === "ended" ? "opacity-70" : ""}`}>
                      <Link href={`/transactions?month=${month}&recurring=${r.item.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 p-4 pb-2 sm:pb-4">
                        <MerchantAvatar name={r.item.name} />
                        <div className="min-w-0 flex-1 basis-40">
                          <div className="font-medium">{r.item.name}</div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden />Due on {r.item.dueDay}</span>
                            {r.item.until && <span>{r.state === "ended" ? "Ended" : "Until"} {monthLabel(r.item.until.slice(0, 7))}</span>}
                            {(r.item.everyMonths ?? 1) > 1 && <span>Every {r.item.everyMonths} months</span>}
                            {r.item.direction === "in" && <span>Money coming in</span>}
                            {r.item.amountVaries && <span>Amount varies</span>}
                            {recurringAlerts.filter((a) => a.itemId === r.item.id).map((a) => <Badge key={a.flag} tone={a.flag === "price_up" ? "warn" : "bad"}>{a.flag === "price_up" ? "Price went up" : a.flag === "duplicate" ? "Charged twice" : "Payment missing"}</Badge>)}
                            {r.item.accountId && !rec && <span>{accountName(r.item.accountId)}</span>}
                            <span>{categoryName(r.item.categoryId)}</span>
                            <span>{r.item.split.mode === "personal" ? `Mine` : `Split with ${r.item.split.participantIds.filter((i) => i !== meId).map(nameOf).join(", ")}`}</span>
                            {rec && <span>{accountName(rec.accountId)}{rec.fundedBy ? ` via ${accountName(rec.fundedBy)}` : ""}</span>}
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                        <div className="num text-right">
                          <div className="font-semibold">{formatINR(r.state === "paid" && !r.marked ? r.actualPaise : r.expectedPaise)}</div>
                          <div className="text-xs text-muted">{r.state === "paid" ? (r.marked ? "marked paid" : r.variancePaise === 0 ? "as expected" : `${r.variancePaise > 0 ? "+" : "−"}${formatINR(Math.abs(r.variancePaise))} vs ${r.estimated ? "last bill" : "expected"}`) : r.state === "notdue" ? (r.nextDue ? `next bill ${monthLabel(r.nextDue)}` : "no more bills") : r.estimated ? "about, from last bill" : r.item.amountVaries ? "first guess" : "expected"}</div>
                        </div>
                        <Badge tone={tone[r.state]}>{r.item.direction === "in" ? (r.state === "paid" ? "Received" : r.state === "overdue" ? "Late" : text[r.state]) : text[r.state]}</Badge>
                        </div>
                      </Link>
                      <div className="flex flex-wrap items-center justify-end gap-1 px-2 pb-2 sm:p-0">
                      {r.state !== "ended" && r.state !== "paid" && r.state !== "notdue" && <><Button onClick={() => markRecurringPaid(r.item.id, month, true)} aria-label={`Mark ${r.item.name} paid for ${month}`}>Mark paid</Button><Button onClick={() => setLinking(r.item)} aria-label={`Link a payment to ${r.item.name}`}>Link payment</Button></>}
                      {r.marked && <Button onClick={() => markRecurringPaid(r.item.id, month, false)} aria-label={`Undo paid mark for ${r.item.name}`}>Undo</Button>}
                      <button type="button" aria-label={`Edit ${r.item.name}`} title="Edit" onClick={() => setEditing(r.item)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={15} aria-hidden /></button>
                      <button type="button" aria-label={`Remove ${r.item.name}`} title="Remove" onClick={() => setRemoving(r.item)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={15} aria-hidden /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <RecurringDialog item={editing} onClose={() => setEditing(null)} />
      <LinkPaymentDialog item={linking} month={month} onClose={() => setLinking(null)} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? "this"}?`} confirmLabel="Remove" onConfirm={() => removing && deleteRecurring(removing.id)}>
        <p>It stops being tracked. Linked payments stay in your transactions.</p>
      </ConfirmDialog>
      {!live && <p className="mt-4 text-xs text-muted">Amounts are fictional. Link a payment to an item from the transaction edit dialog; auto-detection of recurring patterns is not built yet. “Today” is fixed at 24 Sep 2026 in the prototype.</p>}
    </>
  );
}
