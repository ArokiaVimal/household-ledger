"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, equalSplit, ratioSplit, sameSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitMode } from "@/domain/types";
import { ChipGroup, CompactChips, FormRow, Input } from "./ui";

const CUSTOM = "__custom";
const modes = [
  { id: "personal", label: "One person" },
  { id: "equal", label: "Equally" },
  { id: "percent", label: "By %" },
  { id: "custom", label: "By amount" },
] as const;

const evenBps = (ids: string[]) => {
  const base = Math.floor(10000 / ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, base + (i === 0 ? 10000 - base * ids.length : 0)]));
};

/** Controlled editor. Amounts shown come from computeShares, never recomputed here. */
export function SplitEditor({ total, value, onChange }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void }) {
  const { nameOf, participants, meId, splitRatio, partnerId, pendingPartner, live, partner } = useStore();
  // The couple's usual two-way split (set in Settings). Anchored to the person it names, not to whoever is signed in,
  // so the same expense is split the same way on both phones.
  const ownerId = participants.some((p) => p.id === splitRatio.leaderId) ? splitRatio.leaderId : meId;
  const pct = (bps: number) => `${Number.isInteger(bps / 100) ? bps / 100 : (bps / 100).toFixed(1)}`;
  const otherId = ownerId === meId ? partnerId : meId;
  const presets: { label: string; config: SplitConfig }[] = [
    { label: "Just me", config: { mode: "personal", participantIds: [meId] } },
    ...(otherId
      ? [
          ...(splitRatio.leaderBps !== 5000 ? [{ label: `${nameOf(ownerId)} ${pct(splitRatio.leaderBps)} · ${nameOf(otherId)} ${pct(10000 - splitRatio.leaderBps)}`, config: ratioSplit(ownerId, otherId, splitRatio.leaderBps) }] : []),
          { label: "50 / 50", config: { mode: "equal" as const, participantIds: [ownerId, otherId] } },
        ]
      : []),
    ...(participants.length > 2 && !(live && partner) ? [{ label: "Everyone", config: { mode: "equal" as const, participantIds: participants.map((p) => p.id) } }] : []),
  ];
  const error = validateSplit(total, value);
  const ids = value.participantIds;
  const shares = error ? {} : computeShares(total, value);
  const isPair = (who: string[]) => !!otherId && who.length === 2 && who.includes(ownerId) && who.includes(otherId);

  const build = (mode: SplitMode, who: string[]): SplitConfig => {
    const keep = mode === "personal" ? who.slice(0, 1) : who;
    if (mode === "percent") return isPair(keep) ? ratioSplit(ownerId, otherId!, splitRatio.leaderBps) : { mode, participantIds: keep, values: evenBps(keep) };
    if (mode === "custom") return { mode, participantIds: keep, values: keep.length ? equalSplit(total, keep) : {} };
    return { mode, participantIds: keep };
  };

  const toggle = (id: string) => {
    if (value.mode === "personal") return onChange(build("personal", [id]));
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length === 0) return;
    onChange(build(value.mode, next));
  };

  const presetId = presets.find((p) => sameSplit(p.config, value))?.label ?? "";
  const [advanced, setAdvanced] = useState(!presetId);
  const showAdvanced = advanced || !presetId;
  const summary = ids.map((id) => `${nameOf(id)} ${formatINR(shares[id] ?? 0)}`).join(" · ");
  const pickPreset = (label: string) => {
    if (label === CUSTOM) return setAdvanced(true);
    setAdvanced(false);
    onChange(structuredClone(presets.find((p) => p.label === label)!.config));
  };

  return (
    <div className="space-y-2">
      <FormRow label="Split">
        <CompactChips label="Split" options={[...presets.map((p) => ({ id: p.label, label: p.label })), { id: CUSTOM, label: "Custom split" }]} selected={showAdvanced ? [CUSTOM] : [presetId]} onPick={pickPreset} />
        {!showAdvanced && !error && ids.length > 1 && <p className="mt-1.5 text-xs text-muted">{summary}</p>}
        {live && !partner && pendingPartner && <p className="mt-1.5 text-xs text-muted">{pendingPartner.name} has not joined yet. Split with them now; it stays on your side and is shared once they accept.</p>}
        {live && !partner && !pendingPartner && <p className="mt-1.5 text-xs text-muted">Splitting with a partner? <Link href="/settings" className="text-accent underline">Link them in Settings</Link>. Until then everything stays private.</p>}
        {live && partner && !partner.active && <p className="mt-1.5 text-xs text-muted">You unlinked from {partner.name}, so nothing new can be shared with them.</p>}
      </FormRow>
      {showAdvanced && (
        <div className="space-y-3 rounded-xl bg-background p-3">
          <ChipGroup tabs label="Split type" options={modes.map((m) => ({ id: m.id, label: m.label }))} value={value.mode} onChange={(m) => onChange(build(m, ids.length ? ids : [meId]))} />
          <ul className="divide-y divide-border rounded-xl bg-surface" aria-label="Who is in this expense">
            {participants.map((p) => {
              const on = ids.includes(p.id);
              const tag = p.pendingEmail ? "invited" : p.userId === null ? "friend" : "";
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5">
                    <input type={value.mode === "personal" ? "radio" : "checkbox"} name="split-people" checked={on} onChange={() => toggle(p.id)} className="size-4 shrink-0 accent-[var(--accent)]" />
                    <span className="truncate font-medium">{nameOf(p.id)}{p.id === meId && <span className="font-normal text-muted"> (you)</span>}</span>
                    {tag && <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">{tag}</span>}
                  </label>
                  {on && value.mode === "percent" && (
                    <span className="flex items-center gap-1"><Input aria-label={`${nameOf(p.id)} percent`} inputMode="decimal" className="w-20 text-right"
                      value={String((value.values?.[p.id] ?? 0) / 100)} onChange={(e) => onChange({ ...value, values: { ...value.values, [p.id]: Math.round((Number(e.target.value) || 0) * 100) } })} />%</span>
                  )}
                  {on && value.mode === "custom" && (
                    <span className="flex items-center gap-1">₹<Input aria-label={`${nameOf(p.id)} amount`} inputMode="decimal" className="w-28 text-right"
                      defaultValue={((value.values?.[p.id] ?? 0) / 100).toFixed(2)} onChange={(e) => onChange({ ...value, values: { ...value.values, [p.id]: parseRupees(e.target.value) ?? 0 } })} /></span>
                  )}
                  {on && !error && value.mode !== "custom" && ids.length > 1 && <span className="num w-24 text-right text-muted">{formatINR(shares[p.id] ?? 0)}</span>}
                </li>
              );
            })}
          </ul>
          {!error && ids.length > 1 && <p className="text-xs text-muted">{summary}</p>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
