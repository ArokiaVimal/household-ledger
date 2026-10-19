"use client";
// Pick a transaction (already approved, or still waiting in Review) that paid this recurring item for the month.
// The transaction gets linked to the item, so the item shows as paid and stays in sync with the import.
import { Badge, Button, Dialog } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { signedSpend } from "@/domain/reports";
import { plannedFor } from "@/domain/recurring";
import type { RecurringItem } from "@/domain/types";

export function LinkPaymentDialog({ item, month, onClose }: { item: RecurringItem | null; month: string; onClose: () => void }) {
  const { records, staged, accountName, updateRecord, updateStaged } = useStore();
  const rows = item
    ? [...records.map((r) => ({ r, waiting: false })), ...staged.map((r) => ({ r, waiting: true }))]
      .filter(({ r, waiting }) => r.date.startsWith(month) && !r.recurringId && (item.direction === "in" ? r.kind === "income" : r.kind !== "cc_payment" && r.kind !== "income" && (waiting || signedSpend(r) > 0)))
      .sort((a, b) => Math.abs(a.r.amountPaise - plannedFor(item, month)) - Math.abs(b.r.amountPaise - plannedFor(item, month)))
      .slice(0, 12)
    : [];
  return (
    <Dialog open={!!item} onClose={onClose} title={item ? `Which payment was ${item.name}?` : "Link a payment"}>
      {item && (
        <div className="space-y-3 pb-1 text-sm">
          <p className="text-muted">Transactions in {month} that are not linked to anything yet, closest to {formatINR(plannedFor(item, month))} first. Linking marks {item.name} paid, and it stays in sync if the transaction changes.</p>
          {rows.length === 0 ? <p className="rounded-xl bg-background p-3 text-muted">Nothing to link in this month yet. Import your statement first, or use Mark paid.</p> : (
            <ul className="divide-y divide-border rounded-xl bg-background px-3">
              {rows.map(({ r, waiting }) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0"><span className="block truncate font-medium">{r.merchant}</span><span className="block text-xs text-muted">{r.date} · {accountName(r.accountId)}{waiting ? " · " : ""}{waiting && <Badge>In Review</Badge>}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className="num font-semibold">{formatINR(r.amountPaise)}</span><Button onClick={() => { (waiting ? updateStaged : updateRecord)(r.id, { recurringId: item.id }); onClose(); }}>Link</Button></span>
                </li>
              ))}
            </ul>
          )}
          {rows.some((x) => x.waiting) && <p className="text-xs text-muted">A payment still in Review counts as paid once you approve it.</p>}
        </div>
      )}
    </Dialog>
  );
}
