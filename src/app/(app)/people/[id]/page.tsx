"use client";
import { ArrowLeft, Bell, Camera, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ChipGroup, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { PersonGlyph } from "@/components/glyphs";
import { toSquareJpeg } from "@/lib/profile/image";
import { useStore } from "@/data/store";
import { personLedger, settlementFor, type LedgerEntry } from "@/domain/ledger";
import { formatINR } from "@/domain/money";

/** Everything you share with one person: pick payments and settle just those, or settle everything at once. */
export default function PersonSettle() {
  const { id: raw } = useParams<{ id: string }>();
  const personId = decodeURIComponent(raw);
  const { participants, meId, ledgerRecords, settlements, addSettlement, voidSettlement, nameOf, today, live, partner, voucherBrands, setParticipantPhoto } = useStore();
  const [photoError, setPhotoError] = useState<string | null>(null);
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
  const name = nameOf(person.id);
  // Friends (no account) and demo people can have a photo set here; yourself and a linked partner come from their own profiles.
  const canEditPhoto = personId !== meId && (!live || person.userId === null);
  const pickPhoto = async (file: File) => {
    setPhotoError(null);
    try { setPhotoError(setParticipantPhoto(personId, await toSquareJpeg(file, 192))); } catch { setPhotoError("Could not use that image. Try a JPEG or PNG photo."); }
  };
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
      <Card className="mb-3 space-y-3 p-3.5 sm:p-4">
        <div className="flex items-center gap-3">
          <Link href="/people" aria-label="Back to People" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-background hover:text-foreground"><ArrowLeft size={18} aria-hidden /></Link>
          <span className="relative shrink-0">
            <PersonGlyph name={name} id={personId} size={44} />
            {canEditPhoto && (
              <label title={person.photo ? "Change photo" : "Add photo"} className="absolute -bottom-1 -right-1 grid size-6 cursor-pointer place-items-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-foreground focus-within:outline-2 focus-within:outline-accent">
                <Camera size={12} aria-hidden />
                <input type="file" accept="image/*" className="sr-only" aria-label={`Upload a photo of ${name}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickPhoto(f); }} />
              </label>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{name}</h1>
            <div className="flex items-baseline gap-1.5">
              <span className={`num text-xl font-semibold leading-tight ${out > 0 ? "text-good" : ""}`}>{out === 0 ? "₹0" : formatINR(Math.abs(out))}</span>
              <span className="text-xs text-muted">{out === 0 ? "all settled" : out > 0 ? "owes you" : "you owe"}</span>
            </div>
          </div>
        </div>
        {out !== 0 && canSettle && (
          <div className="flex gap-2">
            <Button variant="primary" className="min-h-10 flex-1" onClick={() => setConfirm("everything")}>Settle everything</Button>
            {out > 0 && <Button className="min-h-10" aria-label={`Remind ${name}`} onClick={() => void remind()}><Bell size={15} aria-hidden />Remind</Button>}
          </div>
        )}
        {person.photo && canEditPhoto && <button type="button" onClick={() => setPhotoError(setParticipantPhoto(personId, null))} className="text-xs font-medium text-muted hover:text-danger">Remove photo</button>}
        {photoError && <p role="alert" className="text-xs text-danger">{photoError}</p>}
        {ledger.unlinkedPaise !== 0 && <p className="text-xs text-muted">{formatINR(Math.abs(ledger.unlinkedPaise))} of this comes from earlier payments recorded as a plain amount, not tied to specific purchases.</p>}
      </Card>

      <div className="mb-2 flex items-center justify-between gap-2">
        <ChipGroup tabs label="Payments" value={tab} onChange={(v) => { setTab(v); setPicked(new Set()); }} options={[{ id: "open", label: `To settle (${ledger.open.length})` }, { id: "settled", label: `Settled (${ledger.settled.length})` }]} />
        {tab === "open" && canSettle && ledger.open.length > 1 && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allOpenPicked} onChange={() => setPicked(allOpenPicked ? new Set() : new Set(ledger.open.map((e) => e.record.id)))} className="size-4 accent-[var(--accent)]" />Select all</label>
        )}
      </div>

      <Card className="p-1.5 sm:p-2">
        {rows.length === 0 ? <EmptyState title={tab === "open" ? "Nothing to settle" : "Nothing settled yet"} hint={tab === "open" ? `Payments you split with ${name} appear here.` : "Payments you settle move here."} /> : (
          <ul className="divide-y divide-border">
            {rows.map((e) => {
              const r = e.record;
              const theyOwe = e.sharePaise > 0;
              const sel = picked.has(r.id);
              const short = new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
              const wallet = r.paidWithVoucherId ? voucherBrands.find((b) => b.id === r.paidWithVoucherId)?.name ?? "voucher" : "";
              return (
                <li key={r.id}>
                  <label className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${tab === "open" && canSettle ? "cursor-pointer hover:bg-background" : ""} ${sel ? "bg-accent/5" : ""}`}>
                    {tab === "open" && canSettle && <input type="checkbox" checked={sel} onChange={() => toggle(r.id)} aria-label={`Select ${r.merchant}`} className="size-[18px] shrink-0 accent-[var(--accent)]" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">{r.merchant}</span>
                      <span className="block truncate text-[11px] leading-tight text-muted">{short} · {r.payerId === meId ? "you paid" : `${name} paid`} {formatINR(r.amountPaise)}{wallet ? ` · ${wallet} wallet` : ""}</span>
                    </span>
                    <span className={`num shrink-0 text-sm font-semibold ${theyOwe ? "text-good" : ""}`}>{theyOwe ? "+" : "−"}{formatINR(Math.abs(e.sharePaise))}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {mine.length > 0 && (
        <details className="group mt-3 rounded-[var(--radius-card)] bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-muted"><span>Settlements with {name} · {mine.length}</span><ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" /></summary>
          <ul className="divide-y divide-border px-4 pb-2">
            {mine.map((st) => (
              <li key={st.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className={st.voided ? "text-muted line-through" : ""}>{nameOf(st.fromId)} → {nameOf(st.toId)} <span className="num font-medium">{formatINR(st.amountPaise)}</span><div className="text-xs text-muted">{st.date}{st.recordIds?.length ? ` · ${st.recordIds.length} payment${st.recordIds.length === 1 ? "" : "s"}` : ""}{st.note ? ` · ${st.note}` : ""}</div></div>
                {st.voided ? <Badge>Voided</Badge> : canSettle ? <Button variant="danger" onClick={() => setVoiding(st.id)}>Void</Button> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-40 z-20 mt-3 sm:bottom-4">
          <div className="flex items-center gap-2 rounded-2xl bg-foreground py-2 pl-4 pr-2 text-white shadow-lg">
            <div className="min-w-0 flex-1 leading-tight"><span className="text-sm"><b>{chosen.length}</b> selected{net !== 0 && <> · <b className="num">{formatINR(Math.abs(net))}</b></>}</span><span className="block truncate text-xs text-white/70">{net === 0 ? "they cancel out" : net > 0 ? `${name} owes you` : `You owe ${name}`}</span></div>
            <button type="button" onClick={() => setPicked(new Set())} className="min-h-10 rounded-full px-3 text-sm text-white/80 hover:text-white">Clear</button>
            <Button variant="primary" className="min-h-10" disabled={!selSettlement} onClick={() => setConfirm("selected")}>Settle these</Button>
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
