"use client";
import { ChevronDown, Ticket } from "lucide-react";
import { useState } from "react";
import { CompactRow } from "@/components/txn-compact";
import { formatINR } from "@/domain/money";
import { cn } from "@/lib/cn";
import type { ExpenseRecord } from "@/domain/types";

export interface VoucherGroup { id: string; name: string; /** Money put into the wallet (top-ups). */ loadedPaise: number; /** Spent from it, in the rows shown. */ spentPaise: number; rows: ExpenseRecord[] }

/**
 * The payments made with a voucher (for example Amazon Pay, bought through Shopwise on this card), kept apart from the card's own
 * charges. They never count as spending again: the voucher purchase on the card was the outflow.
 */
export function VoucherSection({ groups, onOpen, onVerify, onDelete }: { groups: VoucherGroup[]; onOpen: (r: ExpenseRecord) => void; onVerify: (r: ExpenseRecord) => void; onDelete: (r: ExpenseRecord) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (groups.length === 0) return null;
  return (
    <section aria-label="Paid with vouchers" className="mt-4 space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted"><Ticket size={14} aria-hidden />Paid with vouchers</h2>
      {groups.map((g) => {
        const on = !!open[g.id];
        return (
          <div key={g.id} className="rounded-[var(--radius-card)] bg-surface">
            <button type="button" aria-expanded={on} onClick={() => setOpen((s) => ({ ...s, [g.id]: !on }))} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.name} voucher</span>
                <span className="block truncate text-xs text-muted">{g.rows.length} payment{g.rows.length === 1 ? "" : "s"}{g.loadedPaise > 0 ? ` · ${formatINR(g.loadedPaise)} added` : ""} · does not count again</span>
              </span>
              <span className="num shrink-0 text-right font-medium">{formatINR(g.spentPaise)}<span className="block text-xs font-normal text-muted">spent</span></span>
              <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted transition-transform", on && "rotate-180")} />
            </button>
            {on && (
              <ul className="space-y-1.5 px-3 pb-3">
                {g.rows.map((r) => <li key={r.id}><CompactRow r={r} showDate onOpen={() => onOpen(r)} onVerify={() => onVerify(r)} onDelete={() => onDelete(r)} /></li>)}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
