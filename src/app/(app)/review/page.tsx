"use client";
import { ClipboardCheck, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MerchantAvatar, Amount } from "@/components/txn-row";
import { TxnReviewDialog } from "@/components/txn-edit-dialog";
import { AiBadge, AiFeatureCard, Badge, Button, ConfirmDialog, Dialog, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { ExpenseRecord } from "@/domain/types";
import { needsVoucherBrand } from "@/domain/vouchers";

/** Set the first time the owner clears the review queue, so the jump to the dashboard happens only once on this device. */
const FIRST_REVIEW_KEY = "pf:first-review-done";

type Quick = "all" | "dups" | "nocat" | "aicheck" | "remembered" | "voucher" | "monthly" | "shared";
const QUICK: { id: Quick; label: string; test: (r: ExpenseRecord) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "dups", label: "Possible duplicates", test: (r) => !!r.duplicateOf },
  { id: "nocat", label: "Needs a category", test: (r) => !r.suggested && r.categoryId === "uncategorized" },
  { id: "aicheck", label: "AI to check", test: (r) => r.suggested === "ai" || r.suggested === "ai_unsure" },
  { id: "remembered", label: "Remembered", test: (r) => r.suggested === "memory" },
  { id: "voucher", label: "Vouchers", test: (r) => needsVoucherBrand(r) || !!r.voucherPending },
  { id: "monthly", label: "Looks monthly", test: (r) => !!r.recurringHint },
  { id: "shared", label: "Shared", test: (r) => r.shared },
];
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });

export default function Review() {
  return <Suspense fallback={null}><ReviewQueue /></Suspense>;
}

function ReviewQueue() {
  const router = useRouter();
  const params = useSearchParams();
  const imported = Number(params.get("imported") || 0);
  const skipped = Number(params.get("skipped") || 0);
  const months = (params.get("months") ?? "").split(",").filter((m) => /^\d{4}-\d{2}$/.test(m)).map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { live, aiEnabled, records, staged, nameOf, categoryName, accountName, approveStaged, deleteRecords } = useStore();
  const [open, setOpen] = useState<ExpenseRecord | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseRecord[] | null>(null);

  // Search and filters narrow what you see and what "Start reviewing", "Select all" and the bulk actions work on.
  const [q, setQ] = useState("");
  const [acct, setAcct] = useState("");
  const [cat, setCat] = useState("");
  const [mon, setMon] = useState("");
  const [quick, setQuick] = useState<Quick>("all");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => staged.filter((r) =>
    (!acct || r.accountId === acct) && (!cat || r.categoryId === cat) && (!mon || r.date.startsWith(mon)) && QUICK.find((x) => x.id === quick)!.test(r) &&
    (!needle || `${r.merchant} ${r.originalDescription} ${r.notes ?? ""} ${formatINR(r.amountPaise)} ${(r.amountPaise / 100).toFixed(2)}`.toLowerCase().includes(needle)),
  ), [staged, acct, cat, mon, quick, needle]);
  const filtered = !!(needle || acct || cat || mon || quick !== "all");
  const accountsIn = [...new Set(staged.map((r) => r.accountId))];
  const categoriesIn = [...new Set(staged.map((r) => r.categoryId))];
  const monthsIn = [...new Set(staged.map((r) => r.date.slice(0, 7)))].sort().reverse();
  const clearFilters = () => { setQ(""); setAcct(""); setCat(""); setMon(""); setQuick("all"); setPicked(new Set()); };
  const narrow = (set: () => void) => { set(); setPicked(new Set()); };

  const pending = shown.filter((r) => r.id !== open?.id);
  const next = open ? { remaining: pending.length, open: () => setOpen(pending[0] ?? null) } : undefined;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = shown.filter((r) => picked.has(r.id));
  // Rows the app is confident about: remembered from your own approvals, or Claude was sure. Possible duplicates always need you.
  const confident = shown.filter((r) => (r.suggested === "memory" || r.suggested === "ai") && !r.duplicateOf);
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
      <PageHeader tip="Imported rows wait here. Only approved rows count in your totals." title="Review queue" sub="Approve rows to add them to your totals."
        actions={<Link href="/import" className="rounded-full border border-border bg-surface px-3 py-2 text-sm">Import</Link>} />
      {imported > 0 && staged.length > 0 && (
        <div role="status" className="mb-3 rounded-2xl bg-good-soft p-3 text-sm text-good">
          <b>{imported}</b> transaction{imported === 1 ? "" : "s"} imported{months.length > 0 ? ` for ${months.join(" and ")}` : ""}{skipped > 0 ? `, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}. Each one counts in the month it was paid, once you approve it. Check each one and approve it. Once you approve the last one you will land on your dashboard.
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
              <p>{aiEnabled ? "AI rows were categorized by Claude. Remembered rows match what you approved before. Approve the sure ones together and fix the rest." : "AI is off. Rows are filled from what you approved before."}</p>
            </AiFeatureCard>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="warn">{filtered ? `${shown.length} of ${staged.length} shown` : `${staged.length} awaiting review`}</Badge>
            <Button onClick={() => shown[0] && setOpen(shown[0])} variant="primary" disabled={shown.length === 0}><ClipboardCheck size={16} aria-hidden />Start reviewing</Button>
            <Button disabled={shown.length === 0} onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)))}>{picked.size === shown.length && shown.length > 0 ? "Clear selection" : filtered ? `Select these ${shown.length}` : "Select all"}</Button>
            {live && fillable > 0 && <Button onClick={fillWithAi} disabled={busy}><Sparkles size={15} aria-hidden />{busy ? "Asking AI…" : `Fill in ${fillable} with AI`}<AiBadge>AI</AiBadge></Button>}
            {confident.length > 0 && <Button onClick={() => setPicked(new Set(confident.map((r) => r.id)))}><Sparkles size={15} aria-hidden />Select {confident.length} confident ones</Button>}
            {picked.size > 0 && <Button onClick={() => setConfirm(true)}>Approve {picked.size} as they are…</Button>}
            {picked.size > 0 && <Button variant="danger" onClick={() => setDeleting(chosen)}><Trash2 size={15} aria-hidden />Delete {picked.size}…</Button>}
          </div>
          <div className="mb-3 space-y-2" role="search" aria-label="Search and filter the review queue">
            <div className="relative">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input aria-label="Search the review queue" placeholder="Search merchant, text or amount" value={q} onChange={(e) => narrow(() => setQ(e.target.value))} className="pl-10 pr-10" />
              {q && <button type="button" aria-label="Clear search" onClick={() => narrow(() => setQ(""))} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-background"><X size={14} aria-hidden /></button>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select aria-label="Payment method" value={acct} onChange={(e) => narrow(() => setAcct(e.target.value))}><option value="">All payment methods</option>{accountsIn.map((id) => <option key={id} value={id}>{accountName(id)}</option>)}</Select>
              <Select aria-label="Category" value={cat} onChange={(e) => narrow(() => setCat(e.target.value))}><option value="">All categories</option>{categoriesIn.map((id) => <option key={id} value={id}>{categoryName(id)}</option>)}</Select>
              <Select aria-label="Month" value={mon} onChange={(e) => narrow(() => setMon(e.target.value))}><option value="">All months</option>{monthsIn.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
              {QUICK.filter((x) => x.id === "all" || staged.some(x.test)).map((x) => {
                const n = staged.filter(x.test).length;
                return <button key={x.id} type="button" aria-pressed={quick === x.id} onClick={() => narrow(() => setQuick(x.id))} className={`min-h-8 rounded-full border px-3 text-sm ${quick === x.id ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:text-foreground"}`}>{x.label}{x.id !== "all" && <span className="ml-1.5 text-xs opacity-80">{n}</span>}</button>;
              })}
              {filtered && <button type="button" onClick={clearFilters} className="ml-1 text-sm text-accent underline-offset-2 hover:underline">Clear filters</button>}
            </div>
          </div>
          {note && <p role="status" className="mb-3 rounded-xl bg-accent/5 p-3 text-sm">{note}</p>}
          {shown.length === 0 && <p role="status" className="rounded-[var(--radius-card)] bg-surface p-6 text-center text-sm text-muted">Nothing in the queue matches. <button type="button" onClick={clearFilters} className="text-accent underline underline-offset-2">Clear filters</button></p>}
          <ul className="space-y-2">
            {shown.map((r) => (
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
                      {!r.suggested && r.categoryId === "uncategorized" && !r.voucherBrandId && <Badge tone="warn">Needs a category</Badge>}
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
        <p className="text-muted">Nothing was added to your reports. Original lines stay in import history. This can&apos;t be undone.</p>
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
