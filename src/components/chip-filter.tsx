"use client";
import type { ReactNode } from "react";
import { HScroll } from "@/components/hscroll";
import { cn } from "@/lib/cn";

/** A filter as one sideways-scrolling row of chips with a small picture each: one tap picks it, tap again to clear. */
export function ChipFilter({ label, value, onPick, options }: { label: string; value: string; onPick: (v: string) => void; options: { id: string; label: string; icon: ReactNode }[] }) {
  // Two rows, each pill as wide as its own text. Each pill goes on the shorter row so the rows end about together.
  const rows: { id: string; label: string; icon: ReactNode }[][] = [[], []];
  const widths = [0, 0];
  for (const o of options) { const w = o.label.length + 6; const k = widths[0] <= widths[1] ? 0 : 1; rows[k].push(o); widths[k] += w; }
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted/80">{label}</legend>
      <HScroll className="px-4">
        <div className="flex w-max flex-col gap-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((o) => {
                const on = o.id === value;
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => onPick(on ? "" : o.id)} className={cn("flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border py-1 pl-1.5 pr-3.5 text-sm transition-colors", on ? "border-accent bg-accent font-medium text-white" : "border-transparent bg-background text-foreground hover:border-border")}>
                    <span className={cn("grid size-7 shrink-0 place-items-center overflow-hidden rounded-full", on ? "bg-white/20 text-white" : "bg-surface text-muted")}>{o.icon}</span>{o.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </HScroll>
    </fieldset>
  );
}
