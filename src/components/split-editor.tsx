"use client";
import { useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, equalSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitMode } from "@/domain/types";
import { ChipGroup, CompactChips, FormRow, Input } from "./ui";

const CUSTOM = "__custom";
const modes = [
  { id: "personal", label: "One person" },
  { id: "equal", label: "Equal" },
  { id: "percent", label: "%" },
  { id: "custom", label: "Amounts" },
] as const;

const evenBps = (ids: string[]) => {
  const base = Math.floor(10000 / ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, base + (i === 0 ? 10000 - base * ids.length : 0)]));
};

/** Controlled editor. Amounts shown come from computeShares, never recomputed here. */
export function SplitEditor({ total, value, onChange }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void }) {
  const { nameOf, participants, meId, partnerId } = useStore();
  const presets: { label: string; ids: string[] }[] = [
    { label: "Just me", ids: [meId] },
    ...(partnerId ? [{ label: `Me + ${nameOf(partnerId)}`, ids: [meId, partnerId] }] : []),
    ...(participants.length > 2 ? [{ label: "Everyone", ids: participants.map((p) => p.id) }] : []),
  ];
  const error = validateSplit(total, value);
  const ids = value.participantIds;
  const shares = error ? {} : computeShares(total, value);

  const build = (mode: SplitMode, who: string[]): SplitConfig => {
    const keep = mode === "personal" ? who.slice(0, 1) : who;
    if (mode === "percent") return { mode, participantIds: keep, values: evenBps(keep) };
    if (mode === "custom") return { mode, participantIds: keep, values: keep.length ? equalSplit(total, keep) : {} };
    return { mode, participantIds: keep };
  };

  const applyPreset = (who: string[]) => onChange(build(who.length === 1 ? "personal" : value.mode === "personal" ? "equal" : value.mode, who));

  const toggle = (id: string) => {
    if (value.mode === "personal") return onChange(build("personal", [id]));
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length === 0) return;
    onChange(build(value.mode, next));
  };

  const presetOn = (who: string[]) => who.length === ids.length && who.every((w) => ids.includes(w));

  const presetId = value.mode === "personal" || value.mode === "equal" ? presets.find((p) => presetOn(p.ids))?.label ?? "" : "";
  const [advanced, setAdvanced] = useState(!presetId);
  const showAdvanced = advanced || !presetId;
  const whoOptions = participants.map((p) => ({ id: p.id, label: p.userId === null ? `${nameOf(p.id)} (friend)` : nameOf(p.id) }));
  const summary = ids.map((id) => `${nameOf(id)} ${formatINR(shares[id] ?? 0)}`).join(" · ");
  const pickPreset = (label: string) => {
    if (label === CUSTOM) return setAdvanced(true);
    setAdvanced(false);
    applyPreset(presets.find((p) => p.label === label)!.ids);
  };

  return (
    <div className="space-y-2">
      <FormRow label="Split">
        <CompactChips label="Split" options={[...presets.map((p) => ({ id: p.label, label: p.label })), { id: CUSTOM, label: "Custom…" }]} selected={showAdvanced ? [CUSTOM] : [presetId]} onPick={pickPreset} />
        {!showAdvanced && !error && ids.length > 1 && <p className="mt-1.5 text-xs text-muted">{summary}</p>}
      </FormRow>
      {showAdvanced && (
        <div className="space-y-2 rounded-xl bg-background p-3">
          <ChipGroup tabs label="Split type" options={modes.map((m) => ({ id: m.id, label: m.label }))} value={value.mode} onChange={(m) => onChange(build(m, ids.length ? ids : [meId]))} />
          <CompactChips multi={value.mode !== "personal"} label="People" options={whoOptions} selected={ids} onPick={toggle} />
          {(value.mode === "percent" || value.mode === "custom" || ids.length > 1) && (
            <ul className="space-y-1.5">
              {ids.map((id) => (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{nameOf(id)}</span>
                  {value.mode === "percent" && (
                    <span className="flex items-center gap-1"><Input aria-label={`${nameOf(id)} percent`} inputMode="decimal" className="w-20 text-right"
                      value={String((value.values?.[id] ?? 0) / 100)} onChange={(e) => onChange({ ...value, values: { ...value.values, [id]: Math.round((Number(e.target.value) || 0) * 100) } })} />%</span>
                  )}
                  {value.mode === "custom" && (
                    <span className="flex items-center gap-1">₹<Input aria-label={`${nameOf(id)} amount`} inputMode="decimal" className="w-28 text-right"
                      defaultValue={((value.values?.[id] ?? 0) / 100).toFixed(2)} onChange={(e) => onChange({ ...value, values: { ...value.values, [id]: parseRupees(e.target.value) ?? 0 } })} /></span>
                  )}
                  {!error && <span className="num w-24 text-right text-muted">{formatINR(shares[id] ?? 0)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
