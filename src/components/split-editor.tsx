"use client";
import { Check, Equal, Gift, HandCoins, IndianRupee, ListChecks, Minus, Percent, PieChart, Plus, SlidersHorizontal, Trash2, User, Wallet, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, equalSplit, itemsExtra, itemSubtotals, ratioSplit, sameSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitItem, SplitMode } from "@/domain/types";
import { relationshipText } from "@/domain/contacts";
import { Dot, PersonGlyph } from "./glyphs";
import { Button, Input } from "./ui";


/** The three one-tap splits: who pays it all, or that you covered it for them. */
const quickLook = (label: string): { Icon: LucideIcon; tone: string } =>
  /^I owe all$/.test(label) ? { Icon: Wallet, tone: "bg-violet-100 text-violet-700" } : /^I paid for them$/.test(label) ? { Icon: Gift, tone: "bg-emerald-100 text-emerald-700" } : { Icon: HandCoins, tone: "bg-amber-100 text-amber-700" };

/** Every way to split, with one plain sentence each so nobody has to guess what a mode means. */
const MODE_ICON: Record<SplitMode, [LucideIcon, string]> = {
  equal: [Equal, "bg-sky-100 text-sky-700"], custom: [IndianRupee, "bg-emerald-100 text-emerald-700"], percent: [Percent, "bg-violet-100 text-violet-700"], shares: [PieChart, "bg-amber-100 text-amber-700"],
  adjust: [SlidersHorizontal, "bg-pink-100 text-pink-700"], items: [ListChecks, "bg-orange-100 text-orange-700"], personal: [User, "bg-slate-100 text-slate-600"],
};
const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: "equal", label: "Equally", hint: "Everyone ticked pays the same." },
  { id: "custom", label: "Exact amounts", hint: "Type what each person owes. It must add up to the total." },
  { id: "percent", label: "Percentages", hint: "Give each person a percentage. They must add up to 100%." },
  { id: "shares", label: "Shares", hint: "2 shares pay twice what 1 share pays. Handy for adults and kids, or rooms of different sizes." },
  { id: "adjust", label: "Adjustments", hint: "Split equally, then add to or take off someone's share, for example an extra dish." },
  { id: "items", label: "By item", hint: "Add each item and tick who had it. Tax, tip and fees are shared in proportion to what each person ordered." },
  { id: "personal", label: "One person", hint: "Only one person owes this." },
];

const evenBps = (ids: string[]) => {
  const base = Math.floor(10000 / ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, base + (i === 0 ? 10000 - base * ids.length : 0)]));
};
const newItemId = () => `i${Math.random().toString(36).slice(2, 9)}`;
const signedRupees = (text: string): number | null => (text.trim() === "" || text.trim() === "-" || text.trim() === "+" ? 0 : parseRupees(text.replace(/^\+/, "")));
const firstName = (s: string) => s.trim().split(/\s+/)[0] || s;

/** Controlled editor. Amounts shown come from computeShares, never recomputed here. */
export function SplitEditor({ total, value, onChange, peopleLabel = "Split with", only }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void; /** The label of the people row, when a heading above already says "Split with". */ peopleLabel?: string; /** Limits who can be in the split (a Split Group's people). You are always in. */ only?: string[] }) {
  const { nameOf, participants, meId, splitRatio, partnerId, pendingPartner, live, partner, addParticipant } = useStore();
  // The couple's usual two-way split (set in Settings). Anchored to the person it names, not to whoever is signed in,
  // so the same expense is split the same way on both phones.
  const ownerId = participants.some((p) => p.id === splitRatio.leaderId) ? splitRatio.leaderId : meId;
  const pct = (bps: number) => `${Number.isInteger(bps / 100) ? bps / 100 : (bps / 100).toFixed(1)}`;
  const ME = "__me";
  const nobody: SplitConfig = { mode: "personal", participantIds: [meId] };
  const others = value.participantIds.filter((id) => id !== meId);
  // You can be left out of the split: you paid, but the expense is for the others only.
  const meIn = value.participantIds.includes(meId);
  const excludeMe = others.length > 0 && !meIn;
  const people = participants.filter((p) => p.id !== meId && (!only || only.includes(p.id))); // inside a group: only the group's people
  // People you split with most come first.
  const { records, staged } = useStore();
  const rankedPeople = useMemo(() => {
    const uses = new Map<string, number>();
    for (const r of [...records, ...staged]) if (r.split.mode !== "personal") for (const id of r.split.participantIds) uses.set(id, (uses.get(id) ?? 0) + 1);
    return people.map((p, i) => ({ p, i })).sort((a, b) => (uses.get(b.p.id) ?? 0) - (uses.get(a.p.id) ?? 0) || a.i - b.i).map((x) => x.p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, staged, participants, meId]);
  // The usual way to split with one person: your couple ratio with your partner, otherwise down the middle.
  const usualWith = (o: string): SplitConfig => (o === partnerId && splitRatio.leaderBps !== 5000
    ? ratioSplit(ownerId, ownerId === meId ? o : meId, splitRatio.leaderBps)
    : { mode: "equal", participantIds: [meId, o] });
  const withConfig = (who: string[]): SplitConfig => (who.length === 0 ? nobody : excludeMe ? { mode: "equal", participantIds: who, ...(value.gift ? { gift: true } : {}) } : value.gift ? { mode: "equal", participantIds: who, gift: true } : who.length === 1 ? usualWith(who[0]) : { mode: "equal", participantIds: [meId, ...who] });
  // How to split with the chosen people. One person gets the quick ratios; a group is split equally unless "More ways".
  // "I paid for them": the expense is for these people alone, you are not part of the split, and nobody owes you.
  const gift: { label: string; config: SplitConfig } = { label: "I paid for them", config: { mode: "equal", participantIds: others, gift: true } };
  const howOptions: { label: string; title?: string; config: SplitConfig }[] = excludeMe ? [{ label: "Equally", config: { mode: "equal" as const, participantIds: others } }, gift] : others.length === 1 ? (() => {
    const o = others[0];
    const usual = usualWith(o);
    return [
      ...(usual.mode === "percent" ? [{ label: `${nameOf(ownerId)} ${pct(splitRatio.leaderBps)} · ${nameOf(ownerId === meId ? o : meId)} ${pct(10000 - splitRatio.leaderBps)}`, title: "Your usual split", config: usual }] : []),
      { label: "50 / 50", config: { mode: "equal" as const, participantIds: [meId, o] } },
      { label: `${firstName(nameOf(o))} owes all`, config: { mode: "shares" as const, participantIds: [meId, o], values: { [meId]: 0, [o]: 1 } } },
      { label: "I owe all", config: { mode: "shares" as const, participantIds: [meId, o], values: { [meId]: 1, [o]: 0 } } },
      gift,
    ];
  })() : others.length > 1 ? [{ label: "Equally", config: { mode: "equal" as const, participantIds: [meId, ...others] } }, gift] : [];
  const error = validateSplit(total, value);
  const ids = value.participantIds;
  const shares = error ? {} : computeShares(total, value);
  const otherId = ownerId === meId ? partnerId : meId;
  const isPair = (who: string[]) => !!otherId && who.length === 2 && who.includes(ownerId) && who.includes(otherId);
  const order = (who: string[]) => participants.map((p) => p.id).filter((id) => who.includes(id));

  const buildRaw = (mode: SplitMode, who: string[]): SplitConfig => {
    const keep = mode === "personal" ? who.slice(0, 1) : who;
    switch (mode) {
      case "percent": return isPair(keep) ? ratioSplit(ownerId, otherId!, splitRatio.leaderBps) : { mode, participantIds: keep, values: evenBps(keep) };
      case "custom": return { mode, participantIds: keep, values: keep.length ? equalSplit(total, keep) : {} };
      case "shares": return { mode, participantIds: keep, values: Object.fromEntries(keep.map((id) => [id, 1])) };
      case "adjust": return { mode, participantIds: keep, values: {} };
      case "items": {
        const items = value.items?.length ? value.items : [{ id: newItemId(), name: "", amountPaise: 0, participantIds: keep }];
        return { mode, participantIds: keep, items };
      }
      default: return { mode, participantIds: keep };
    }
  };
  // A gift stays a gift while you change who or how, until you put yourself back in the split.
  const build = (mode: SplitMode, who: string[]): SplitConfig => { const c = buildRaw(mode, who); return value.gift && mode !== "personal" && c.participantIds.length > 0 ? { ...c, gift: true } : c; };

  const toggle = (id: string) => {
    if (value.mode === "personal") return onChange(build("personal", [id]));
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length === 0) return;
    onChange(build(value.mode, order(next)));
  };

  // Item-wise: the people in the expense are whoever shares at least one item.
  const setItems = (items: SplitItem[]) => {
    const who = order([...new Set(items.flatMap((i) => i.participantIds))]);
    onChange({ mode: "items", participantIds: who.length ? who : [meId], items });
  };
  const patchItem = (id: string, patch: Partial<SplitItem>) => setItems((value.items ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const toggleItemPerson = (item: SplitItem, pid: string) => {
    const has = item.participantIds.includes(pid);
    patchItem(item.id, { participantIds: has ? item.participantIds.filter((x) => x !== pid) : [...item.participantIds, pid] });
  };

  /** One short line saying who pays what share, from the config alone (no amounts needed). */
  const describe = (c: SplitConfig) => {
    const who = c.participantIds.map((id) => firstName(nameOf(id)));
    if (c.gift) return "They don't owe me";
    if (c.mode === "equal") return `${who.join(", ")} pay the same`;
    if (c.mode === "percent" && c.values) return c.participantIds.map((id) => `${firstName(nameOf(id))} ${pct(c.values?.[id] ?? 0)}%`).join(" · ");
    if (c.mode === "shares" && c.values) { const o = c.participantIds.filter((id) => (c.values?.[id] ?? 0) > 0); return o.length === 1 ? `${firstName(nameOf(o[0]))} pays it all` : who.join(", "); }
    return who.join(", ");
  };
  const presetId = howOptions.find((p) => sameSplit(p.config, value))?.label ?? "";
  const [adding, setAdding] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  // Two one-tap splits ("Varru owes all", "I owe all"); every other way is the row of method icons.
  const quick = howOptions.filter((p) => /owes all$|^I owe all$|^I paid for them$/.test(p.label));
  const owesAll = quick.some((p) => p.label === presetId);
  // Quick splits are the first option of the How row; their three cards show while it is chosen (or one of them is in use).
  const quickOn = quick.length > 0 && (quickOpen || owesAll);
  const showPanel = others.length > 0 && !owesAll && value.mode !== "equal";
  const summary = ids.map((id) => `${nameOf(id)} ${formatINR(shares[id] ?? 0)}`).join(" · ");
  const pickPreset = (label: string) => {
    onChange(structuredClone(howOptions.find((p) => p.label === label)!.config));
  };
  // An item-wise split keeps its items when people are added or removed: a new person joins every item (untick the ones they skipped).
  const reshapeItems = (nextIds: string[], added?: string): SplitConfig => ({
    mode: "items", participantIds: nextIds,
    items: (value.items ?? []).map((it) => {
      let p = it.participantIds.filter((x) => nextIds.includes(x));
      if (added && !p.includes(added)) p = [...p, added];
      return { ...it, participantIds: p.length ? p : nextIds };
    }),
  });
  const pickPerson = (id: string) => {
    if (value.mode === "items" && (value.items?.length ?? 0) > 0) {
      const cur = value.participantIds;
      const who = id === ME ? meId : id;
      const has = cur.includes(who);
      const next = has ? cur.filter((x) => x !== who) : [...cur, who];
      if (next.length === 0) return;
      return onChange(reshapeItems(next, has ? undefined : who));
    }
    if (id === ME) {
      if (meIn && others.length === 0) return; // someone has to be in the split
      if (meIn) return onChange(build(value.mode === "personal" ? "equal" : value.mode, others));
      const { gift: _gift, ...rest } = build(value.mode, [meId, ...others]); void _gift;
      return onChange(rest);
    }
    onChange(withConfig(others.includes(id) ? others.filter((x) => x !== id) : [...others, id]));
  };
  const mode = MODES.find((m) => m.id === value.mode)!;

  const pctTotal = value.mode === "percent" ? ids.reduce((s, id) => s + (value.values?.[id] ?? 0), 0) : 0;
  const assigned = value.mode === "custom" ? ids.reduce((s, id) => s + (value.values?.[id] ?? 0), 0) : 0;
  const items = value.items ?? [];
  const extra = value.mode === "items" ? itemsExtra(total, items) : 0;
  const subtotals = value.mode === "items" && !error ? itemSubtotals(ids, items) : {};

  return (
    <div className="space-y-2">
      <section aria-label={peopleLabel}>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted/80">{peopleLabel}</h3>
        <ul role="group" aria-label="Split with" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ id: ME, name: "Me", full: `${nameOf(meId)} (Me)`, glyph: <PersonGlyph name="Me" id={meId} size={36} />, on: meIn }, ...rankedPeople.map((p) => ({ id: p.id, name: firstName(nameOf(p.id)), full: p.pendingEmail ? `${nameOf(p.id)} (invited)` : nameOf(p.id), glyph: <PersonGlyph name={nameOf(p.id)} id={p.id} size={36} />, on: others.includes(p.id) }))].map((t) => (
            <li key={t.id} className="w-[calc((100%-2rem)/5)] min-w-[3.75rem] shrink-0">
              <button type="button" aria-pressed={t.on} aria-label={t.full} title={t.full} onClick={() => pickPerson(t.id)}
                className={`relative flex min-h-[4.75rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${t.on ? "border-accent bg-accent/10" : "border-transparent bg-background hover:border-border"}`}>
                {t.glyph}
                <span className="w-full truncate text-center text-[12px] font-medium leading-tight">{t.name}</span>
                {t.on && <span aria-hidden className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-white"><Check size={11} strokeWidth={3} /></span>}
              </button>
            </li>
          ))}
          {!only && (
          <li className="w-[calc((100%-2rem)/5)] min-w-[3.75rem] shrink-0">
            <button type="button" aria-label="Add someone" aria-expanded={adding} onClick={() => setAdding((v) => !v)} className="flex min-h-[4.75rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-transparent bg-background px-1 py-2 hover:border-border focus-visible:outline-2 focus-visible:outline-accent">
              <Dot icon={Plus} tone="bg-accent/10 text-accent" size={36} />
              <span className="w-full truncate text-center text-[12px] font-medium leading-tight">Add</span>
            </button>
          </li>
          )}
        </ul>
        {adding && !only && (
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = addParticipant(newName); if (r.error || !r.id) { setAddError(r.error ?? "Could not add that."); return; } setNewName(""); setAddError(null); setAdding(false); pickPerson(r.id); }}>
            <Input aria-label="New person's name" autoFocus value={newName} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} placeholder="Friend's name, e.g. Karthik" maxLength={60} />
            <Button type="submit" variant="primary" disabled={!newName.trim()}>Add</Button>
          </form>
        )}
        {addError && <p role="alert" className="mt-1 text-xs text-danger">{addError}</p>}
        {live && !partner && pendingPartner && others.includes(pendingPartner.id) && <p className="mt-1.5 text-xs text-muted">{pendingPartner.name} has not joined yet. This stays on your side and is shared once they accept.</p>}
        {live && !partner && !pendingPartner && <p className="mt-1.5 text-xs text-muted">Splitting with a partner? <Link href="/settings" className="text-accent underline">Link them in Settings</Link>. Until then everything stays private.</p>}
        {live && partner && !partner.active && <p className="mt-1.5 text-xs text-muted">You unlinked from {partner.name}, so nothing new can be shared with them.</p>}
      </section>
      {others.length > 0 && (
        <section aria-label="How">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted/80">How</h3>
          <div role="radiogroup" aria-label="Split method" className="flex gap-1 rounded-2xl bg-background p-1">
            {quick.length > 0 && (
              <button type="button" role="radio" aria-checked={quickOn} aria-label="Quick splits" title="Quick splits" onClick={() => setQuickOpen(true)}
                className={`grid min-h-10 flex-1 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-accent ${quickOn ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-surface hover:text-foreground"}`}><Zap size={18} aria-hidden /></button>
            )}
            {MODES.filter((m) => m.id !== "personal").map((m) => { const on = value.mode === m.id && !quickOn; const [I] = MODE_ICON[m.id]; return (
              <button key={m.id} type="button" role="radio" aria-checked={on} aria-label={m.label} title={m.label} onClick={() => { setQuickOpen(false); onChange(build(m.id, ids.length ? ids : [meId])); }}
                className={`grid min-h-10 flex-1 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-surface hover:text-foreground"}`}><I size={18} aria-hidden /></button>
            ); })}
          </div>
          <p className="mt-1.5 text-xs text-muted"><b className="font-medium text-foreground">{quickOn ? (owesAll ? howOptions.find((p) => p.label === presetId)?.label : "Quick splits") : mode.label}</b>. {quickOn ? (owesAll ? howOptions.find((p) => p.label === presetId) && describe(howOptions.find((p) => p.label === presetId)!.config) : "One tap for the usual cases.") : mode.hint}</p>
          {quickOn && (
            <div role="radiogroup" aria-label="Quick splits" className="mt-2 grid grid-cols-3 gap-2">
              {quick.map((p) => {
                const on = owesAll && presetId === p.label;
                const { Icon, tone } = quickLook(p.label);
                return (
                  <button key={p.label} type="button" role="radio" aria-checked={on} onClick={() => pickPreset(p.label)}
                    className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-accent bg-accent/[0.07]" : "border-transparent bg-background hover:bg-border/40"}`}>
                    <span aria-hidden className={`grid size-9 place-items-center rounded-full ${tone}`}><Icon size={18} /></span>
                    <span className="text-[13px] font-medium leading-tight">{p.label}</span>
                    <span className="text-[11px] leading-tight text-muted">{describe(p.config)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!showPanel && !error && ids.length > 1 && total > 0 && <p className="mt-1.5 text-xs text-muted">{summary}</p>}
        </section>
      )}

      {showPanel && (
        <div className="space-y-3 border-t border-border pt-3">
          {value.mode === "items" ? (
            <div className="space-y-2">
              <ul className="space-y-2" aria-label="Items">
                {items.map((it) => (
                  <li key={it.id} className="space-y-2 rounded-xl bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <Input aria-label="Item name" placeholder="Item, e.g. Biryani" maxLength={80} value={it.name} onChange={(e) => patchItem(it.id, { name: e.target.value })} />
                      <span className="flex shrink-0 items-center gap-1">₹<Input aria-label={`${it.name || "Item"} amount`} inputMode="decimal" placeholder="0" className="w-24 text-right" defaultValue={it.amountPaise ? (it.amountPaise / 100).toFixed(2) : ""}
                        onChange={(e) => patchItem(it.id, { amountPaise: Math.max(0, parseRupees(e.target.value) ?? 0) })} /></span>
                      {items.length > 1 && <button type="button" aria-label={`Remove ${it.name || "item"}`} onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={14} aria-hidden /></button>}
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Who shared ${it.name || "this item"}`}>
                      {participants.filter((p) => !only || p.id === meId || only.includes(p.id)).map((p) => {
                        const on = it.participantIds.includes(p.id);
                        return <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleItemPerson(it, p.id)} className={`min-h-8 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted"}`}>{firstName(nameOf(p.id))}</button>;
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              <Button onClick={() => setItems([...items, { id: newItemId(), name: "", amountPaise: 0, participantIds: ids.length ? ids : [meId] }])}><Plus size={14} aria-hidden />Add item</Button>
              <div className="rounded-xl bg-surface p-3 text-sm">
                <div className="flex justify-between gap-2"><span className="text-muted">Items</span><span className="num">{formatINR(items.reduce((s, i) => s + i.amountPaise, 0))}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted">{extra < 0 ? "Discount" : "Tax, tip and fees"} <span className="text-xs">(shared in proportion)</span></span><span className="num">{formatINR(Math.abs(extra))}</span></div>
                <div className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-medium"><span>Bill total</span><span className="num">{formatINR(total)}</span></div>
              </div>
              {!error && <ul className="space-y-0.5 text-sm">{ids.map((id) => <li key={id} className="flex justify-between gap-2"><span>{nameOf(id)} <span className="text-xs text-muted">items {formatINR(subtotals[id] ?? 0)}</span></span><span className="num font-medium">{formatINR(shares[id] ?? 0)}</span></li>)}</ul>}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Who is in this expense">
                {/* Only the people in the split; add or remove people in the picker above. */}
                {participants.filter((p) => ids.includes(p.id)).map((p) => {
                  const on = ids.includes(p.id);
                  const tag = p.pendingEmail ? "invited" : p.id === partnerId || p.relationship === "partner" ? "" : p.userId === null ? relationshipText(p).toLowerCase() : "";
                  const values = value.values ?? {};
                  return (
                    <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm transition-colors ${on ? "bg-accent/[0.04]" : ""}`}>
                      <label className="flex min-w-0 flex-1 items-center gap-2.5">
                        <input type={value.mode === "personal" ? "radio" : "checkbox"} name="split-people" checked={on} onChange={() => toggle(p.id)} className="peer sr-only" />
                        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-border text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-accent"><Check size={12} strokeWidth={3} /></span>
                        <PersonGlyph name={nameOf(p.id)} id={p.id} size={32} />
                        <span className="truncate font-medium">{nameOf(p.id)}{p.id === meId && <span className="font-normal text-muted"> (you)</span>}</span>
                        {tag && <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">{tag}</span>}
                      </label>
                      {on && value.mode === "percent" && (
                        <span className="relative"><Input aria-label={`${nameOf(p.id)} percent`} inputMode="decimal" className="w-[5.5rem] pr-8 text-right"
                          value={String((values[p.id] ?? 0) / 100)} onChange={(e) => onChange({ ...value, values: { ...values, [p.id]: Math.round((Number(e.target.value) || 0) * 100) } })} /><span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span></span>
                      )}
                      {on && value.mode === "custom" && (
                        <span className="relative"><span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">₹</span><Input aria-label={`${nameOf(p.id)} amount`} inputMode="decimal" className="w-32 pl-8 text-right"
                          defaultValue={((values[p.id] ?? 0) / 100).toFixed(2)} onChange={(e) => onChange({ ...value, values: { ...values, [p.id]: parseRupees(e.target.value) ?? 0 } })} /></span>
                      )}
                      {on && value.mode === "shares" && (
                        <span className="flex items-center gap-1" role="group" aria-label={`${nameOf(p.id)} shares`}>
                          <button type="button" aria-label={`Fewer shares for ${nameOf(p.id)}`} disabled={(values[p.id] ?? 1) <= 0} onClick={() => onChange({ ...value, values: { ...values, [p.id]: Math.max(0, (values[p.id] ?? 1) - 1) } })} className="grid size-8 place-items-center rounded-full border border-border disabled:opacity-40"><Minus size={14} aria-hidden /></button>
                          <span className="num w-6 text-center font-medium">{values[p.id] ?? 1}</span>
                          <button type="button" aria-label={`More shares for ${nameOf(p.id)}`} onClick={() => onChange({ ...value, values: { ...values, [p.id]: Math.min(1000, (values[p.id] ?? 1) + 1) } })} className="grid size-8 place-items-center rounded-full border border-border"><Plus size={14} aria-hidden /></button>
                        </span>
                      )}
                      {on && value.mode === "adjust" && (
                        <span className="flex items-center gap-1">±₹<Input aria-label={`${nameOf(p.id)} adjustment`} inputMode="decimal" placeholder="0" className="w-24 text-right"
                          defaultValue={values[p.id] ? (values[p.id] / 100).toFixed(2) : ""} onChange={(e) => { const v = signedRupees(e.target.value); if (v !== null) onChange({ ...value, values: { ...values, [p.id]: v } }); }} /></span>
                      )}
                      {on && !error && total > 0 && value.mode !== "custom" && ids.length > 1 && <span className="num w-24 text-right text-muted">{formatINR(shares[p.id] ?? 0)}</span>}
                    </li>
                  );
                })}
              </ul>
              {value.mode === "percent" && <p className={`text-xs ${pctTotal === 10000 ? "text-good" : "text-warn"}`}>{pctTotal === 10000 ? "Adds up to 100%." : `Adds up to ${pct(pctTotal)}%. ${pct(Math.abs(10000 - pctTotal))}% ${pctTotal < 10000 ? "left to give" : "too much"}.`}</p>}
              {value.mode === "custom" && <p className={`text-xs ${assigned === total ? "text-good" : "text-warn"}`}>{assigned === total ? "Adds up to the total." : `${formatINR(Math.abs(total - assigned))} ${assigned < total ? "left to assign" : "too much"}.`}</p>}
              {value.mode !== "percent" && value.mode !== "custom" && !error && ids.length > 1 && <p className="text-xs text-muted">{summary}</p>}
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
