"use client";
// Shared UI primitives (shadcn-style, token-driven). Compose screens from these.
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[var(--radius-card)] bg-surface p-4 shadow-[0_1px_0_rgba(20,18,31,0.03)]", className)}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted">{children}</h2>
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
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, p.className)} />;

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

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
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
      onClose={onClose}
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

export interface ChipOption<T extends string> { id: T; label: string; hint?: string }

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
export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
      <div className="pt-2 text-xs font-medium text-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const chipClass = (on: boolean) =>
  cn("min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent",
    on ? "border-accent bg-accent font-medium text-white" : "border-border bg-surface hover:bg-background");

/**
 * One line of chips. Whatever does not fit collapses into a "+N" pill that opens
 * the full list in a pop-up. Selected options are always kept visible.
 * `multi` keeps the pop-up open for several picks.
 */
export function CompactChips<T extends string>({ label, options, selected, onPick, multi }: { label: string; options: ChipOption<T>[]; selected: T[]; onPick: (id: T) => void; multi?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(options.length);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const compute = () => {
      const w = wrap.current?.clientWidth ?? 0;
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
  }, [options]);

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
      onClick={() => onPick(id)} className={chipClass(selected.includes(id))}>{byId(id).label}</button>
  );
  const more = (n: number) => `+${n}`;

  return (
    <div ref={wrap} role={multi ? "group" : "radiogroup"} aria-label={label} className="relative">
      <div className="flex gap-1.5 overflow-hidden">
        {visible.map(chip)}
        {overflow.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cn(chipClass(false), "border-dashed text-accent")}>
            {more(overflow.length)} more
          </button>
        )}
      </div>
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={meas} className="flex w-max gap-1.5">
          {options.map((o) => <span key={o.id} className={chipClass(false)}>{o.label}</span>)}
          <span className={chipClass(false)}>{more(99)} more</span>
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-wrap gap-1.5 pb-4">
          {ids.map((id) => (
            <button key={id} type="button" aria-pressed={selected.includes(id)}
              onClick={() => { onPick(id); if (!multi) setOpen(false); }} className={chipClass(selected.includes(id))}>{byId(id).label}</button>
          ))}
        </div>
        {multi && <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></div>}
      </Dialog>
    </div>
  );
}
