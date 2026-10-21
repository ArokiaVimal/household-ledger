"use client";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { MerchantAvatar } from "@/components/txn-row";
import Link from "next/link";
import { CardMockup } from "@/components/card-mockup";
import { Badge, Button, Card, CompactChips, ConfirmDialog, Dialog, EmptyState, Field, FormRow, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { cardPayments, cardViews, dueLabel, upcomingBills, type BillState, type BillStatus, type CardPayment } from "@/domain/cardbills";
import { formatINR, parseRupees } from "@/domain/money";
import type { CardBill } from "@/domain/types";

const tone: Record<BillState, "good" | "warn" | "bad" | "neutral"> = { paid: "good", partial: "warn", due: "warn", overdue: "bad" };
const stateText: Record<BillState, string> = { paid: "Paid", partial: "Part paid", due: "To pay", overdue: "Overdue" };
const pretty = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Credit-card bills: the full amount due and the due date, per card. The minimum due is deliberately never shown. */
export default function Cards() {
  const { accounts, accountName, cardBills, records, staged, today, saveCardBill, deleteCardBill } = useStore();
  const [editing, setEditing] = useState<CardBill | "new" | { forCard: string } | null>(null);
  const [removing, setRemoving] = useState<CardBill | null>(null);
  // Unverified payments count too: they show as "Unverified" and as a hint on the bill until you verify them.
  const everything = [...records, ...staged];
  const views = cardViews(accounts, cardBills, everything, today);
  const upcoming = upcomingBills(views);
  const totalToPay = upcoming.reduce((s, b) => s + b.remainingPaise, 0);
  const cards = accounts.filter((a) => a.type === "credit_card" && !a.archived);

  if (cards.length === 0) {
    return (
      <>
        <PageHeader title="Card bills" />
        <Card><EmptyState title="Add a credit card first" hint="Add cards in Settings to track bills here." /></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Card bills" sub="What to pay in full, and by when. We never show the minimum due." tip="Add each bill's total and due date, or let AI read it from a statement. Paying a bill is a transfer, not spending." actions={<Button variant="primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden />Add bill</Button>} />
      <Card className="mb-4 p-5">
        {upcoming.length === 0 ? (
          <div><div className="text-lg font-semibold text-good">You&apos;re all caught up</div><p className="text-sm text-muted">{cardBills.length === 0 ? "Add a bill to start tracking due dates." : "Every card bill you track is paid."}</p></div>
        ) : (
          <div>
            <div className="text-xs text-muted">To pay across {upcoming.length} card{upcoming.length === 1 ? "" : "s"}</div>
            <div className="num text-3xl font-semibold">{formatINR(totalToPay)}</div>
            <p className="text-sm text-muted">Next: <b>{views.find((v) => v.current?.bill.id === upcoming[0].bill.id)?.card.name}</b> {dueLabel(upcoming[0].daysLeft)} ({pretty(upcoming[0].bill.dueDate)})</p>
          </div>
        )}
      </Card>

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {views.map(({ card, current, earlier }) => (
          <li key={card.id}>
            <Card className="space-y-3 p-4">
              <div className="hidden sm:block"><CardMockup large name={card.name} theme={card.theme} className="mx-auto" /></div>
              <div className="flex items-center gap-3"><h2 className="min-w-0 flex-1 truncate font-semibold">{card.name}</h2>{current && <Badge tone={tone[current.state]}>{stateText[current.state]}</Badge>}</div>
              {current ? <BillBlock s={current} onEdit={() => setEditing(current.bill)} onRemove={() => setRemoving(current.bill)} onPaid={() => saveCardBill({ ...current.bill, paid: true })} /> : (
                <div className="rounded-xl bg-background p-3 text-sm"><p className="text-muted">No bill added for this card yet.</p><Button className="mt-2" onClick={() => setEditing({ forCard: card.id })}><Plus size={14} aria-hidden />Add its bill</Button></div>
              )}
              <PaymentHistory cardId={card.id} payments={cardPayments(card.id, everything)} accountName={accountName} />
              {earlier.length > 0 && (
                <details className="group text-sm"><summary className="cursor-pointer text-muted hover:text-foreground">Earlier bills ({earlier.length})</summary>
                  <ul className="mt-2 divide-y divide-border">{earlier.map((e) => (
                    <li key={e.bill.id} className="flex items-center justify-between gap-2 py-2"><span><span className="num font-medium">{formatINR(e.bill.totalDuePaise)}</span> <span className="text-xs text-muted">due {pretty(e.bill.dueDate)}</span></span><Badge tone={tone[e.state]}>{stateText[e.state]}</Badge></li>
                  ))}</ul>
                </details>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <BillDialog item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this bill?" confirmLabel="Remove" onConfirm={() => removing && deleteCardBill(removing.id)}>
        <p>It stops being tracked here. Your payments and transactions are not changed.</p>
      </ConfirmDialog>
    </>
  );
}

/** Every payment made towards a card: the card's own record and your bank's record of it shown once. */
function PaymentHistory({ cardId, payments, accountName }: { cardId: string; payments: CardPayment[]; accountName: (id: string) => string }) {
  const row = (p: CardPayment) => (
    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{pretty(p.date)}</span>
        <span className="block truncate text-xs text-muted">{p.fromId ? `From ${accountName(p.fromId)}` : "Recorded on the card"}{!p.verified && <span className="text-warn"> · Unverified</span>}</span>
      </span>
      <span className="num shrink-0 font-medium">{formatINR(p.amountPaise)}</span>
    </li>
  );
  return (
    <section aria-label="Payment history" className="text-sm">
      <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Payment history{payments.length > 0 ? ` · ${payments.length}` : ""}</h3>
        <Link href={`/transactions?kind=cc_payment&account=${cardId}`} className="text-xs font-medium text-accent">See in Transactions</Link></div>
      {payments.length === 0 ? <p className="mt-1 text-xs text-muted">No payments recorded yet.</p> : (
        <>
          <ul className="divide-y divide-border">{payments.slice(0, 3).map(row)}</ul>
          {payments.length > 3 && <details className="group"><summary className="cursor-pointer py-1 text-xs text-muted hover:text-foreground">Show {payments.length - 3} more</summary><ul className="divide-y divide-border">{payments.slice(3).map(row)}</ul></details>}
        </>
      )}
    </section>
  );
}

function BillBlock({ s, onEdit, onRemove, onPaid }: { s: BillStatus; onEdit: () => void; onRemove: () => void; onPaid: () => void }) {
  const pct = Math.min(100, Math.round((s.paidPaise / s.bill.totalDuePaise) * 100));
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-muted">{s.state === "paid" ? "Full amount (paid)" : "Pay in full"}</div>
        <div className="num text-2xl font-semibold">{formatINR(s.state === "paid" ? s.bill.totalDuePaise : s.remainingPaise)}</div>
        {s.state === "partial" && <div className="text-xs text-muted">{formatINR(s.paidPaise)} paid of {formatINR(s.bill.totalDuePaise)}</div>}
      </div>
      {s.state !== "paid" && s.unverifiedPaise > 0 && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">A payment of {formatINR(s.unverifiedPaise)} is waiting to be verified. <Link href="/transactions?v=unverified&scope=all" className="font-medium underline">Verify it</Link> to update this bill.</p>
      )}
      {s.state === "partial" && <div className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} /></div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} aria-hidden className="text-muted" />Due {pretty(s.bill.dueDate)}</span>
        {s.state !== "paid" && <span className={s.state === "overdue" ? "font-medium text-danger" : "text-muted"}>{dueLabel(s.daysLeft)}</span>}
        <span className="text-xs text-muted">Statement {pretty(s.bill.statementDate)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.state !== "paid" && <Button variant="primary" onClick={onPaid}>Mark as paid</Button>}
        <button type="button" aria-label="Edit bill" title="Edit" onClick={onEdit} className="grid size-10 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={15} aria-hidden /></button>
        <button type="button" aria-label="Remove bill" title="Remove" onClick={onRemove} className="grid size-10 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={15} aria-hidden /></button>
      </div>
    </div>
  );
}

function BillDialog({ item, onClose }: { item: CardBill | "new" | { forCard: string } | null; onClose: () => void }) {
  const isBill = !!item && typeof item === "object" && "id" in item;
  return (
    <Dialog open={!!item} onClose={onClose} title={isBill ? "Edit card bill" : "Add a card bill"}>
      {item && <BillForm key={isBill ? (item as CardBill).id : typeof item === "object" ? `new-${item.forCard}` : "new"} item={isBill ? (item as CardBill) : null} forCard={typeof item === "object" && "forCard" in item ? item.forCard : undefined} onClose={onClose} />}
    </Dialog>
  );
}

function BillForm({ item, forCard, onClose }: { item: CardBill | null; forCard?: string; onClose: () => void }) {
  const { accounts, saveCardBill, today } = useStore();
  const cards = accounts.filter((a) => a.type === "credit_card" && !a.archived);
  const [accountId, setAccountId] = useState(item?.accountId ?? forCard ?? cards[0]?.id ?? "");
  const [statementDate, setStatementDate] = useState(item?.statementDate ?? today);
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [amount, setAmount] = useState(item ? (item.totalDuePaise / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupees(amount) ?? 0;
  const save = () => {
    const err = saveCardBill({ id: item?.id, accountId, statementDate, dueDate, totalDuePaise: paise, source: item?.source ?? "manual", batchId: item?.batchId, paid: item?.paid });
    if (err) return setError(err);
    onClose();
  };
  return (
    <div className="space-y-3">
      <FormRow label="Card"><CompactChips label="Credit card" options={cards.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[accountId]} onPick={setAccountId} /></FormRow>
      <Field label="Total amount due (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} placeholder="Full amount on the statement" /></Field>
      <p className="-mt-1 text-xs text-muted">Enter the full amount due, not the minimum.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Statement date"><Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} /></Field>
        <Field label="Payment due date"><Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setError(null); }} /></Field>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!accountId || paise <= 0 || !dueDate} onClick={save}>{item ? "Save" : "Add bill"}</Button>
      </div>
    </div>
  );
}
