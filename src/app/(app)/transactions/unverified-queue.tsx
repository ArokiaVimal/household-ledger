"use client";
import { ClipboardCheck, CreditCard, Landmark, QrCode, Receipt, Search, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TxnEditDialog, useRecordNav } from "@/components/txn-edit-dialog";
import { CompactRow } from "@/components/txn-compact";
import { HScroll } from "@/components/hscroll";
import { ChipFilter, filterAccounts } from "@/components/chip-filter";
import { CategoryGlyph } from "@/components/glyphs";
import { MerchantAvatar } from "@/components/txn-row";
import { NotesAi } from "./notes-ai";
import { undoImport } from "../import/undo";
import { AiBadge, AiFeatureCard, Badge, Button, ConfirmDialog, Dialog, EmptyState, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { isUpiPayment, sourceOf } from "@/domain/payment-mode";
import { signedSpend } from "@/domain/reports";
import type { ExpenseRecord } from "@/domain/types";
import { needsVoucherBrand } from "@/domain/vouchers";

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

const QUEUE = "/transactions?v=unverified";

/** Imported and captured rows that are not verified yet. They count in your totals; verifying one teaches the app. */
export function UnverifiedQueue({ month }: { month?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const imported = Number(params.get("imported") || 0);
  const skipped = Number(params.get("skipped") || 0);
  const batchId = params.get("batch") ?? "";
  const [undoOpen, setUndoOpen] = useState(false);
  const months = (params.get("months") ?? "").split(",").filter((m) => /^\d{4}-\d{2}$/.test(m)).map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { live, aiEnabled, staged: allStaged, categoryName, accountName, approveStaged, deleteRecords, accounts, categories } = useStore();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseRecord[] | null>(null);

  // Search and filters narrow what you see and what "Start verifying", "Select all" and the bulk actions work on.
  const [q, setQ] = useState("");
  const [acct, setAcct] = useState("");
  const [cat, setCat] = useState("");
  const [mon, setMon] = useState("");
  const [quick, setQuick] = useState<Quick>("all");
  const [mode, setMode] = useState("");
  const [source, setSource] = useState("");
  const [searching, setSearching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  // The ones that need you come first (duplicates, no category, AI unsure), then the AI guesses, then what the app remembered.
  const urgency = (r: ExpenseRecord) => (r.duplicateOf ? 0 : r.suggested === "ai_unsure" ? 1 : !r.suggested && r.categoryId === "uncategorized" && !r.voucherBrandId ? 2 : r.suggested === "ai" ? 3 : r.suggested === "memory" ? 4 : 3);
  // With a month, only that month's unverified rows; without one, all of them.
  const staged = useMemo(() => (month ? allStaged.filter((r) => r.date.startsWith(month)) : allStaged), [allStaged, month]);
  const shown = useMemo(() => staged.filter((r) =>
    (!acct || r.accountId === acct) && (!mode || isUpiPayment(r, accounts) === (mode === "upi")) && (!source || sourceOf(r, accounts) === source) && (!cat || r.categoryId === cat) && (!mon || r.date.startsWith(mon)) && QUICK.find((x) => x.id === quick)!.test(r) &&
    (!needle || `${r.merchant} ${r.originalDescription} ${r.notes ?? ""} ${formatINR(r.amountPaise)} ${(r.amountPaise / 100).toFixed(2)}`.toLowerCase().includes(needle)),
  ).sort((a, b) => urgency(a) - urgency(b) || b.date.localeCompare(a.date)), [staged, acct, cat, mon, quick, needle, mode, source, accounts]);
  const filtered = !!(needle || acct || cat || mon || mode || source || quick !== "all");
  const filterCount = [acct, cat, mon, mode, source, quick !== "all" ? quick : ""].filter(Boolean).length;
  const charged = shown.reduce((sum, r) => sum + signedSpend(r), 0);
  const monthsIn = [...new Set(staged.map((r) => r.date.slice(0, 7)))].sort().reverse();
  const clearFilters = () => { setQ(""); setAcct(""); setCat(""); setMon(""); setMode(""); setSource(""); setQuick("all"); setPicked(new Set()); };
  const narrow = (set: () => void) => { set(); setPicked(new Set()); };

  const view = useRecordNav(shown);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = shown.filter((r) => picked.has(r.id));
  // Rows the app is confident about: remembered from your own approvals, or Claude was sure. Possible duplicates always need you.
  const confident = shown.filter((r) => (r.suggested === "memory" || r.suggested === "ai") && !r.duplicateOf && !r.needsCard);
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

  // Right after an import the rows are still arriving from the server; do not flash "nothing waiting". Give up after a few seconds.
  const arriving = imported > 0 && allStaged.length === 0;
  useEffect(() => {
    if (!arriving) return;
    const t = setTimeout(() => router.replace(QUEUE), 8000);
    return () => clearTimeout(t);
  }, [arriving, router]);

  return (
    <>
      {imported > 0 && staged.length > 0 && (
        <div role="status" className="mb-3 rounded-2xl bg-good-soft p-3 text-sm text-good">
          <b>{imported}</b> transaction{imported === 1 ? "" : "s"} imported{months.length > 0 ? ` for ${months.join(" and ")}` : ""}{skipped > 0 ? `, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}. They already count in the month they were paid. Verify each one to confirm it and teach the app.
          {batchId && <button type="button" onClick={() => setUndoOpen(true)} className="ml-2 min-h-9 rounded-full px-1 font-medium text-danger underline underline-offset-2">Undo this import</button>}
        </div>
      )}
      <ConfirmDialog open={undoOpen} onClose={() => setUndoOpen(false)} title="Undo this import?" confirmLabel="Undo import" onConfirm={async () => {
        setUndoOpen(false); setBusy(true);
        const r = await undoImport(batchId);
        setBusy(false);
        if (!r.ok) { setNote(r.error); return; }
        router.replace("/import");
        router.refresh();
      }}>
        <p>This removes the {imported} transaction{imported === 1 ? "" : "s"} this import added, including any you have verified since. Your original file is not touched, and you can import it again.</p>
      </ConfirmDialog>
      {arriving ? (
        <p role="status" className="rounded-[var(--radius-card)] bg-surface p-6 text-sm text-muted">Loading your {imported} imported transaction{imported === 1 ? "" : "s"}…</p>
      ) : staged.length === 0 ? (
        <EmptyState title={month && allStaged.length > 0 ? "Nothing unverified this month" : "Everything is verified"} hint={month && allStaged.length > 0 ? `${allStaged.length} in other months. Tap the review icon at the top to see them.` : "New imports will show up here."} />
      ) : (
        <>
          {live && (
            <AiFeatureCard enabled={aiEnabled} title="AI-powered review assist" className="mb-3 hidden sm:block">
              <p>{aiEnabled ? "AI rows were categorized by Claude. Remembered rows match what you verified before. Verify the sure ones together and fix the rest." : "AI is off. Rows are filled from what you verified before."}</p>
            </AiFeatureCard>
          )}
          <HScroll className="mb-2 flex items-center gap-2 pb-0.5 sm:mb-3 sm:flex-wrap [&>*]:shrink-0">
            {filtered && <Badge tone="warn">{`${shown.length} of ${staged.length} shown`}</Badge>}
            {confident.length > 0 && <Button variant="primary" onClick={() => { setPicked(new Set(confident.map((r) => r.id))); setConfirm(true); }}><Sparkles size={15} aria-hidden />Verify {confident.length} sure ones</Button>}
            <Button onClick={() => shown[0] && view.open(shown[0])} variant={confident.length > 0 ? "ghost" : "primary"} disabled={shown.length === 0}><ClipboardCheck size={16} aria-hidden />Start verifying</Button>
            <Button disabled={shown.length === 0} onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)))}>{picked.size === shown.length && shown.length > 0 ? "Clear selection" : filtered ? `Select these ${shown.length}` : "Select all"}</Button>
            {live && fillable > 0 && <Button onClick={fillWithAi} disabled={busy}><Sparkles size={15} aria-hidden />{busy ? "Asking AI…" : `Fill in ${fillable} with AI`}<AiBadge>AI</AiBadge></Button>}
            {picked.size > 0 && <Button onClick={() => setConfirm(true)}>Verify {picked.size} as they are…</Button>}
            {picked.size > 0 && <Button variant="danger" onClick={() => setDeleting(chosen)}><Trash2 size={15} aria-hidden />Delete {picked.size}…</Button>}
          </HScroll>
          {/* The same bar as the All tab: the total, then search (opens when tapped), AI notes and filters. */}
          <div className="mb-3" role="search" aria-label="Search and filter unverified transactions">
            {searching || q ? (
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <Input autoFocus aria-label="Search unverified transactions" placeholder="Search merchant, text or amount" value={q} onChange={(e) => narrow(() => setQ(e.target.value))} className="pl-10" />
                </div>
                <button type="button" aria-label="Close search" onClick={() => { narrow(() => setQ("")); setSearching(false); }} className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted hover:bg-background"><X size={17} aria-hidden /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 px-1" aria-label="Total for this view">
                  <div className="num text-[22px] font-semibold leading-tight tracking-tight">{formatINR(charged)}</div>
                  <div className="text-xs leading-snug text-muted">{shown.length} unverified{filtered ? ` of ${staged.length}` : ""}</div>
                </div>
                <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground hover:bg-background"><Search size={17} aria-hidden /></button>
                <NotesAi />
                <button type="button" onClick={() => setFiltersOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ""}`} className="relative grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground hover:bg-background">
                  <SlidersHorizontal size={17} aria-hidden />
                  {filterCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-semibold text-white">{filterCount}</span>}
                </button>
              </div>
            )}
            {filterCount > 0 && (
              <HScroll className="mt-2 flex gap-1.5 text-xs [&>*]:shrink-0">
                {([[acct, accountName(acct), () => setAcct("")], [mode, mode === "upi" ? "UPI" : "Not UPI", () => setMode("")], [source, source === "card" ? "Credit card" : "Bank account", () => setSource("")], [cat, categoryName(cat), () => setCat("")], [mon, monthName(mon), () => setMon("")], [quick !== "all" ? quick : "", QUICK.find((x) => x.id === quick)?.label ?? "", () => setQuick("all")]] as [string, string, () => void][]).filter(([on]) => on).map(([, label, clear]) => (
                  <button key={label} type="button" onClick={() => narrow(clear)} aria-label={`Remove filter ${label}`} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1.5 font-medium text-accent hover:bg-accent/15">{label}<X size={12} aria-hidden /></button>
                ))}
                <button type="button" className="px-2 py-1.5 text-muted underline" onClick={clearFilters}>Clear all</button>
              </HScroll>
            )}
          </div>
          <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
            <div className="-mx-4 space-y-4 overflow-x-clip pb-3">
              <ChipFilter label="Needs you" value={quick === "all" ? "" : quick} onPick={(v) => narrow(() => setQuick((v || "all") as Quick))} options={QUICK.filter((x) => x.id !== "all" && staged.some(x.test)).map((x) => ({ id: x.id, label: `${x.label} · ${staged.filter(x.test).length}`, icon: <Sparkles size={15} aria-hidden /> }))} />
              <ChipFilter label="UPI" value={mode} onPick={(v) => narrow(() => setMode(v))} options={[{ id: "upi", label: "UPI", icon: <QrCode size={15} aria-hidden /> }, { id: "other", label: "Not UPI", icon: <Receipt size={15} aria-hidden /> }]} />
              <ChipFilter label="From" value={source} onPick={(v) => narrow(() => setSource(v))} options={[{ id: "bank", label: "Bank account", icon: <Landmark size={15} aria-hidden /> }, { id: "card", label: "Credit card", icon: <CreditCard size={15} aria-hidden /> }]} />
              <ChipFilter label="Paid with" value={acct} onPick={(v) => narrow(() => setAcct(v))} options={filterAccounts(accounts).map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={26} /> }))} />
              <ChipFilter label="Category" value={cat} onPick={(v) => narrow(() => setCat(v))} options={categories.map((c) => ({ id: c.id, label: c.name, icon: <CategoryGlyph name={c.name} icon={c.icon} size={26} /> }))} />
              {!month && <ChipFilter label="Month" value={mon} onPick={(v) => narrow(() => setMon(v))} options={monthsIn.map((m) => ({ id: m, label: monthName(m), icon: <Receipt size={15} aria-hidden /> }))} />}
            </div>
            <div className="sticky bottom-0 -mx-4 flex justify-between gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={clearFilters}>Reset</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show {shown.length}</Button></div>
          </Dialog>
          {note && <p role="status" className="mb-3 rounded-xl bg-accent/5 p-3 text-sm">{note}</p>}
          {shown.length === 0 && <p role="status" className="rounded-[var(--radius-card)] bg-surface p-6 text-center text-sm text-muted">Nothing in the queue matches. <button type="button" onClick={clearFilters} className="text-accent underline underline-offset-2">Clear filters</button></p>}
          <ul className="space-y-1.5">
            {shown.map((r) => (
              <li key={r.id}>
                <CompactRow r={r} showDate onOpen={() => view.open(r)} onVerify={() => approveStaged(r.id)} onDelete={() => setDeleting([r])}
                  leading={<input type="checkbox" aria-label={`Select ${r.merchant}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-4 shrink-0 accent-[var(--accent)]" />} />
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={deleting && deleting.length > 1 ? `Delete ${deleting.length} transactions?` : "Delete this transaction?"}
        onConfirm={() => { if (deleting) { deleteRecords(deleting.map((r) => r.id)); setPicked(new Set()); } }}>
        {deleting && deleting.length === 1 ? <p><strong>{deleting[0].merchant}</strong> · {deleting[0].date}</p> : <p>The {deleting?.length} selected rows will be deleted.</p>}
        <p className="text-muted">They stop counting in your totals. Original lines stay in import history. This can&apos;t be undone.</p>
      </ConfirmDialog>
      <TxnEditDialog record={view.record} onClose={view.close} nav={view.nav} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Verify ${picked.size} transactions?`}>
        <p className="text-sm">They will be marked Verified with the categories and splits shown, and the app learns from them.{flagged > 0 && ` ${flagged} of them are flagged as possible duplicates.`}</p>
        <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { chosen.filter((r) => !r.needsCard).forEach((r) => approveStaged(r.id)); setPicked(new Set()); setConfirm(false); }}>Verify {picked.size}</Button>
        </div>
      </Dialog>
    </>
  );
}
