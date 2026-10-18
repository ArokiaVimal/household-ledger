"use client";
import { participants } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, equalSplit, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitMode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { MerchantAvatar } from "./txn-row";
import { ChipGroup, Input } from "./ui";

const modes = [
  { id: "personal", label: "One person" },
  { id: "equal", label: "Equal" },
  { id: "percent", label: "%" },
  { id: "custom", label: "Amounts" },
] as const;

const presets: { label: string; ids: string[] }[] = [
  { label: "Just me", ids: ["me"] },
  { label: "Me + Wife", ids: ["me", "wife"] },
  { label: "Everyone", ids: participants.map((p) => p.id) },
];

const evenBps = (ids: string[]) => {
  const base = Math.floor(10000 / ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, base + (i === 0 ? 10000 - base * ids.length : 0)]));
};

/** Controlled editor. Amounts shown come from computeShares, never recomputed here. */
export function SplitEditor({ total, value, onChange }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void }) {
  const { nameOf } = useStore();
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick split">
        {presets.map((p) => (
          <button key={p.label} type="button" aria-pressed={presetOn(p.ids)} onClick={() => applyPreset(p.ids)}
            className={cn("min-h-9 rounded-full px-3.5 text-sm", presetOn(p.ids) ? "bg-foreground text-white" : "border border-border bg-surface hover:bg-background")}>{p.label}</button>
        ))}
      </div>
      <ChipGroup tabs label="Split type" options={modes.map((m) => ({ id: m.id, label: m.label }))} value={value.mode} onChange={(m) => onChange(build(m, ids.length ? ids : ["me"]))} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="People">
        {participants.map((p) => {
          const on = ids.includes(p.id);
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)}
              className={cn("flex min-h-9 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm", on ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface hover:bg-background")}>
              <MerchantAvatar name={nameOf(p.id)} size={26} />{nameOf(p.id)}{p.userId === null && <span className="text-xs text-muted">friend</span>}
            </button>
          );
        })}
      </div>
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
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
