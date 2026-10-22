"use client";
import { useState } from "react";
import { MerchantAvatar } from "@/components/txn-row";
import { Badge, Button, ConfirmDialog, Dialog } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { ExpenseRecord } from "@/domain/types";

interface Line { label: string; a: string; b: string; mono?: boolean }

/** Two rows that look like the same payment, side by side, with what to do about it. */
export function DupCompare({ open, onClose, onDeletedMine, mine, other }: { open: boolean; onClose: () => void; /** This row was deleted: the caller moves on. */ onDeletedMine: () => void; mine: ExpenseRecord; other: ExpenseRecord }) {
  const { nameOf, categoryName, accountName, updateStaged, deleteRecords } = useStore();
  const [confirm, setConfirm] = useState<"mine" | "other" | null>(null);
  const people = (r: ExpenseRecord) => r.split.participantIds.map((id) => nameOf(id)).join(", ") || "Just you";
  const status = (r: ExpenseRecord) => (r.status === "reviewed" ? "Verified" : "Unverified");
  const lines: Line[] = [
    { label: "Amount", a: formatINR(mine.amountPaise), b: formatINR(other.amountPaise) },
    { label: "Date", a: mine.date, b: other.date },
    { label: "Merchant", a: mine.merchant, b: other.merchant },
    { label: "Paid with", a: accountName(mine.accountId), b: accountName(other.accountId) },
    { label: "Category", a: categoryName(mine.categoryId), b: categoryName(other.categoryId) },
    { label: "Split with", a: people(mine), b: people(other) },
    { label: "Status", a: status(mine), b: status(other) },
    { label: "From", a: mine.importSource, b: other.importSource },
    { label: "Bank text", a: mine.originalDescription, b: other.originalDescription, mono: true },
  ];
  const same = lines.filter((l) => l.a === l.b).map((l) => l.label.toLowerCase());
  const differ = lines.filter((l) => l.a !== l.b).map((l) => l.label.toLowerCase());
  const keepBoth = () => { updateStaged(mine.id, { duplicateOf: undefined }); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} title="Compare">
      <div className="space-y-3 pb-1 text-sm">
        <p className="text-xs text-muted">Same: {same.join(", ") || "nothing"}. {differ.length > 0 ? `Different: ${differ.join(", ")}.` : "Everything matches."}</p>
        <div className="grid grid-cols-2 gap-2">
          {([["This one", mine], ["Already have", other]] as const).map(([title, r]) => (
            <div key={title} className="min-w-0 rounded-2xl border border-border p-2.5">
              <div className="mb-1.5 flex items-center gap-2"><MerchantAvatar name={r.merchant} size={28} /><span className="truncate text-xs font-semibold">{title}</span></div>
              <Badge tone={r.status === "reviewed" ? "good" : "warn"}>{status(r)}</Badge>
            </div>
          ))}
        </div>
        <dl className="divide-y divide-border rounded-2xl border border-border">
          {lines.map((l) => {
            const diff = l.a !== l.b;
            const cell = (v: string) => <dd className={`min-w-0 break-words px-2.5 py-1.5 ${l.mono ? "font-mono text-xs" : ""} ${diff ? "bg-warn-soft/60" : ""}`}>{v || "—"}</dd>;
            return (
              <div key={l.label}>
                <dt className="bg-background px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted/80">{l.label}</dt>
                <div className="grid grid-cols-2 divide-x divide-border">{cell(l.a)}{cell(l.b)}</div>
              </div>
            );
          })}
        </dl>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={keepBoth}>Keep both (they are different payments)</Button>
          <Button variant="danger" onClick={() => setConfirm("mine")}>Delete this one</Button>
          <Button variant="danger" onClick={() => setConfirm("other")}>Delete the one I already have</Button>
        </div>
      </div>
      <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "mine" ? "Delete this transaction?" : "Delete the one you already have?"}
        onConfirm={() => { const was = confirm; deleteRecords([(was === "mine" ? mine : other).id]); setConfirm(null); onClose(); if (was === "mine") onDeletedMine(); }}>
        {confirm && <p><strong>{(confirm === "mine" ? mine : other).merchant}</strong> · {formatINR((confirm === "mine" ? mine : other).amountPaise)} · {(confirm === "mine" ? mine : other).date}</p>}
        <p className="text-muted">It stops counting in your totals. The original line stays in the import history. This can&apos;t be undone.</p>
      </ConfirmDialog>
    </Dialog>
  );
}
