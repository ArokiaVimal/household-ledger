"use client";
import { ArrowLeft, Bell, Camera, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { CategoryGlyph, PersonGlyph } from "@/components/glyphs";
import { MerchantAvatar } from "@/components/txn-row";
import { TxnEditDialog, useRecordNav } from "@/components/txn-edit-dialog";
import { cn } from "@/lib/cn";
import { toSquareJpeg } from "@/lib/profile/image";
import { useStore } from "@/data/store";
import { UpiPay } from "@/components/upi-pay";
import { relationshipText } from "@/domain/contacts";
import { personLedger, settlementFor, type LedgerEntry } from "@/domain/ledger";
import { formatINR } from "@/domain/money";

/** Everything you share with one person: pick payments and settle just those, or settle everything at once. */
export default function PersonSettle() {
  const { id: raw } = useParams<{ id: string }>();
  const personId = decodeURIComponent(raw);
  const { participants, meId, ledgerRecords, settlements, addSettlement, voidSettlement, nameOf, today, live, partner, partnerId, voucherBrands, categories, records, setParticipantPhoto } = useStore();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "settled">("open");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<"selected" | "everything" | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const person = participants.find((p) => p.id === personId);
  const ledger = useMemo(() => personLedger(personId, meId, ledgerRecords, settlements), [personId, meId, ledgerRecords, settlements]);
  const canSettle = !(live && partner && !partner.active && personId === partner.participantId);
  // Tapping a payment opens its full edit screen (with next/previous); the checkbox only selects it for settling.
  // What is shown here can be the copy shared with them (no card, no category); editing opens your own full record.
  const ownById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const recNav = useRecordNav((tab === "open" ? ledger.open : ledger.settled).map((e) => ownById.get(e.record.id) ?? e.record));

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
  // Grouped by day, like the Transactions tab.
  const days = (() => {
    const m = new Map<string, { date: string; entries: LedgerEntry[]; total: number }>();
    for (const e of rows) { const d = m.get(e.record.date) ?? { date: e.record.date, entries: [], total: 0 }; d.entries.push(e); d.total += e.sharePaise; m.set(e.record.date, d); }
    return [...m.values()].sort((x, y) => y.date.localeCompare(x.date));
  })();
  // Months with their net, so a long history reads in chunks.
  const months = (() => {
    const m = new Map<string, { month: string; days: typeof days; total: number }>();
    for (const d of days) { const k = d.date.slice(0, 7); const g = m.get(k) ?? { month: k, days: [], total: 0 }; g.days.push(d); g.total += d.total; m.set(k, g); }
    return [...m.values()];
  })();
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayLabel = (iso: string) => {
    const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  };
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
      <section aria-label={`${name} summary`} className={`mb-3 rounded-3xl border border-border/60 p-4 shadow-sm ${out > 0 ? "bg-gradient-to-br from-good/[0.12] via-surface to-surface" : out < 0 ? "bg-gradient-to-br from-warn/[0.12] via-surface to-surface" : "bg-surface"}`}>
        <div className="flex items-center gap-3">
          <Link href="/people" aria-label="Back to People" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface/80 text-muted ring-1 ring-border/60 hover:text-foreground"><ArrowLeft size={17} aria-hidden /></Link>
          <span className="relative shrink-0">
            <span className="block rounded-full ring-4 ring-surface"><PersonGlyph name={name} id={personId} size={56} /></span>
            {canEditPhoto && (
              <label title={person.photo ? "Change photo" : "Add photo"} className="absolute -bottom-0.5 -right-0.5 grid size-6 cursor-pointer place-items-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-foreground focus-within:outline-2 focus-within:outline-accent">
                <Camera size={12} aria-hidden />
                <input type="file" accept="image/*" className="sr-only" aria-label={`Upload a photo of ${name}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickPhoto(f); }} />
              </label>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold leading-tight tracking-tight">{name}</h1>
            <span className="mt-0.5 inline-block rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-border/60">{personId === partnerId ? "Partner" : relationshipText(person)}</span>
          </div>
          {out > 0 && canSettle && <button type="button" aria-label={`Remind ${name}`} title={`Remind ${name}`} onClick={() => void remind()} className="grid size-10 shrink-0 place-items-center rounded-full bg-surface/80 text-foreground ring-1 ring-border/60 hover:bg-surface"><Bell size={17} aria-hidden /></button>}
        </div>
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{out === 0 ? "All settled" : out > 0 ? `${name} owes you` : `You owe ${name}`}</div>
          <div className={`num text-[34px] font-semibold leading-tight tracking-tight ${out > 0 ? "text-good" : out < 0 ? "text-warn" : ""}`}>{out === 0 ? "₹0" : formatINR(Math.abs(out))}</div>
        </div>
        {out !== 0 && canSettle && <div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="primary" className="min-h-10 px-5" onClick={() => setConfirm("everything")}>Settle everything</Button>{out < 0 && <UpiPay personId={personId} amountPaise={-out} note="Shared expenses" />}</div>}
        {person.photo && canEditPhoto && <button type="button" onClick={() => setPhotoError(setParticipantPhoto(personId, null))} className="mt-2 block text-xs font-medium text-muted hover:text-danger">Remove photo</button>}
        {photoError && <p role="alert" className="mt-2 text-xs text-danger">{photoError}</p>}
        {ledger.unlinkedPaise !== 0 && <p className="mt-3 text-xs text-muted">{formatINR(Math.abs(ledger.unlinkedPaise))} of this comes from earlier payments recorded as a plain amount, not tied to specific purchases.</p>}
      </section>

      <div className="mb-2 flex items-center gap-2">
        <div role="tablist" aria-label="Payments" className="flex min-w-0 flex-1 rounded-full bg-border/60 p-1">
          {([["open", "To settle", ledger.open.length], ["settled", "Settled", ledger.settled.length]] as const).map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setPicked(new Set()); }} className={cn("flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-all", tab === id ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
              {label}<span className={cn("num rounded-full px-1.5 text-[11px] font-semibold leading-5", tab === id ? "bg-accent/10 text-accent" : "bg-border text-muted")}>{n}</span>
            </button>
          ))}
        </div>
        {tab === "open" && canSettle && ledger.open.length > 1 && (
          <label className="flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-sm text-muted hover:text-foreground"><input type="checkbox" checked={allOpenPicked} onChange={() => setPicked(allOpenPicked ? new Set() : new Set(ledger.open.map((e) => e.record.id)))} className="size-[18px] accent-[var(--accent)]" />All</label>
        )}
      </div>

      <Card className="p-1.5 sm:p-2">
        {rows.length === 0 ? <EmptyState title={tab === "open" ? "Nothing to settle" : "Nothing settled yet"} hint={tab === "open" ? `Payments you split with ${name} appear here.` : "Payments you settle move here."} /> : (
          <div className="space-y-3">
            {months.map((mo) => (
              <div key={mo.month}>
                {months.length > 1 && <div className="flex items-baseline justify-between px-2 pb-1 pt-1"><h2 className="text-sm font-semibold">{monthLabel(mo.month)}</h2><span className="num text-xs text-muted">{mo.total > 0 ? "+" : mo.total < 0 ? "−" : ""}{formatINR(Math.abs(mo.total))}</span></div>}
                <div className="space-y-1.5">
                  {mo.days.map((d) => (
                    <section key={d.date} aria-label={dayLabel(d.date)}>
                      <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted">{dayLabel(d.date)}</div>
                      <ul className="divide-y divide-border">
                        {d.entries.map((e) => {
                          const r = e.record;
                          const theyOwe = e.sharePaise > 0;
                          const sel = picked.has(r.id);
                          const wallet = r.paidWithVoucherId ? voucherBrands.find((b) => b.id === r.paidWithVoucherId)?.name ?? "voucher" : "";
                          return (
                            <li key={r.id}>
                              <div className={`flex items-center rounded-xl ${sel ? "bg-accent/5" : ""}`}>
                                {tab === "open" && canSettle && (
                                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center"><input type="checkbox" checked={sel} onChange={() => toggle(r.id)} aria-label={`Select ${r.merchant}`} className="size-[18px] accent-[var(--accent)]" /></label>
                                )}
                                <button type="button" onClick={() => recNav.open(r)} aria-label={`Open ${r.merchant}`} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pr-2 text-left hover:bg-background active:bg-background ${tab === "open" && canSettle ? "" : "pl-2"}`}>
                                  {(() => { const c = categories.find((x) => x.id === r.categoryId); return <MerchantAvatar name={r.merchant} size={34} fallback={<CategoryGlyph name={c?.name ?? "Uncategorized"} icon={c?.icon} size={34} />} />; })()}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium leading-tight">{r.merchant}</span>
                                    <span className="block truncate text-[11px] leading-tight text-muted">{r.payerId === meId ? "you paid" : `${name} paid`} {formatINR(r.amountPaise)}{wallet ? ` · ${wallet} wallet` : ""}</span>
                                  </span>
                                  <span className="shrink-0 text-right leading-tight">
                                    <span className={`num block text-sm font-semibold ${theyOwe ? "text-good" : ""}`}>{formatINR(Math.abs(e.sharePaise))}</span>
                                    <span className={`block text-[10px] ${theyOwe ? "text-good/80" : "text-muted"}`}>{theyOwe ? "you lent" : "you owe"}</span>
                                  </span>
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            ))}
          </div>
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

      {chosen.length > 0 && <div aria-hidden className="h-20 md:hidden" />}
      {chosen.length > 0 && (
        <div data-selection-bar className="fixed inset-x-3 bottom-[calc(var(--sab,0px)+4.75rem)] z-40 md:sticky md:inset-x-auto md:bottom-4 md:mt-3">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl bg-foreground py-2 pl-4 pr-2 text-white shadow-lg">
            <div className="min-w-0 flex-1 leading-tight"><span className="text-sm"><b>{chosen.length}</b> selected{net !== 0 && <> · <b className="num">{formatINR(Math.abs(net))}</b></>}</span><span className="block truncate text-xs text-white/70">{net === 0 ? "they cancel out" : net > 0 ? `${name} owes you` : `You owe ${name}`}</span></div>
            <button type="button" onClick={() => setPicked(new Set())} className="min-h-10 rounded-full px-3 text-sm text-white/80 hover:text-white">Clear</button>
            <Button variant="primary" className="min-h-10" disabled={!selSettlement} onClick={() => setConfirm("selected")}>Settle these</Button>
          </div>
        </div>
      )}

      <TxnEditDialog record={recNav.record} onClose={recNav.close} nav={recNav.nav} />
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
