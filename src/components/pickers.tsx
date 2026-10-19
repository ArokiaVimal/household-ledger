"use client";
// Compact selector rows and the sheets they open, for the add-expense form: one tidy row per choice instead of rows of chips.
import { Check, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CategoryGlyph } from "@/components/glyphs";
import { MerchantAvatar } from "@/components/txn-row";
import { Dialog, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import { rankMerchants, searchMerchants } from "@/domain/merchants";
import { cn } from "@/lib/cn";

/** A form row that shows the current choice (small label above the value) and opens a sheet when tapped. */
export function PickerRow({ icon, label, value, sub, onClick, muted, children }: { icon: ReactNode; label: string; value: string; sub?: string; onClick: () => void; muted?: boolean; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. Change`} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-1.5 text-left transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">
      <span className="grid size-8 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted/80">{label}</span>
        <span className={cn("block truncate text-sm font-medium", muted && "text-muted")}>{value}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {children}
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
    </button>
  );
}

export interface ListOption { id: string; label: string; hint?: string; icon?: ReactNode }

/** Choices as tiles, two to a row: icon, name and a short hint. Single choice by default; `multi` toggles. The one look for every choice in the form. */
export function TileGrid({ options, selected, onPick, label, multi, columns = 2 }: { options: ListOption[]; selected: string[]; onPick: (id: string) => void; label: string; multi?: boolean; columns?: 2 | 3 }) {
  return (
    <ul role={multi ? "group" : "radiogroup"} aria-label={label} className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <li key={o.id}>
            <button type="button" role={multi ? undefined : "radio"} aria-checked={multi ? undefined : on} aria-pressed={multi ? on : undefined} onClick={() => onPick(o.id)}
              className={cn("relative flex min-h-14 w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-colors", on ? "border-accent bg-accent/10" : "border-transparent bg-background hover:border-border")}>
              {o.icon && <span className="grid size-8 shrink-0 place-items-center">{o.icon}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium leading-tight">{o.label}</span>{o.hint && <span className="block truncate text-[11px] leading-tight text-muted">{o.hint}</span>}</span>
              {on && <Check size={15} aria-hidden className="shrink-0 text-accent" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A one-choice sheet (payment method, via, wallet, type…): the choices as tiles, picking one closes it. */
export function ListSheet({ open, onClose, title, options, value, onPick, note }: { open: boolean; onClose: () => void; title: string; options: ListOption[]; value: string; onPick: (id: string) => void; note?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="pb-4"><TileGrid label={title} options={options} selected={[value]} onPick={(id) => { onPick(id); onClose(); }} /></div>
      {note && <p className="pb-4 text-xs text-muted">{note}</p>}
    </Dialog>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-3">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <Input autoFocus aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-10" maxLength={60} />
    </div>
  );
}
const Heading = ({ children }: { children: ReactNode }) => <h3 className="mb-1 mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</h3>;

/**
 * One searchable merchant selector. Recent and frequently used merchants (from your approved history) come first; common names
 * appear only while history is thin; "See all" shows every merchant. A name that is not there yet can be added on the spot, and the
 * transaction being entered is untouched because this is only a sheet over the form.
 */
export function MerchantSheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: string; onPick: (name: string) => void }) {
  const { records, staged } = useStore();
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const s = useMemo(() => rankMerchants([...records, ...staged.filter((r) => r.merchant.trim())], { recent: 4, frequent: 4 }), [records, staged]);
  const hits = useMemo(() => searchMerchants(s, q), [s, q]);
  const typed = q.trim();
  const exact = hits.some((h) => h.name.toLowerCase() === typed.toLowerCase());
  const close = () => { onClose(); setQ(""); setAll(false); };
  const pick = (name: string) => { onPick(name); close(); };
  // The ones you use most are just a logo and a short name, four to a row. Everything else is a name, two to a row.
  const tile = (name: string) => (
    <li key={name}>
      <button type="button" onClick={() => pick(name)} aria-label={name} aria-pressed={name === value} className={cn("flex w-full flex-col items-center gap-1 rounded-2xl p-2 hover:bg-background", name === value && "bg-accent/10 ring-1 ring-accent")}>
        <MerchantAvatar name={name} size={48} />
        <span className="w-full truncate text-center text-[11px] leading-tight text-muted">{name}</span>
      </button>
    </li>
  );
  const chip = (name: string, hint?: string) => (
    <li key={name}>
      <button type="button" onClick={() => pick(name)} aria-pressed={name === value} className={cn("flex min-h-11 w-full items-center gap-2 rounded-xl border border-transparent bg-background px-2.5 py-1.5 text-left hover:border-border", name === value && "border-accent bg-accent/5")}>
        <MerchantAvatar name={name} size={24} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm">{name}</span>{hint && <span className="block truncate text-[11px] text-muted">{hint}</span>}</span>
      </button>
    </li>
  );
  return (
    <Dialog open={open} onClose={close} title="Merchant">
      <SearchBox value={q} onChange={setQ} placeholder="Search or type a merchant" />
      <div className="min-h-[50vh] pb-4">
        {typed ? (
          <>
            {hits.length > 0 && <ul className="grid grid-cols-2 gap-2">{hits.map((h) => chip(h.name, h.known ? undefined : "Common"))}</ul>}
            {!exact && <button type="button" onClick={() => pick(typed)} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left hover:bg-background"><span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><Plus size={16} /></span><span className="text-sm font-medium">Use “{typed}” as a new merchant</span></button>}
          </>
        ) : (
          <>
            {s.recent.length > 0 && <><Heading>Recent</Heading><ul className="grid grid-cols-4 gap-1">{s.recent.map((m) => tile(m.name))}</ul></>}
            {s.frequent.length > 0 && <><Heading>Frequently used</Heading><ul className="grid grid-cols-4 gap-1">{s.frequent.map((m) => tile(m.name))}</ul></>}
            {s.popular.length > 0 && <><Heading>Common</Heading><ul className="grid grid-cols-4 gap-1">{s.popular.map((n) => tile(n))}</ul></>}
            {s.recent.length + s.frequent.length === 0 && s.popular.length === 0 && <p className="px-1 text-sm text-muted">Type a merchant above. The ones you use will show up here.</p>}
            {s.all.length > 0 && (all
              ? <><Heading>All merchants</Heading><ul className="grid grid-cols-2 gap-2">{s.all.map((m) => chip(m.name))}</ul></>
              : <button type="button" onClick={() => setAll(true)} className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-background text-sm font-medium text-accent">See all {s.all.length} merchants</button>)}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** One searchable category selector with icons, your most used first, and adding a category without leaving the form. */
export function CategorySheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: string; onPick: (id: string) => void }) {
  const { categories, records, addCategory } = useStore();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const use = useMemo(() => { const m = new Map<string, number>(); for (const r of records) if (r.status === "reviewed" && r.kind === "purchase") m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1); return m; }, [records]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => [...categories].filter((c) => !needle || c.name.toLowerCase().includes(needle)).sort((a, b) => (a.id === "uncategorized" ? 1 : b.id === "uncategorized" ? -1 : a.name.localeCompare(b.name))), [categories, needle]);
  const top = useMemo(() => [...categories].filter((c) => c.id !== "uncategorized" && (use.get(c.id) ?? 0) > 0).sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)).slice(0, 5), [categories, use]);
  const close = () => { onClose(); setQ(""); setError(null); };
  const pick = (id: string) => { onPick(id); close(); };
  const grid = (cs: { id: string; name: string; icon?: string }[]) => <TileGrid label="Categories" options={cs.map((c) => ({ id: c.id, label: c.name, icon: <CategoryGlyph name={c.name} icon={c.icon} size={32} /> }))} selected={[value]} onPick={pick} />;
  const exact = categories.some((c) => c.name.toLowerCase() === needle);
  return (
    <Dialog open={open} onClose={close} title="Category">
      <SearchBox value={q} onChange={(v) => { setQ(v); setError(null); }} placeholder="Search categories" />
      <div className="min-h-[50vh] pb-2">
        {!needle && top.length > 0 && <><Heading>Most used</Heading>{grid(top)}</>}
        <Heading>{needle ? "Matches" : "All categories"}</Heading>
        {list.length > 0 && grid(list)}
        {list.length === 0 && !needle && <p className="px-1 text-sm text-muted">No categories yet.</p>}
        {needle && !exact && (
          <button type="button" onClick={() => { const r = addCategory(q.trim()); if (r.error || !r.id) setError(r.error ?? "Could not add that."); else pick(r.id); }} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left hover:bg-background">
            <span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><Plus size={16} /></span><span className="text-sm font-medium">Add “{q.trim()}” as a new category</span>
          </button>
        )}
        {error && <p role="alert" className="mt-1 px-1 text-xs text-danger">{error}</p>}
      </div>
      <p className="border-t border-border pb-4 pt-3 text-xs text-muted">To rename, delete or merge categories, use <Link href="/categories" className="text-accent underline">Categories</Link>.</p>
    </Dialog>
  );
}
