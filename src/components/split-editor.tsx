"use client";
import { useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { OWNER_SHARE_BPS } from "@/domain/defaults";
import { computeShares, equalSplit, ratioSplit, sameSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitMode } from "@/domain/types";
import { ChipGroup, CompactChips, FormRow, Input } from "./ui";

const CUSTOM = "__custom";
const modes = [
  { id: "personal", label: "One" },
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
  const { nameOf, participants, meId, ownerParticipantId, partnerId } = useStore();
  // The usual two-way split: the household owner bears 64%, the partner 36%. Anchored to the owner (not to whoever is
  // signed in) so the same expense is split the same way on both phones.
  const ownerId = participants.some((p) => p.id === ownerParticipantId) ? ownerParticipantId : meId;
  const otherId = ownerId === meId ? partnerId : meId;
  const presets: { label: string; config: SplitConfig }[] = [
    { label: "Just me", config: { mode: "personal", participantIds: [meId] } },
    ...(otherId
      ? [
          { label: `${nameOf(ownerId)} 64 · ${nameOf(otherId)} 36`, config: ratioSplit(ownerId, otherId, OWNER_SHARE_BPS) },
          { label: "50 / 50", config: { mode: "equal" as const, participantIds: [ownerId, otherId] } },
        ]
      : []),
    ...(participants.length > 2 ? [{ label: "Everyone", config: { mode: "equal" as const, participantIds: participants.map((p) => p.id) } }] : []),
  ];
  const error = validateSplit(total, value);
  const ids = value.participantIds;
  const shares = error ? {} : computeShares(total, value);
  const isPair = (who: string[]) => !!otherId && who.length === 2 && who.includes(ownerId) && who.includes(otherId);

  const build = (mode: SplitMode, who: string[]): SplitConfig => {
    const keep = mode === "personal" ? who.slice(0, 1) : who;
    if (mode === "percent") return isPair(keep) ? ratioSplit(ownerId, otherId!, OWNER_SHARE_BPS) : { mode, participantIds: keep, values: evenBps(keep) };
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
  const whoOptions = participants.map((p) => ({ id: p.id, label: p.userId === null ? `${nameOf(p.id)} (friend)` : nameOf(p.id) }));
  const summary = ids.map((id) => `${nameOf(id)} ${formatINR(shares[id] ?? 0)}`).join(" · ");
  const pickPreset = (label: string) => {
    if (label === CUSTOM) return setAdvanced(true);
    setAdvanced(false);
    onChange(structuredClone(presets.find((p) => p.label === label)!.config));
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
