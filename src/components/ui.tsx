"use client";
// Shared UI primitives (shadcn-style, token-driven). Compose screens from these.
import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, ChevronDown, Info, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[var(--radius-card)] bg-surface p-4 shadow-[0_1px_0_rgba(20,18,31,0.03)]", className)}>{children}</section>;
}

/** A small (i) that explains a feature. Tap, hover or focus shows the text; Escape or tapping elsewhere hides it. */
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (e.target instanceof Node && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) { const w = Math.min(256, window.innerWidth - 24); setPos({ left: Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)), top: r.bottom + 6 }); }
    setOpen(true);
  };
  return (
    <span className="inline-flex align-middle">
      <button ref={btn} type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => (open ? setOpen(false) : show())} onMouseEnter={show} onMouseLeave={() => setOpen(false)}
        className="grid size-6 place-items-center rounded-full text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><Info size={14} aria-hidden /></button>
      {open && pos && <span id={id} role="tooltip" style={{ left: pos.left, top: pos.top, width: Math.min(256, typeof window === "undefined" ? 256 : window.innerWidth - 24) }} className="fixed z-[60] rounded-xl bg-foreground px-3 py-2 text-xs font-normal leading-relaxed text-background shadow-lg">{text}</span>}
    </span>
  );
}

export function CardTitle({ children, action, tip }: { children: ReactNode; action?: ReactNode; tip?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1 text-sm font-medium text-muted">{children}{tip && <InfoTip text={tip} />}</h2>
      {action}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };
export function Button({ variant = "ghost", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "border border-border bg-surface hover:bg-background",
        variant === "danger" && "border border-danger/40 bg-surface text-danger hover:bg-danger/5",
        className,
      )}
    />
  );
}

const field = "min-h-9 w-full rounded-full border border-border bg-surface px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-accent";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, p.className)} />;
/**
 * A modern dropdown that takes <option> children like a native select. On a computer it opens a soft floating list under the
 * button (arrow keys, Enter, Escape and type-to-jump all work); on a phone it opens a bottom sheet with big tap targets.
 * `onChange` receives `{ target: { value } }`, so existing handlers keep working.
 */
interface SelectProps { value?: string; defaultValue?: string; onChange?: (e: { target: { value: string } }) => void; children: ReactNode; className?: string; disabled?: boolean; placeholder?: string; "aria-label"?: string; id?: string }
export function Select({ value, defaultValue, onChange, children, className, disabled, placeholder = "Choose", ...rest }: SelectProps) {
  const options = Children.toArray(children).flatMap((c) => {
    if (!isValidElement(c)) return [];
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    const label = Children.toArray(p.children).join("");
    return [{ value: String(p.value ?? label), label, disabled: !!p.disabled }];
  });
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const choose = (v: string) => { if (value === undefined) setInner(v); onChange?.({ target: { value: v } }); setOpen(false); };
  const show = () => {
    if (disabled) return;
    setSheet(typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  useEffect(() => {
    if (!open || sheet) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, sheet]);
  useEffect(() => { if (open && !sheet) (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [open, sheet, active]);

  const move = (d: number) => { let i = active; for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; } setActive(i); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active] && !options[active].disabled) choose(options[active].value); }
    else if (e.key.length === 1) { const i = options.findIndex((o, n) => n > active && o.label.toLowerCase().startsWith(e.key.toLowerCase())); const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (j >= 0) setActive(j); }
  };
  const row = (o: (typeof options)[number], i: number, big: boolean) => (
    <li key={o.value} role="option" aria-selected={o.value === current} aria-disabled={o.disabled || undefined} onPointerEnter={() => setActive(i)} onClick={() => { if (!o.disabled) choose(o.value); }}
      className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm", big ? "min-h-12" : "min-h-9", i === active && !big && "bg-background", o.value === current && "font-medium text-accent", o.disabled && "cursor-not-allowed opacity-40")}>
      <span className="truncate">{o.label}</span>{o.value === current && <Check size={16} aria-hidden className="shrink-0" />}
    </li>
  );

  return (
    <div ref={wrap} className="relative">
      <button type="button" id={rest.id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={rest["aria-label"]} disabled={disabled} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}
        className={cn(field, "flex items-center justify-between gap-2 text-left transition-colors hover:bg-background disabled:cursor-not-allowed", open && "border-accent ring-2 ring-accent/20", className)}>
        <span className={cn("truncate", !selected && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && !sheet && (
        <ul ref={list} id={listId} role="listbox" aria-label={rest["aria-label"]} className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 min-w-40 overflow-auto rounded-2xl bg-surface p-1.5 shadow-[0_12px_32px_rgba(20,18,31,0.16)] ring-1 ring-border">
          {options.map((o, i) => row(o, i, false))}
        </ul>
      )}
      {sheet && (
        <Dialog open={open} onClose={() => setOpen(false)} title={rest["aria-label"] ?? placeholder}>
          <ul id={listId} role="listbox" className="max-h-[60vh] space-y-0.5 overflow-auto pb-4">{options.map((o, i) => row(o, i, true))}</ul>
        </Dialog>
      )}
    </div>
  );
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error && <span role="alert" className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

const tones = {
  neutral: "bg-background text-muted",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger/10 text-danger",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, sub, actions, tip }: { title: string; sub?: string; actions?: ReactNode; tip?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-1 text-xl font-semibold tracking-tight">{title}{tip && <InfoTip text={tip} />}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      // A dialog inside a dialog (e.g. the "+N more" chip pop-up) must not close its parent: React lets `close` bubble through the tree.
      onClose={(e) => { if (e.target === ref.current) onClose(); }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(36rem,calc(100vw-1.5rem))] rounded-2xl bg-surface p-0 backdrop:bg-black/30 max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      {open && (
        <div className="max-h-[88vh] overflow-y-auto px-4 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-background"><X size={16} aria-hidden /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export interface ChipOption<T extends string> { id: T; label: string; hint?: string; /** Shown before the label, e.g. a bank logo. */ icon?: ReactNode }

/** One-tap single choice. Replaces dropdowns for short, frequently used lists. */
export function ChipGroup<T extends string>({ label, options, value, onChange, tabs }: { label: string; options: ChipOption<T>[]; value: T; onChange: (v: T) => void; tabs?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1.5", tabs ? "rounded-full bg-background p-1" : "flex-wrap")}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={cn(
              "min-h-9 rounded-full px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              tabs && "flex-1",
              on ? "bg-accent font-medium text-white" : tabs ? "text-muted hover:bg-surface" : "border border-border bg-surface hover:bg-background",
            )}>
            {o.label}{o.hint && <span className={cn("ml-1 text-xs", on ? "text-white/80" : "text-muted")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Label on the left, control on the right: keeps forms to one line per field. */
export function FormRow({ label, children, tip }: { label: string; children: ReactNode; tip?: string }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
      <div className="flex items-center gap-0.5 pt-2 text-xs font-medium text-muted">{label}{tip && <InfoTip text={tip} />}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const chipClass = (on: boolean, icon = false) =>
  cn("min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent", icon && "inline-flex items-center gap-1.5 pl-1.5",
    on ? "border-accent bg-accent font-medium text-white" : "border-border bg-surface hover:bg-background");

/**
 * One line of chips. Whatever does not fit collapses into a "+N" pill that opens
 * the full list in a pop-up. Selected options are always kept visible.
 * `multi` keeps the pop-up open for several picks.
 */
/** Lets a chip list grow in place: a "+" next to the chips opens the full list with a small form to add a new one. */
export interface ChipAdder { label: string; placeholder: string; add: (name: string) => { id?: string; error?: string } }

export function CompactChips<T extends string>({ label, options, selected, onPick, multi, adder }: { label: string; options: ChipOption<T>[]; selected: T[]; onPick: (id: T) => void; multi?: boolean; adder?: ChipAdder }) {
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(options.length);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const compute = () => {
      const w = (wrap.current?.clientWidth ?? 0) - (adder ? 42 : 0);
      const kids = Array.from(meas.current?.children ?? []) as HTMLElement[];
      const total = kids.length - 1; // last child is the "+N" pill
      if (total <= 0 || w === 0) return;
      const gap = 6;
      const all = kids.slice(0, total).reduce((sum, k) => sum + k.offsetWidth + gap, -gap);
      if (all <= w) return setFit(total);
      const moreW = kids[total].offsetWidth;
      let used = 0;
      let n = 0;
      for (let i = 0; i < total; i++) {
        const next = used + kids[i].offsetWidth + gap;
        if (next + moreW > w) break;
        used = next;
        n = i + 1;
      }
      setFit(Math.max(1, n));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [options, adder]);

  const ids = options.map((o) => o.id);
  const visible = ids.slice(0, fit);
  const hidden = ids.slice(fit);
  // Keep selected options visible by swapping them into the trailing slots.
  const pinned = selected.filter((id) => hidden.includes(id));
  for (let i = visible.length - 1, k = 0; k < pinned.length && i >= 0; i--) {
    if (!selected.includes(visible[i])) { visible[i] = pinned[k++]; }
  }
  const overflow = ids.filter((id) => !visible.includes(id));
  const byId = (id: T) => options.find((o) => o.id === id)!;
  const chip = (id: T) => (
    <button key={id} type="button" role={multi ? undefined : "radio"} aria-checked={multi ? undefined : selected.includes(id)} aria-pressed={multi ? selected.includes(id) : undefined}
      onClick={() => onPick(id)} className={chipClass(selected.includes(id), !!byId(id).icon)}>{byId(id).icon}{byId(id).label}</button>
  );
  const more = (n: number) => `+${n}`;

  return (
    <div ref={wrap} role={multi ? "group" : "radiogroup"} aria-label={label} className="relative">
      <div className="flex items-start gap-1.5">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
          {visible.map(chip)}
          {overflow.length > 0 && (
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cn(chipClass(false), "border-dashed text-accent")}>
              {more(overflow.length)} more
            </button>
          )}
        </div>
        {adder && <button type="button" aria-label={adder.label} title={adder.label} onClick={() => setOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-accent/50 text-accent hover:bg-accent/5"><Plus size={16} aria-hidden /></button>}
      </div>
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={meas} className="flex w-max gap-1.5">
          {options.map((o) => <span key={o.id} className={chipClass(false, !!o.icon)}>{o.icon}{o.label}</span>)}
          <span className={chipClass(false)}>{more(99)} more</span>
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-wrap gap-1.5 pb-4">
          {ids.map((id) => (
            <button key={id} type="button" aria-pressed={selected.includes(id)}
              onClick={() => { onPick(id); if (!multi) setOpen(false); }} className={chipClass(selected.includes(id), !!byId(id).icon)}>{byId(id).icon}{byId(id).label}</button>
          ))}
        </div>
        {adder && (
          <form className="mb-4 space-y-1.5 rounded-xl bg-background p-3" onSubmit={(e) => {
            e.preventDefault();
            const r = adder.add(newName);
            if (r.error || !r.id) return setAddError(r.error ?? "Could not add that.");
            setNewName(""); setAddError(null);
            onPick(r.id as T);
            if (!multi) setOpen(false);
          }}>
            <div className="flex gap-2"><Input aria-label={adder.label} placeholder={adder.placeholder} value={newName} maxLength={60} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} /><Button type="submit" variant="primary" disabled={!newName.trim()} className="shrink-0"><Plus size={14} aria-hidden />{adder.label}</Button></div>
            {addError && <p role="alert" className="text-xs text-danger">{addError}</p>}
          </form>
        )}
        {multi && <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></div>}
      </Dialog>
    </div>
  );
}

/** Asks before anything is deleted. Nothing happens until the person presses the red button. */
export function ConfirmDialog({ open, onClose, title, children, confirmLabel = "Delete", onConfirm }: { open: boolean; onClose: () => void; title: string; children: ReactNode; confirmLabel?: string; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-2 text-sm">{children}</div>
      <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose} autoFocus>Keep it</Button>
        <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** Marks anything produced by an AI model, so it is never mistaken for something you or the bank wrote. */
export function AiBadge({ children = "AI", tone = "ai", title = "Suggested by AI (Claude). Check it before approving." }: { children?: ReactNode; tone?: "ai" | "unsure"; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone === "ai" ? "bg-accent/10 text-accent" : "bg-warn-soft text-warn")}>
      <svg aria-hidden viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l1.8 5.6L19.5 9.5l-5.7 1.9L12 17l-1.8-5.6L4.5 9.5l5.7-1.9L12 2zm7 12l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" /></svg>
      {children}
    </span>
  );
}

/** Positions an AI feature as such: what it does, whether it is on, and what it costs you (nothing is sent without the key). */
export function AiFeatureCard({ enabled, title, children, className }: { enabled: boolean; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-accent/10 via-surface to-surface p-4 ring-1 ring-accent/20", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge>AI-powered</AiBadge>
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-medium", enabled ? "bg-good-soft text-good" : "bg-background text-muted")}>{enabled ? "On" : "Off"}</span>
      </div>
      <div className="mt-2 space-y-1.5 text-sm text-muted">{children}</div>
    </section>
  );
}
