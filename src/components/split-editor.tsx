"use client";
import { useStore } from "@/data/store";
import { participants } from "@/data/mock";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares, validateSplit } from "@/domain/splits";
import type { Paise, SplitConfig, SplitMode } from "@/domain/types";
import { Input, Select } from "./ui";

const modes: { id: SplitMode; label: string }[] = [
  { id: "personal", label: "Personal (one person)" },
  { id: "equal", label: "Split equally" },
  { id: "percent", label: "By percentage" },
  { id: "custom", label: "Custom amounts" },
];

/** Controlled editor. Amounts shown come from computeShares, never recomputed here. */
export function SplitEditor({ total, value, onChange }: { total: Paise; value: SplitConfig; onChange: (v: SplitConfig) => void }) {
  const { nameOf } = useStore();
  const error = validateSplit(total, value);
  const ids = value.participantIds;

  const setMode = (mode: SplitMode) => {
    const keep = mode === "personal" ? ids.slice(0, 1) : ids.length ? ids : ["me"];
    const values: Record<string, number> = {};
    if (mode === "percent") keep.forEach((id, i) => (values[id] = Math.floor(10000 / keep.length) + (i === 0 ? 10000 - Math.floor(10000 / keep.length) * keep.length : 0)));
    if (mode === "custom") Object.entries(computeSafe(total, keep)).forEach(([id, v]) => (values[id] = v));
    onChange({ mode, participantIds: keep, values: mode === "percent" || mode === "custom" ? values : undefined });
  };

  const toggle = (id: string) => {
    if (value.mode === "personal") return onChange({ ...value, participantIds: [id] });
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const values = { ...(value.values ?? {}) };
    if (!next.includes(id)) delete values[id];
    else values[id] = 0;
    onChange({ ...value, participantIds: next, values });
  };

  let shares: Record<string, number> = {};
  if (!error) shares = computeShares(total, value);

  return (
    <div className="space-y-2">
      <Select aria-label="Split type" value={value.mode} onChange={(e) => setMode(e.target.value as SplitMode)}>
        {modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </Select>
      <ul className="divide-y divide-border rounded-md border border-border">
        {participants.map((p) => {
          const on = ids.includes(p.id);
          return (
            <li key={p.id} className="flex min-h-11 items-center gap-2 px-2.5 py-1.5">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input type={value.mode === "personal" ? "radio" : "checkbox"} name="split-who" checked={on} onChange={() => toggle(p.id)} className="size-4 accent-[var(--accent)]" />
                {nameOf(p.id)}{p.userId === null && <span className="text-xs text-muted">friend</span>}
              </label>
              {on && value.mode === "percent" && (
                <Input aria-label={`${p.name} percent`} inputMode="decimal" className="w-20 text-right" value={String((value.values?.[p.id] ?? 0) / 100)}
                  onChange={(e) => onChange({ ...value, values: { ...value.values, [p.id]: Math.round((Number(e.target.value) || 0) * 100) } })} />
              )}
              {on && value.mode === "custom" && (
                <Input aria-label={`${p.name} amount`} inputMode="decimal" className="w-24 text-right" defaultValue={((value.values?.[p.id] ?? 0) / 100).toFixed(2)}
                  onChange={(e) => onChange({ ...value, values: { ...value.values, [p.id]: parseRupees(e.target.value) ?? 0 } })} />
              )}
              {on && !error && <span className="num w-24 text-right text-sm text-muted">{formatINR(shares[p.id] ?? 0)}</span>}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function computeSafe(total: Paise, ids: string[]) {
  const base = Math.floor(total / ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < total - base * ids.length ? 1 : 0)]));
}
