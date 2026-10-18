"use client";
import { ClipboardCheck, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { MerchantAvatar, Amount } from "@/components/txn-row";
import { TxnReviewDialog } from "@/components/txn-edit-dialog";
import { AiBadge, AiFeatureCard, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import type { ExpenseRecord } from "@/domain/types";

/** Set the first time the owner clears the review queue, so the jump to the dashboard happens only once on this device. */
const FIRST_REVIEW_KEY = "pf:first-review-done";

export default function Review() {
  return <Suspense fallback={null}><ReviewQueue /></Suspense>;
}

function ReviewQueue() {
  const router = useRouter();
  const params = useSearchParams();
  const imported = Number(params.get("imported") || 0);
  const skipped = Number(params.get("skipped") || 0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { live, aiEnabled, records, staged, nameOf, categoryName, accountName, approveStaged, deleteRecords } = useStore();
  const [open, setOpen] = useState<ExpenseRecord | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseRecord[] | null>(null);

  const pending = staged.filter((r) => r.id !== open?.id);
  const next = open ? { remaining: pending.length, open: () => setOpen(pending[0] ?? null) } : undefined;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = staged.filter((r) => picked.has(r.id));
  // Rows the app is confident about: remembered from your own approvals, or Claude was sure. Possible duplicates always need you.
  const confident = staged.filter((r) => (r.suggested === "memory" || r.suggested === "ai") && !r.duplicateOf);
  const fillable = staged.filter((r) => !r.suggested).length;
  const fillWithAi = async () => {
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/suggest", { method: "POST" });
      const body = (await res.json()) as { error?: string; result?: { filled: number; needYou: number; aiEnabled: boolean; ai: { asked: number; inputTokens: number; outputTokens: number; error?: string } } };
      if (!res.ok || !body.result) throw new Error(body.error ?? "Could not fill in suggestions.");
      const r = body.result;
      setNote(`${r.filled} rows filled in${r.ai.asked > 0 ? `, ${r.ai.asked} new merchants asked to AI (${(r.ai.inputTokens + r.ai.outputTokens).toLocaleString("en-IN")} tokens)` : ""}. ${r.needYou} still need you.${!r.aiEnabled ? " AI is off (no API key on the server), so only your memory was used." : ""}${r.ai.error ? ` ${r.ai.error}.` : ""}`);
      router.refresh();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const flagged = chosen.filter((r) => r.duplicateOf).length;

  // The queue just went from "has rows" to empty. The first time this happens with something approved, show the dashboard.
  const waiting = useRef(staged.length);
  useEffect(() => {
    const was = waiting.current;
    waiting.current = staged.length;
    if (was === 0 || staged.length > 0) return;
    let done = false;
    try { done = localStorage.getItem(FIRST_REVIEW_KEY) === "1"; } catch { /* storage unavailable: treat as not done */ }
    if (!done && records.length > 0) {
      try { localStorage.setItem(FIRST_REVIEW_KEY, "1"); } catch { /* ignore */ }
      router.push("/?reviewed=1");
    } else if (imported > 0) router.replace("/review"); // the confirmation has done its job
  }, [staged.length, records.length, imported, router]);

  // Right after an import the rows are still arriving from the server; do not flash "nothing waiting". Give up after a few seconds.
  const arriving = imported > 0 && staged.length === 0;
  useEffect(() => {
    if (!arriving) return;
    const t = setTimeout(() => router.replace("/review"), 8000);
    return () => clearTimeout(t);
  }, [arriving, router]);

  return (
    <>
      <PageHeader title="Review queue" sub="Imported rows stay here until you approve them. Only approved rows count in reports, balances and the dashboard."
        actions={<Link href="/import" className="rounded-full border border-border bg-surface px-3 py-2 text-sm">Import</Link>} />
      {imported > 0 && staged.length > 0 && (
        <div role="status" className="mb-3 rounded-2xl bg-good-soft p-3 text-sm text-good">
          <b>{imported}</b> transaction{imported === 1 ? "" : "s"} imported{skipped > 0 ? `, ${skipped} already-imported row${skipped === 1 ? "" : "s"} skipped` : ""}. Check each one and approve it. Once you approve the last one you will land on your dashboard.
        </div>
      )}
      {arriving ? (
        <p role="status" className="rounded-[var(--radius-card)] bg-surface p-6 text-sm text-muted">Loading your {imported} imported transaction{imported === 1 ? "" : "s"}…</p>
      ) : staged.length === 0 ? (
        <EmptyState title="Nothing waiting for review" hint="Imported statements will appear here before they are added." />
      ) : (
        <>
          {live && (
            <AiFeatureCard enabled={aiEnabled} title="AI-powered review assist" className="mb-3">
              <p>{aiEnabled ? "Rows marked AI were named and categorised by Claude; Remembered rows come from what you approved before. Approve the confident ones in one go and fix the rest." : "AI is off, so only your own memory fills rows in. Add an AI key on the server to switch it on."}</p>
            </AiFeatureCard>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="warn">{staged.length} awaiting review</Badge>
            <Button onClick={() => setOpen(staged[0])} variant="primary"><ClipboardCheck size={16} aria-hidden />Start reviewing</Button>
            <Button onClick={() => setPicked(picked.size === staged.length ? new Set() : new Set(staged.map((r) => r.id)))}>{picked.size === staged.length ? "Clear selection" : "Select all"}</Button>
            {live && fillable > 0 && <Button onClick={fillWithAi} disabled={busy}><Sparkles size={15} aria-hidden />{busy ? "Asking AI…" : `Fill in ${fillable} with AI`}<AiBadge>AI</AiBadge></Button>}
            {confident.length > 0 && <Button onClick={() => setPicked(new Set(confident.map((r) => r.id)))}><Sparkles size={15} aria-hidden />Select {confident.length} confident ones</Button>}
            {picked.size > 0 && <Button onClick={() => setConfirm(true)}>Approve {picked.size} as they are…</Button>}
            {picked.size > 0 && <Button variant="danger" onClick={() => setDeleting(chosen)}><Trash2 size={15} aria-hidden />Delete {picked.size}…</Button>}
          </div>
          {note && <p role="status" className="mb-3 rounded-xl bg-accent/5 p-3 text-sm">{note}</p>}
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
                      {r.suggested === "memory" && <Badge tone="good">Remembered</Badge>}
                      {r.suggested === "ai" && <AiBadge>AI guess</AiBadge>}
                      {r.suggested === "ai_unsure" && <AiBadge tone="unsure">AI unsure, check</AiBadge>}
                      {!r.suggested && r.categoryId === "uncategorized" && <Badge tone="warn">Needs a category</Badge>}
                    </div>
                  </div>
                  <Amount r={r} />
                </button>
                <button type="button" onClick={() => setDeleting([r])} aria-label={`Delete ${r.merchant}`} title="Delete"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={16} aria-hidden /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={deleting && deleting.length > 1 ? `Delete ${deleting.length} transactions?` : "Delete this transaction?"}
        onConfirm={() => { if (deleting) { deleteRecords(deleting.map((r) => r.id)); setPicked(new Set()); } }}>
        {deleting && deleting.length === 1 ? <p><strong>{deleting[0].merchant}</strong> · {deleting[0].date}</p> : <p>The {deleting?.length} selected rows will be removed from the review queue.</p>}
        <p className="text-muted">Nothing has been added to your reports yet, so your totals will not change. The original statement lines stay in the import history. This cannot be undone.</p>
      </ConfirmDialog>
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
