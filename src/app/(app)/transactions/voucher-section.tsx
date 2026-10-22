"use client";
import { ChevronDown, Ticket } from "lucide-react";
import { useState } from "react";
import { CompactRow } from "@/components/txn-compact";
import { formatINR } from "@/domain/money";
import { cn } from "@/lib/cn";
import type { ExpenseRecord } from "@/domain/types";

/** One voucher brand in one month: what was bought, and everything paid with it. */
export interface VoucherGroup { id: string; name: string; /** YYYY-MM */ month: string; boughtPaise: number; bought: ExpenseRecord[]; /** Payments made with the voucher, plus wallet top-ups and refunds. */ paidWith: ExpenseRecord[]; spentPaise: number }

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Vouchers as one line each: every purchase of a brand in the month (for example three Amazon vouchers bought through Shopwise) is
 * added into a single line, and the payments made with that voucher sit under it, each with its own category and split. The voucher
 * itself has no category. Payments never count again; the purchase on the card was the outflow.
 */
export function VoucherSection({ groups, showMonth, onOpen, onVerify, onDelete }: { groups: VoucherGroup[]; showMonth: boolean; onOpen: (r: ExpenseRecord) => void; onVerify: (r: ExpenseRecord) => void; onDelete: (r: ExpenseRecord) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (groups.length === 0) return null;
  const sub = (label: string, total: number) => <h3 className="flex items-baseline justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted"><span>{label}</span><span className="num text-sm normal-case tracking-normal text-foreground">{formatINR(total)}</span></h3>;
  const rows = (list: ExpenseRecord[]) => <ul className="space-y-1.5">{list.map((r) => <li key={r.id}><CompactRow r={r} showDate onOpen={() => onOpen(r)} onVerify={() => onVerify(r)} onDelete={() => onDelete(r)} /></li>)}</ul>;
  return (
    <section aria-label="Vouchers" className="mt-4 space-y-2">
      <h2 className="flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted"><span className="flex items-center gap-1.5"><Ticket size={14} aria-hidden />Vouchers</span><span className="num normal-case tracking-normal text-foreground">{formatINR(groups.reduce((t, g) => t + g.boughtPaise, 0))}<span className="ml-1 font-normal text-muted">bought</span></span></h2>
      {groups.map((g) => {
        const on = !!open[g.id];
        const bits = [g.bought.length ? `${g.bought.length} bought` : "", g.paidWith.length ? `${g.paidWith.length} paid with it` : ""].filter(Boolean).join(" · ");
        return (
          <div key={g.id} className="rounded-[var(--radius-card)] bg-surface">
            <button type="button" aria-expanded={on} onClick={() => setOpen((s) => ({ ...s, [g.id]: !on }))} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.name} voucher{showMonth ? ` · ${monthLabel(g.month)}` : ""}</span>
                <span className="block truncate text-xs text-muted">{bits}{g.bought.length && g.spentPaise !== 0 ? ` · ${formatINR(g.spentPaise)} spent` : ""}</span>
              </span>
              <span className="num shrink-0 text-right font-medium">{formatINR(g.bought.length ? g.boughtPaise : g.spentPaise)}<span className="block text-xs font-normal text-muted">{g.bought.length ? "bought" : "spent"}</span></span>
              <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted transition-transform", on && "rotate-180")} />
            </button>
            {on && (
              <div className="space-y-3 px-3 pb-3">
                {g.bought.length > 0 && <div className="space-y-1">{sub("Bought", g.boughtPaise)}{rows(g.bought)}</div>}
                {g.paidWith.length > 0 && <div className="space-y-1">{sub("Paid with it", g.spentPaise)}{rows(g.paidWith)}</div>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
