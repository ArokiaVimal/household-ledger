"use client";
// Shared UI primitives (shadcn-style, token-driven). Compose screens from these.
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
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
          <h2 className="mb-3 text-base font-semibold">{title}</h2>
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

/** Small section label for forms built from chips. */
export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}
