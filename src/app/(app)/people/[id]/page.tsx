"use client";
import { ArrowLeft, Bell } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ChipGroup, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { personLedger, settlementFor, type LedgerEntry } from "@/domain/ledger";
import { formatINR } from "@/domain/money";

/** Everything you share with one person: pick payments and settle just those, or settle everything at once. */
export default function PersonSettle() {
  const { id: raw } = useParams<{ id: string }>();
  const personId = decodeURIComponent(raw);
  const { participants, meId, ledgerRecords, settlements, addSettlement, voidSettlement, nameOf, today, live, partner, voucherBrands } = useStore();
  const [tab, setTab] = useState<"open" | "settled">("open");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<"selected" | "everything" | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const person = participants.find((p) => p.id === personId);
  const ledger = useMemo(() => personLedger(personId, meId, ledgerRecords, settlements), [personId, meId, ledgerRecords, settlements]);
  const canSettle = !(live && partner && !partner.active && personId === partner.participantId);

  if (!person) {
    return (
      <>
        <PageHeader title="People" />
        <Card><EmptyState title="We could not find that person" /><Link href="/people" className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">Back to People</Link></Card>
      </>
    );
  }
  const name = person.name;
  const out = ledger.outstandingPaise;
  const rows: LedgerEntry[] = tab === "open" ? ledger.open : ledger.settled;
  const chosen = ledger.open.filter((e) => picked.has(e.record.id));
  const net = chosen.reduce((s, e) => s + e.sharePaise, 0);
  const selSettlement = settlementFor(personId, meId, chosen);
  const allSettlement = settlementFor(personId, meId, ledger.open, out);
  const toggle = (rid: string) => setPicked((p) => { const n = new Set(p); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });
  const allOpenPicked = ledger.open.length > 0 && ledger.open.every((e) => picked.has(e.record.id));
  const done = (s: NonNullable<typeof selSettlement>, note: string) => { addSettlement({ date: today, fromId: s.fromId, toId: s.toId, amountPaise: s.amountPaise, note, recordIds: s.recordIds }); setPicked(new Set()); setConfirm(null); };
  const remind = async () => {
    const text = `Hi ${name}, a gentle reminder: you owe me ${formatINR(out)} for our shared expenses. Pay whenever you can, thank you!`;
    try { if (navigator.share) return await navigator.share({ text }); } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const mine = settlements.filter((s) => [s.fromId, s.toId].includes(personId) && [s.fromId, s.toId].includes(meId)).sort((a, b) => b.date.localeCompare(a.date));
  const who = (amt: number) => (amt > 0 ? <><b>{name}</b> pays <b>you</b></> : <><b>You</b> pay <b>{name}</b></>);

  return (
    <>
      <Link href="/people" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={14} aria-hidden />People</Link>
      <PageHeader title={name} sub="Everything you share, in one place." />

      <Card className="mb-4 space-y-3 p-5">
        <div>
          <div className="text-xs text-muted">{out === 0 ? "Balance" : out > 0 ? `${name} owes you` : `You owe ${name}`}</div>
          <div className={`num text-3xl font-semibold ${out > 0 ? "text-good" : ""}`}>{out === 0 ? "All settled" : formatINR(Math.abs(out))}</div>
        </div>
        {out !== 0 && canSettle && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" className="min-h-11 px-5" onClick={() => setConfirm("everything")}>Settle everything</Button>
            {out > 0 && <Button onClick={() => void remind()}><Bell size={14} aria-hidden />Remind {name}</Button>}
          </div>
        )}
        {ledger.unlinkedPaise !== 0 && <p className="text-xs text-muted">{formatINR(Math.abs(ledger.unlinkedPaise))} of this comes from earlier payments that were recorded as a plain amount, not tied to specific purchases.</p>}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ChipGroup tabs label="Payments" value={tab} onChange={(v) => { setTab(v); setPicked(new Set()); }} options={[{ id: "open", label: `To settle (${ledger.open.length})` }, { id: "settled", label: `Settled (${ledger.settled.length})` }]} />
        {tab === "open" && canSettle && ledger.open.length > 1 && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allOpenPicked} onChange={() => setPicked(allOpenPicked ? new Set() : new Set(ledger.open.map((e) => e.record.id)))} className="size-4 accent-[var(--accent)]" />Select all</label>
        )}
      </div>

      <Card className="p-2 sm:p-3">
        {rows.length === 0 ? <EmptyState title={tab === "open" ? "Nothing to settle" : "Nothing settled yet"} hint={tab === "open" ? `Payments you split with ${name} appear here.` : "Payments you settle move here."} /> : (
          <ul className="divide-y divide-border">
            {rows.map((e) => {
              const r = e.record;
              const theyOwe = e.sharePaise > 0;
              const sel = picked.has(r.id);
              return (
                <li key={r.id}>
                  <label className={`flex items-center gap-3 rounded-xl px-2 py-3 ${tab === "open" && canSettle ? "cursor-pointer hover:bg-background" : ""} ${sel ? "bg-accent/5" : ""}`}>
                    {tab === "open" && canSettle && <input type="checkbox" checked={sel} onChange={() => toggle(r.id)} aria-label={`Select ${r.merchant}`} className="size-5 shrink-0 accent-[var(--accent)]" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.merchant}</span>
                      <span className="block text-xs text-muted">{r.date} · {r.payerId === meId ? "You paid" : `${name} paid`} {formatINR(r.amountPaise)}{r.paidWithVoucherId ? ` from the ${voucherBrands.find((b) => b.id === r.paidWithVoucherId)?.name ?? "voucher"} wallet` : ""}</span>
                    </span>
                    <span className="text-right">
                      <span className={`num block font-semibold ${theyOwe ? "text-good" : ""}`}>{theyOwe ? "+" : "−"}{formatINR(Math.abs(e.sharePaise))}</span>
                      <span className="block text-xs text-muted">{theyOwe ? "owes you" : "you owe"}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {mine.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Settlements with {name}</h2>
          <ul className="divide-y divide-border">
            {mine.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className={s.voided ? "text-muted line-through" : ""}>{nameOf(s.fromId)} → {nameOf(s.toId)} <span className="num font-medium">{formatINR(s.amountPaise)}</span><div className="text-xs text-muted">{s.date}{s.recordIds?.length ? ` · ${s.recordIds.length} payment${s.recordIds.length === 1 ? "" : "s"}` : ""}{s.note ? ` · ${s.note}` : ""}</div></div>
                {s.voided ? <Badge>Voided</Badge> : canSettle ? <Button variant="danger" onClick={() => setVoiding(s.id)}>Void</Button> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-24 z-20 mt-4 sm:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-white shadow-lg">
            <div className="text-sm"><b>{chosen.length}</b> selected · {net === 0 ? "they cancel out" : <>{net > 0 ? `${name} owes you` : `You owe ${name}`} <b className="num">{formatINR(Math.abs(net))}</b></>}</div>
            <div className="flex gap-2"><Button className="border-0 bg-white/15 text-white hover:bg-white/25" onClick={() => setPicked(new Set())}>Clear</Button><Button variant="primary" disabled={!selSettlement} onClick={() => setConfirm("selected")}>Settle these</Button></div>
          </div>
        </div>
      )}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "everything" ? `Settle everything with ${name}?` : "Settle these payments?"}>
        {confirm && (() => {
          const s = confirm === "everything" ? allSettlement : selSettlement;
          if (!s) return null;
          return (
            <div className="space-y-3 pb-1 text-sm">
              <p>{who(s.fromId === personId ? 1 : -1)} <b className="num">{formatINR(s.amountPaise)}</b>{confirm === "selected" ? <> for <b>{s.recordIds.length}</b> payment{s.recordIds.length === 1 ? "" : "s"}</> : <>, covering all {s.recordIds.length} open payment{s.recordIds.length === 1 ? "" : "s"}</>}.</p>
              <p className="text-muted">This marks them settled. It never counts as spending, and you can void it later from the history.</p>
              <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
                <Button onClick={() => setConfirm(null)}>Cancel</Button>
                <Button variant="primary" onClick={() => done(s, confirm === "everything" ? "Settled everything" : `Settled ${s.recordIds.length} payment${s.recordIds.length === 1 ? "" : "s"}`)}>Yes, settle</Button>
              </div>
            </div>
          );
        })()}
      </Dialog>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this settlement?" confirmLabel="Void it" onConfirm={() => voiding && voidSettlement(voiding)}>
        <p>It will stop counting, so the amount owed goes back up and its payments become unsettled again.</p>
      </ConfirmDialog>
    </>
  );
}
