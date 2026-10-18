"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardTitle, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";

export default function Settlements() {
  const { balances, settlements, addSettlement, voidSettlement, nameOf, participants, meId, today, live, partner } = useStore();
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [from, setFrom] = useState(participants.find((p) => p.id !== meId && (!live || p.id === partner?.participantId))?.id ?? meId);
  const [to, setTo] = useState(meId);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const paise = parseRupees(amount);
  const err = from === to ? "Pick two different people" : paise === null || paise <= 0 ? "Enter a valid amount" : null;

  const canSettle = !live || !!partner?.active;
  const people = live && partner ? participants.filter((p) => p.id === meId || p.id === partner.participantId) : participants;
  const prefill = (f: string, t: string, outstanding: number) => { setFrom(f); setTo(t); setAmount((outstanding / 100).toFixed(2)); setOpen(true); };

  if (live && !partner) {
    return (
      <>
        <PageHeader title="Settlements" />
        <Card><EmptyState title="Settling up is for partners" hint="Your transactions are private. Link a partner in Settings to split expenses and settle up." /><Link href="/settings" className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">Open Settings</Link></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Settlements" sub={canSettle ? "Recording a payment reduces what is owed. It never creates an expense." : "You unlinked from your partner. This is the shared history; nothing new can be recorded."} actions={canSettle ? <Button variant="primary" onClick={() => { setAmount(""); setOpen(true); }}>Record settlement</Button> : undefined} />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardTitle>Who owes whom</CardTitle>
          {balances.length === 0 ? <EmptyState title="Nothing outstanding" /> : (
            <ul className="divide-y divide-border">
              {balances.map((b) => (
                <li key={b.from + b.to} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="text-sm"><b>{nameOf(b.from)}</b> owes <b>{nameOf(b.to)}</b></div>
                    <div className="num text-xs text-muted">Owed {formatINR(b.owed)} · settled {formatINR(b.settled)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.outstanding === 0 ? <Badge tone="good">Settled</Badge> : b.settled > 0 ? <Badge tone="warn">Partial</Badge> : null}
                    <span className="num font-semibold">{formatINR(b.outstanding)}</span>
                    {canSettle && b.outstanding > 0 && <Button onClick={() => prefill(b.from, b.to, b.outstanding)}>Settle</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>History</CardTitle>
          <ul className="divide-y divide-border">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className={s.voided ? "text-muted line-through" : ""}>
                  {nameOf(s.fromId)} → {nameOf(s.toId)} <span className="num font-medium">{formatINR(s.amountPaise)}</span>
                  <div className="text-xs text-muted">{s.date}{s.note ? ` · ${s.note}` : ""}</div>
                </div>
                {s.voided ? <Badge>Voided</Badge> : !canSettle ? null : <Button variant="danger" onClick={() => setVoiding(s.id)}>Void</Button>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Voided entries stay in history (audit trail) but stop counting. Record a new one to correct an amount.</p>
        </Card>
      </div>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this settlement?" confirmLabel="Void it" onConfirm={() => voiding && voidSettlement(voiding)}>
        <p>It will stop counting, so the amount owed goes back up. It stays in the history as voided.</p>
      </ConfirmDialog>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record settlement">
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
