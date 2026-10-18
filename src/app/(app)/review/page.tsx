"use client";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MerchantAvatar, Amount } from "@/components/txn-row";
import { TxnReviewDialog } from "@/components/txn-edit-dialog";
import { Badge, Button, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import type { ExpenseRecord } from "@/domain/types";

export default function Review() {
  const { staged, nameOf, categoryName, accountName, approveStaged } = useStore();
  const [open, setOpen] = useState<ExpenseRecord | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const pending = staged.filter((r) => r.id !== open?.id);
  const next = open ? { remaining: pending.length, open: () => setOpen(pending[0] ?? null) } : undefined;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = staged.filter((r) => picked.has(r.id));
  const flagged = chosen.filter((r) => r.duplicateOf).length;

  return (
    <>
      <PageHeader title="Review queue" sub="Imported rows stay here until you approve them. Only approved rows count in reports, balances and the dashboard."
        actions={<Link href="/import" className="rounded-full border border-border bg-surface px-3 py-2 text-sm">Import</Link>} />
      {staged.length === 0 ? (
        <EmptyState title="Nothing waiting for review" hint="Imported statements will appear here before they are added." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="warn">{staged.length} awaiting review</Badge>
            <Button onClick={() => setOpen(staged[0])} variant="primary"><ClipboardCheck size={16} aria-hidden />Start reviewing</Button>
            <Button onClick={() => setPicked(picked.size === staged.length ? new Set() : new Set(staged.map((r) => r.id)))}>{picked.size === staged.length ? "Clear selection" : "Select all"}</Button>
            {picked.size > 0 && <Button onClick={() => setConfirm(true)}>Approve {picked.size} as they are…</Button>}
          </div>
          <ul className="space-y-2">
            {staged.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-[var(--radius-card)] bg-surface p-3">
                <input type="checkbox" aria-label={`Select ${r.merchant}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--accent)]" />
                <button onClick={() => setOpen(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <MerchantAvatar name={r.merchant} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.merchant}</div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {r.date} · {accountName(r.accountId)} · {categoryName(r.categoryId)} · paid by {nameOf(r.payerId)}
                      {r.duplicateOf && <Badge tone="bad">Possible duplicate</Badge>}
                      {r.shared && <Badge tone="good">Shared</Badge>}
                      <Badge tone="warn">Unreviewed</Badge>
                    </div>
                  </div>
                  <Amount r={r} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <TxnReviewDialog record={open} onClose={() => setOpen(null)} next={next} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Approve ${picked.size} transactions?`}>
        <p className="text-sm">They will be added to the ledger with the categories and splits shown, and marked Reviewed.{flagged > 0 && ` ${flagged} of them are flagged as possible duplicates.`}</p>
        <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { chosen.forEach((r) => approveStaged(r.id)); setPicked(new Set()); setConfirm(false); }}>Approve {picked.size}</Button>
        </div>
      </Dialog>
    </>
  );
}
