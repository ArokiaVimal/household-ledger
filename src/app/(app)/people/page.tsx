"use client";
import { Bell, ChevronRight, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PersonGlyph } from "@/components/glyphs";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, InfoTip, Input, PageHeader, Select } from "@/components/ui";
import { LinkedWithYou } from "@/components/links";
import { useStore } from "@/data/store";
import { personLedger, settlementFor } from "@/domain/ledger";
import { formatINR, parseRupees } from "@/domain/money";

export default function People() {
  const { settlements, ledgerRecords, addSettlement, voidSettlement, addParticipant, nameOf, participants, meId, today, live, partner } = useStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const addPerson = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addParticipant(newName, newEmail.trim() ? { email: newEmail.trim() } : {});
    if (r.error) { setAddError(r.error); return; }
    setAdding(false); setNewName(""); setNewEmail(""); setAddError(null);
  };
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
  const ledgers = useMemo(() => others.map((p) => personLedger(p.id, meId, ledgerRecords, settlements)), [others, meId, ledgerRecords, settlements]);
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
        <PageHeader title="People" />
        <LinkedWithYou />
        <Card><EmptyState title="No one here yet" hint="Add someone you split with, then split an expense with them." /><Button variant="primary" className="mt-3" onClick={() => setAdding(true)}><UserPlus size={16} aria-hidden />Add person</Button></Card>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add person">
        <form onSubmit={addPerson} className="space-y-3 pb-1 text-sm">
          <Field label="Name"><Input autoFocus value={newName} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} maxLength={60} placeholder="e.g. Karthik" /></Field>
          <Field label="Email (optional)"><Input type="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Only used to match them if they join later" /></Field>
          {addError && <p role="alert" className="text-danger">{addError}</p>}
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button type="button" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!newName.trim()}>Add</Button>
          </div>
        </form>
      </Dialog>
      </>
    );
  }
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-1 text-xl font-semibold tracking-tight">People<InfoTip text="Who owes whom. Settling up records a payment, never an expense." /></h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button aria-label="Add person" title="Add person" onClick={() => { setAddError(null); setAdding(true); }}><UserPlus size={16} aria-hidden /><span className="hidden sm:inline">Add person</span></Button>
          {canRecord && <Button onClick={() => { setAmount(""); setFrom(others[0]?.id ?? meId); setTo(meId); setOpen(true); }}>Record payment</Button>}
        </div>
      </div>

      <LinkedWithYou />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Card className="px-3.5 py-2.5"><div className="text-xs text-muted">You are owed</div><div className="num text-lg font-semibold text-good">{formatINR(owedToMe)}</div></Card>
        <Card className="px-3.5 py-2.5"><div className="text-xs text-muted">You owe</div><div className="num text-lg font-semibold">{formatINR(iOwe)}</div></Card>
      </div>
      {toSettle.length > 0 && <Button variant="primary" className="mb-3 min-h-10 w-full sm:w-auto sm:px-6" onClick={() => setAll(true)}>Settle all with {toSettle.length} {toSettle.length === 1 ? "person" : "people"}</Button>}

      <div className="space-y-3">
        <Card className="px-3 py-1">
          {ledgers.length === 0 ? <EmptyState title="No one here yet" hint="Add a friend in Settings, then split an expense with them." /> : (
            <ul className="divide-y divide-border">
              {ledgers.map((l) => {
                const name = nameOf(l.personId);
                const owes = l.outstandingPaise > 0;
                return (
                  <li key={l.personId} className="flex items-center gap-2 py-0.5">
                    <Link href={`/people/${encodeURIComponent(l.personId)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 hover:bg-background sm:px-2">
                      <PersonGlyph name={name} id={l.personId} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block text-xs text-muted">{l.open.length === 0 ? (l.outstandingPaise === 0 ? (l.settled.length === 0 ? "Nothing shared yet" : "All settled") : "Earlier balance") : `${l.open.length} open`}</span>
                      </span>
                      <span className="text-right">
                        <span className={`num block font-semibold ${l.outstandingPaise === 0 ? "text-muted" : owes ? "text-good" : ""}`}>{l.outstandingPaise === 0 ? "₹0" : formatINR(Math.abs(l.outstandingPaise))}</span>
                        <span className="block text-xs text-muted">{l.outstandingPaise === 0 ? "even" : owes ? "owes you" : "you owe"}</span>
                      </span>
                      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
                    </Link>
                    {owes && canSettleWith(l.personId) && <button type="button" aria-label={`Remind ${name}`} title="Send a reminder" onClick={() => void remind(name, l.outstandingPaise)} className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted hover:bg-background"><Bell size={15} aria-hidden /></button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <details className="group rounded-[var(--radius-card)] bg-surface px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium"><span>History{settlements.length > 0 ? ` · ${settlements.length}` : ""}</span><ChevronRight size={16} aria-hidden className="text-muted transition-transform group-open:rotate-90" /></summary>
          <div className="mt-3">
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
          </div>
        </details>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add person">
        <form onSubmit={addPerson} className="space-y-3 pb-1 text-sm">
          <Field label="Name"><Input autoFocus value={newName} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} maxLength={60} placeholder="e.g. Karthik" /></Field>
          <Field label="Email (optional)"><Input type="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Only used to match them if they join later" /></Field>
          {addError && <p role="alert" className="text-danger">{addError}</p>}
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button type="button" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!newName.trim()}>Add</Button>
          </div>
        </form>
      </Dialog>
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
          <p className="text-muted">All open payments are marked settled. You can void any later.</p>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button onClick={() => setAll(false)}>Cancel</Button>
            <Button variant="primary" onClick={settleAll}>Yes, settle all</Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this settlement?" confirmLabel="Void it" onConfirm={() => voiding && voidSettlement(voiding)}>
        <p>It stops counting, and the amount owed goes back up. It stays in history as voided.</p>
      </ConfirmDialog>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a payment">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}</Select></Field>
            <Field label="Paid to"><Select value={to} onChange={(e) => setTo(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}</Select></Field>
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
