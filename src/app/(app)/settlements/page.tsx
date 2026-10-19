"use client";
import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardTitle, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { personLedger, settlementFor } from "@/domain/ledger";
import { formatINR, parseRupees } from "@/domain/money";

export default function Settlements() {
  const { settlements, ledgerRecords, addSettlement, voidSettlement, nameOf, participants, meId, today, live, partner } = useStore();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [from, setFrom] = useState(meId);
  const [to, setTo] = useState(meId);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const paise = parseRupees(amount);
  const err = from === to ? "Pick two different people" : paise === null || paise <= 0 ? "Enter a valid amount" : null;

  const others = participants.filter((p) => p.id !== meId);
  // You can settle with anyone except a partner you have since unlinked from.
  const canSettleWith = (id: string) => !(live && partner && !partner.active && id === partner.participantId);
  const ledgers = useMemo(() => others.map((p) => personLedger(p.id, meId, ledgerRecords, settlements)).filter((l) => l.open.length + l.settled.length > 0 || l.outstandingPaise !== 0), [others, meId, ledgerRecords, settlements]);
  const owedToMe = ledgers.filter((l) => l.outstandingPaise > 0 && canSettleWith(l.personId)).reduce((s, l) => s + l.outstandingPaise, 0);
  const iOwe = ledgers.filter((l) => l.outstandingPaise < 0 && canSettleWith(l.personId)).reduce((s, l) => s - l.outstandingPaise, 0);
  const toSettle = ledgers.filter((l) => l.outstandingPaise !== 0 && canSettleWith(l.personId));
  const canRecord = !live || others.some((p) => canSettleWith(p.id));
  const people = participants;

  const remind = async (name: string, amountPaise: number) => {
    const text = `Hi ${name}, a gentle reminder: you owe me ${formatINR(amountPaise)} for our shared expenses. Pay whenever you can, thank you!`;
    try { if (navigator.share) return await navigator.share({ text }); } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const settleAll = () => {
    for (const l of toSettle) {
      const s = settlementFor(l.personId, meId, l.open, l.outstandingPaise);
      if (s) addSettlement({ date: today, fromId: s.fromId, toId: s.toId, amountPaise: s.amountPaise, note: "Settled everything", recordIds: s.recordIds });
    }
    setAll(false);
  };

  if (live && others.length === 0) {
    return (
      <>
        <PageHeader title="Settle up" />
        <Card><EmptyState title="No one to settle with yet" hint="Add a friend or invite your partner in Settings, then split an expense with them." /><Link href="/settings" className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">Open Settings</Link></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Settle up" tip="Shows what each person owes you or you owe them from shared expenses. Settling up records the payment between you; it never creates a new expense." sub="See everything you share with each person, pick payments and settle them. Settling never creates an expense." actions={canRecord ? <Button onClick={() => { setAmount(""); setFrom(others[0]?.id ?? meId); setTo(meId); setOpen(true); }}>Record a payment</Button> : undefined} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="text-xs text-muted">You are owed</div><div className="num text-xl font-semibold text-good">{formatINR(owedToMe)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">You owe</div><div className="num text-xl font-semibold">{formatINR(iOwe)}</div></Card>
      </div>
      {toSettle.length > 0 && <Button variant="primary" className="mb-4 min-h-11 w-full sm:w-auto sm:px-6" onClick={() => setAll(true)}>Settle all with {toSettle.length} {toSettle.length === 1 ? "person" : "people"}</Button>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>People</CardTitle>
          {ledgers.length === 0 ? <EmptyState title="Nothing shared yet" hint="Split an expense with someone and it appears here." /> : (
            <ul className="divide-y divide-border">
              {ledgers.map((l) => {
                const name = nameOf(l.personId);
                const owes = l.outstandingPaise > 0;
                return (
                  <li key={l.personId} className="flex items-center gap-2 py-1.5">
                    <Link href={`/settlements/${encodeURIComponent(l.personId)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 hover:bg-background sm:px-2">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 font-semibold text-accent">{name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block text-xs text-muted">{l.open.length === 0 ? (l.outstandingPaise === 0 ? "All settled" : "Balance from earlier payments") : `${l.open.length} payment${l.open.length === 1 ? "" : "s"} to settle`}</span>
                      </span>
                      <span className="text-right">
                        <span className={`num block font-semibold ${l.outstandingPaise === 0 ? "text-muted" : owes ? "text-good" : ""}`}>{l.outstandingPaise === 0 ? "₹0" : formatINR(Math.abs(l.outstandingPaise))}</span>
                        <span className="block text-xs text-muted">{l.outstandingPaise === 0 ? "even" : owes ? "owes you" : "you owe"}</span>
                      </span>
                      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
                    </Link>
                    {owes && canSettleWith(l.personId) && <button type="button" aria-label={`Remind ${name}`} title="Send a reminder" onClick={() => void remind(name, l.outstandingPaise)} className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted hover:bg-background"><Bell size={15} aria-hidden /></button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>History</CardTitle>
          {settlements.length === 0 ? <p className="text-sm text-muted">No settlements yet.</p> : (
            <ul className="divide-y divide-border">
              {[...settlements].sort((a, b) => b.date.localeCompare(a.date)).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className={s.voided ? "text-muted line-through" : ""}>
                    {nameOf(s.fromId)} → {nameOf(s.toId)} <span className="num font-medium">{formatINR(s.amountPaise)}</span>
                    <div className="text-xs text-muted">{s.date}{s.recordIds?.length ? ` · ${s.recordIds.length} payment${s.recordIds.length === 1 ? "" : "s"}` : ""}{s.note ? ` · ${s.note}` : ""}</div>
                  </div>
                  {s.voided ? <Badge>Voided</Badge> : canRecord ? <Button variant="danger" onClick={() => setVoiding(s.id)}>Void</Button> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Voided entries stay in history but stop counting, and their payments become unsettled again.</p>
        </Card>
      </div>

      <Dialog open={all} onClose={() => setAll(false)} title="Settle everything?">
        <div className="space-y-3 pb-1 text-sm">
          <ul className="divide-y divide-border rounded-xl bg-background px-3">
            {toSettle.map((l) => (
              <li key={l.personId} className="flex items-center justify-between gap-2 py-2.5">
                <span><b>{l.outstandingPaise > 0 ? nameOf(l.personId) : "You"}</b> pay{l.outstandingPaise > 0 ? "s" : ""} <b>{l.outstandingPaise > 0 ? "you" : nameOf(l.personId)}</b></span>
                <span className="num font-semibold">{formatINR(Math.abs(l.outstandingPaise))}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted">Every open payment with these people is marked settled. You can void any of them afterwards from the history.</p>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button onClick={() => setAll(false)}>Cancel</Button>
            <Button variant="primary" onClick={settleAll}>Yes, settle all</Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this settlement?" confirmLabel="Void it" onConfirm={() => voiding && voidSettlement(voiding)}>
        <p>It will stop counting, so the amount owed goes back up and its payments become unsettled. It stays in the history as voided.</p>
      </ConfirmDialog>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a payment">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Paid to"><Select value={to} onChange={(e) => setTo(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
          <Field label="Amount (₹)" error={amount ? err : null}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!!err} onClick={() => { addSettlement({ date: today, fromId: from, toId: to, amountPaise: paise!, note: note || undefined }); setOpen(false); }}>Save</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
