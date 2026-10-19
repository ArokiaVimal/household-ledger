"use client";
import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, equalSplit, itemsExtra, itemSubtotals, ratioSplit, sameSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitItem, SplitMode } from "@/domain/types";
import { Button, CompactChips, FormRow, Input } from "./ui";

const CUSTOM = "__custom";

/** Every way to split, with one plain sentence each so nobody has to guess what a mode means. */
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
export function SplitEditor({ total, value, onChange }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void }) {
  const { nameOf, participants, meId, splitRatio, partnerId, pendingPartner, live, partner, addParticipant } = useStore();
  // The couple's usual two-way split (set in Settings). Anchored to the person it names, not to whoever is signed in,
  // so the same expense is split the same way on both phones.
  const ownerId = participants.some((p) => p.id === splitRatio.leaderId) ? splitRatio.leaderId : meId;
  const pct = (bps: number) => `${Number.isInteger(bps / 100) ? bps / 100 : (bps / 100).toFixed(1)}`;
  const ME = "__me";
  const nobody: SplitConfig = { mode: "personal", participantIds: [meId] };
  const others = value.participantIds.filter((id) => id !== meId);
  const people = participants.filter((p) => p.id !== meId);
  // The usual way to split with one person: your couple ratio with your partner, otherwise down the middle.
  const usualWith = (o: string): SplitConfig => (o === partnerId && splitRatio.leaderBps !== 5000
    ? ratioSplit(ownerId, ownerId === meId ? o : meId, splitRatio.leaderBps)
    : { mode: "equal", participantIds: [meId, o] });
  const withConfig = (who: string[]): SplitConfig => (who.length === 0 ? nobody : who.length === 1 ? usualWith(who[0]) : { mode: "equal", participantIds: [meId, ...who] });
  // How to split with the chosen people. One person gets the quick ratios; a group is split equally unless "More ways".
  const howOptions: { label: string; config: SplitConfig }[] = others.length === 1 ? (() => {
    const o = others[0];
    const usual = usualWith(o);
    return [
      ...(usual.mode === "percent" ? [{ label: `${nameOf(ownerId)} ${pct(splitRatio.leaderBps)} · ${nameOf(ownerId === meId ? o : meId)} ${pct(10000 - splitRatio.leaderBps)}`, config: usual }] : []),
      { label: "50 / 50", config: { mode: "equal" as const, participantIds: [meId, o] } },
      { label: `${firstName(nameOf(o))} owes all`, config: { mode: "shares" as const, participantIds: [meId, o], values: { [meId]: 0, [o]: 1 } } },
      { label: "I owe all", config: { mode: "shares" as const, participantIds: [meId, o], values: { [meId]: 1, [o]: 0 } } },
    ];
  })() : others.length > 1 ? [{ label: "Equally", config: { mode: "equal" as const, participantIds: [meId, ...others] } }] : [];
  const error = validateSplit(total, value);
  const ids = value.participantIds;
  const shares = error ? {} : computeShares(total, value);
  const otherId = ownerId === meId ? partnerId : meId;
  const isPair = (who: string[]) => !!otherId && who.length === 2 && who.includes(ownerId) && who.includes(otherId);
  const order = (who: string[]) => participants.map((p) => p.id).filter((id) => who.includes(id));

  const build = (mode: SplitMode, who: string[]): SplitConfig => {
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

  const presetId = howOptions.find((p) => sameSplit(p.config, value))?.label ?? "";
  const [advanced, setAdvanced] = useState(false);
  const showAdvanced = others.length > 0 && (advanced || !presetId);
  const summary = ids.map((id) => `${nameOf(id)} ${formatINR(shares[id] ?? 0)}`).join(" · ");
  const pickPreset = (label: string) => {
    if (label === CUSTOM) return setAdvanced(true);
    setAdvanced(false);
    onChange(structuredClone(howOptions.find((p) => p.label === label)!.config));
  };
  const pickPerson = (id: string) => {
    setAdvanced(false);
    if (id === ME) return onChange(nobody);
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
      <FormRow label="Split with">
        <CompactChips multi label="Split with" options={[{ id: ME, label: "Just me" }, ...people.map((p) => ({ id: p.id, label: p.pendingEmail ? `${nameOf(p.id)} (invited)` : p.userId === null ? `${nameOf(p.id)} (friend)` : nameOf(p.id) }))]} selected={others.length ? others : [ME]} onPick={pickPerson} adder={{ label: "Add a friend", placeholder: "Friend's name, e.g. Karthik", add: addParticipant }} />
        {live && !partner && pendingPartner && others.includes(pendingPartner.id) && <p className="mt-1.5 text-xs text-muted">{pendingPartner.name} has not joined yet. This stays on your side and is shared once they accept.</p>}
        {live && !partner && !pendingPartner && <p className="mt-1.5 text-xs text-muted">Splitting with a partner? <Link href="/settings" className="text-accent underline">Link them in Settings</Link>. Until then everything stays private.</p>}
        {live && partner && !partner.active && <p className="mt-1.5 text-xs text-muted">You unlinked from {partner.name}, so nothing new can be shared with them.</p>}
      </FormRow>
      {others.length > 0 && (
        <FormRow label="How">
          <CompactChips label="How to split" options={[...howOptions.map((p) => ({ id: p.label, label: p.label })), { id: CUSTOM, label: "More ways" }]} selected={showAdvanced ? [CUSTOM] : [presetId]} onPick={pickPreset} />
          {!showAdvanced && !error && ids.length > 1 && <p className="mt-1.5 text-xs text-muted">{summary}</p>}
        </FormRow>
      )}

      {showAdvanced && (
        <div className="space-y-3 rounded-xl bg-background p-3">
          <div className="space-y-1.5">
            <CompactChips label="How to split" options={MODES.map((m) => ({ id: m.id, label: m.label }))} selected={[value.mode]} onPick={(m) => onChange(build(m, ids.length ? ids : [meId]))} />
            <p className="text-xs text-muted">{mode.hint}</p>
          </div>

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
                      {participants.map((p) => {
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
              <ul className="divide-y divide-border rounded-xl bg-surface" aria-label="Who is in this expense">
                {participants.map((p) => {
                  const on = ids.includes(p.id);
                  const tag = p.pendingEmail ? "invited" : p.userId === null ? "friend" : "";
                  const values = value.values ?? {};
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                      <label className="flex min-w-0 flex-1 items-center gap-2.5">
                        <input type={value.mode === "personal" ? "radio" : "checkbox"} name="split-people" checked={on} onChange={() => toggle(p.id)} className="size-4 shrink-0 accent-[var(--accent)]" />
                        <span className="truncate font-medium">{nameOf(p.id)}{p.id === meId && <span className="font-normal text-muted"> (you)</span>}</span>
                        {tag && <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">{tag}</span>}
                      </label>
                      {on && value.mode === "percent" && (
                        <span className="flex items-center gap-1"><Input aria-label={`${nameOf(p.id)} percent`} inputMode="decimal" className="w-20 text-right"
                          value={String((values[p.id] ?? 0) / 100)} onChange={(e) => onChange({ ...value, values: { ...values, [p.id]: Math.round((Number(e.target.value) || 0) * 100) } })} />%</span>
                      )}
                      {on && value.mode === "custom" && (
                        <span className="flex items-center gap-1">₹<Input aria-label={`${nameOf(p.id)} amount`} inputMode="decimal" className="w-28 text-right"
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
                      {on && !error && value.mode !== "custom" && ids.length > 1 && <span className="num w-24 text-right text-muted">{formatINR(shares[p.id] ?? 0)}</span>}
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
