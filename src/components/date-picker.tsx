"use client";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, MONTH_SHORT, monthGrid, monthTitle } from "@/domain/calendar";
import { shiftMonth } from "@/domain/months";
import { Dialog } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The app's own calendar: a rounded month grid in a sheet, with Today and Yesterday shortcuts. Tap the month to jump to another month or
 * year. Picking a day closes it. It replaces the browser's plain date popup, which looks different in every browser.
 */
export function DateSheet({ open, value, today, title = "Pick a date", onPick, onClose }: { open: boolean; value: string; today: string; title?: string; onPick: (iso: string) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && <Calendar value={value} today={today} onPick={(d) => { onPick(d); onClose(); }} />}
    </Dialog>
  );
}

function Calendar({ value, today, onPick }: { value: string; today: string; onPick: (iso: string) => void }) {
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const [months, setMonths] = useState(false); // the month and year chooser
  const yesterday = addDays(today, -1);
  const arrow = "grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-accent";
  const chip = (on: boolean) => cn("min-h-9 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "border-accent bg-accent text-white" : "border-border bg-surface hover:bg-background");

  return (
    <div className="mx-auto w-full max-w-[22rem] pb-4">
      <div className="mb-3 flex gap-2">
        <button type="button" className={chip(value === today)} onClick={() => onPick(today)}>Today</button>
        <button type="button" className={chip(value === yesterday)} onClick={() => onPick(yesterday)}>Yesterday</button>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label={months ? "Previous year" : "Previous month"} className={arrow} onClick={() => setMonth(shiftMonth(month, months ? -12 : -1))}><ChevronLeft size={18} aria-hidden /></button>
        <button type="button" aria-expanded={months} onClick={() => setMonths((v) => !v)} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-base font-semibold hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">
          {months ? month.slice(0, 4) : monthTitle(month)}<ChevronRight size={14} aria-hidden className={cn("text-muted transition-transform", months ? "-rotate-90" : "rotate-90")} />
        </button>
        <button type="button" aria-label={months ? "Next year" : "Next month"} className={arrow} onClick={() => setMonth(shiftMonth(month, months ? 12 : 1))}><ChevronRight size={18} aria-hidden /></button>
      </div>
      {months ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Months">
          {MONTH_SHORT.map((m, i) => {
            const key = `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
            return <button key={m} type="button" aria-pressed={key === month} onClick={() => { setMonth(key); setMonths(false); }}
              className={cn("min-h-12 rounded-2xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent", key === month ? "bg-accent text-white" : key === today.slice(0, 7) ? "bg-accent/10 text-accent" : "bg-background hover:bg-border/50")}>{m}</button>;
          })}
        </div>
      ) : (
        <div role="grid" aria-label={monthTitle(month)}>
          <div role="row" className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted">{WEEKDAYS.map((d, i) => <span key={i} role="columnheader">{d}</span>)}</div>
          {monthGrid(month).map((week, w) => (
            <div key={w} role="row" className="grid grid-cols-7 gap-y-1">
              {week.map((d, i) => d ? (
                <button key={d} type="button" role="gridcell" aria-selected={d === value} aria-current={d === today ? "date" : undefined}
                  aria-label={new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} onClick={() => onPick(d)}
                  className={cn("num mx-auto grid size-10 place-items-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                    d === value ? "bg-accent font-semibold text-white shadow-sm" : d === today ? "font-semibold text-accent ring-1 ring-accent hover:bg-accent/10" : "hover:bg-accent/10")}>{Number(d.slice(8))}</button>
              ) : <span key={`e${i}`} role="gridcell" aria-hidden />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The small date chip used in forms: shows the date and opens the calendar sheet. */
export function DateChip({ value, today, onPick, label = "Date" }: { value: string; today: string; onPick: (iso: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const text = value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "Date";
  return (
    <>
      <button type="button" aria-label={`${label}: ${text}. Change`} aria-haspopup="dialog" onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">
        <CalendarDays size={13} aria-hidden className="text-accent" /><span className="num">{text}</span>
      </button>
      <DateSheet open={open} value={value} today={today} onPick={onPick} onClose={() => setOpen(false)} />
    </>
  );
}
