"use client";
import { CheckCircle2, ChevronDown, ClipboardPaste, FileUp, Image as ImageIcon, Repeat, ShieldCheck, Sparkles, TriangleAlert, UploadCloud, XCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AiBadge, Badge, Button, ChipGroup, CompactChips, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { CategoryGlyph } from "@/components/glyphs";
import { MerchantAvatar } from "@/components/txn-row";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { Preview, PreviewRow } from "@/lib/import/service";
import { BusyOverlay, ErrorDialog } from "@/components/feedback";
import { useDropZone } from "@/components/drop-zone";
import { clearImportMarker, markImportStart } from "@/lib/import-marker";
import { undoImport } from "./undo";
import { ShotImport } from "./shot-import";

const MAX_BYTES = 4 * 1024 * 1024;
const kindLabel: Record<string, string> = { purchase: "Purchase", refund: "Refund", fee: "Fee", income: "Income", transfer: "Transfer", cc_payment: "Card bill" };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });

/** What is being read. Kept so a choice (payment method, sign, "yes read it again") can re-read the same input without a new upload. */
type Src = { kind: "file"; file: File; ai: boolean; accountId?: string } | { kind: "text"; text: string; mode: "table" | "ai"; accountId?: string };
type Extraction = { calls: number; inputTokens: number; outputTokens: number; error?: string };
type Decisions = Record<string, "import" | "skip">;
type Reply = {
  ok: boolean; error?: string; preview?: Preview; extraction?: Extraction;
  needAccount?: { reason: string; candidates: { id: string; name: string; score: number }[] };
  result?: { batchId?: string; counts: { staged: number; skipped: number; unreadable: number } };
};

function Entry({ icon: I, title, text, badge, primary, onDropFile, children }: { icon: LucideIcon; title: string; text: string; badge?: ReactNode; primary?: boolean; /** Drag and drop: called with the dropped file. */ onDropFile?: (f: File) => void; children: ReactNode }) {
  const { over, bind } = useDropZone((f) => onDropFile?.(f), !onDropFile);
  return (
    <section {...bind} className={`relative flex flex-col gap-2.5 rounded-[var(--radius-card)] p-4 transition-shadow md:p-5 ${over ? "ring-2 ring-accent" : ""} ${primary ? "bg-gradient-to-br from-accent/10 via-surface to-surface ring-1 ring-accent/25" : "bg-surface"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${primary ? "bg-accent text-white" : "bg-background text-accent"}`}><I size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          <p className="text-sm text-muted">{text}</p>
        </div>
        {badge}
      </div>
      <div className="mt-auto">{children}</div>
      {onDropFile && <p className="hidden text-[11px] text-muted md:block">or drop a file here</p>}
      {over && <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-accent/10 text-sm font-semibold text-accent">Drop to use this</div>}
    </section>
  );
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function LiveImport() {
  const { accounts, accountName, categoryName, importBatches, aiEnabled } = useStore();
  const router = useRouter();
  const usable = accounts.filter((a) => a.type !== "cash" && !a.archived);
  const [shotOpen, setShotOpen] = useState(false);
  const [shotFile, setShotFile] = useState<File | null>(null);
  const [src, setSrc] = useState<Src | null>(null);
  const [sign, setSign] = useState<"auto" | "out" | "in">("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [need, setNeed] = useState<Reply["needAccount"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"read" | "save" | "undo">("read");
  const [rowFilter, setRowFilter] = useState<"all" | "out" | "in">("all");
  const [undoing, setUndoing] = useState<{ id: string; filename: string; rows: number } | null>(null);
  const [accept, setAccept] = useState(false);
  const [reimportOk, setReimportOk] = useState(false); // the owner said yes to reading a file that was imported before
  const [decisions, setDecisions] = useState<Decisions>({});
  const [changing, setChanging] = useState(false);
  const [trackBill, setTrackBill] = useState(true);
  const [billDue, setBillDue] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAccount, setManualAccount] = useState(usable[0]?.id ?? "");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const aiInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const manualDrop = useDropZone((f) => setManualFile(f));

  const send = async (s: Src, mode: "preview" | "commit", signOverride = sign): Promise<Reply> => {
    const flip = signOverride === "auto" ? undefined : signOverride === "out";
    const chosen = mode === "commit" && Object.keys(decisions).length > 0 ? decisions : undefined;
    try {
      let res: Response;
      if (s.kind === "file") {
        const form = new FormData();
        form.set("file", s.file);
        form.set("mode", mode);
        if (s.accountId) form.set("accountId", s.accountId);
        if (s.ai) form.set("ai", "1");
        if (flip !== undefined) form.set("positiveIsDebit", String(flip));
        if (mode === "commit" && accept) form.set("acceptMismatch", "1");
        if (mode === "commit" && reimportOk) form.set("reimport", "1");
        if (chosen) form.set("decisions", JSON.stringify(chosen));
        if (mode === "commit" && trackBill && billDue) form.set("cardDueDate", billDue);
        res = await fetch("/api/import", { method: "POST", body: form, signal: AbortSignal.timeout(100_000) });
      } else {
        res = await fetch("/api/import/text", {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(100_000),
          body: JSON.stringify({ text: s.text, mode: s.mode, ai: s.mode === "ai", accountId: s.accountId, action: mode, reimport: mode === "commit" && reimportOk, positiveIsDebit: flip, decisions: chosen }),
        });
      }
      // Whatever comes back is checked, so a stalled, cut-off or odd answer is always reported instead of silently doing nothing.
      if (res.redirected && /\/login/.test(res.url)) return { ok: false, error: "Your sign-in has ended. Sign in again, then try the import again. Nothing was saved." };
      let data: Reply | null = null;
      try { data = (await res.json()) as Reply; } catch { /* not JSON */ }
      if (!data) return { ok: false, error: [502, 504, 408].includes(res.status) ? `The server took too long, so the ${mode === "commit" ? "save" : "read"} was stopped. ${mode === "commit" ? "Check Earlier imports before trying again, in case part of it went through." : "Nothing was saved. Try again; if it keeps happening, use a shorter date range."}` : `The server sent back something unexpected (${res.status}). ${mode === "commit" ? "Check Earlier imports before trying again." : "Nothing was saved. Try again."}` };
      if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong." };
      if (mode === "preview" && !data.preview && !data.needAccount) return { ok: false, error: "The server answered but sent nothing to show. Nothing was saved. Try again." };
      if (mode === "commit" && !data.result) return { ok: false, error: "The server did not confirm the import. Check Earlier imports before trying again." };
      return { ...data, ok: true };
    } catch (e) {
      if ((e as Error).name === "TimeoutError") return { ok: false, error: mode === "commit" ? "This is taking too long, so I stopped waiting. The import may still have finished: check Earlier imports before trying again." : "This is taking too long, so I stopped waiting. Nothing was saved. Try again." };
      return { ok: false, error: "Network problem. Nothing was saved. Try again." };
    }
  };

  const reset = () => { setPreview(null); setNeed(null); setError(null); setDone(null); setSign("auto"); setAccept(false); setReimportOk(false); setExtraction(null); setDecisions({}); setChanging(false); };

  const read = async (s: Src, signOverride = sign) => {
    setSrc(s); setPhase("read"); setBusy(true); setError(null); markImportStart(s.kind === "file" ? s.file.name : "Pasted text", "read"); setDone(null); setNeed(null); setDecisions({}); setChanging(false);
    const r = await send(s, "preview", signOverride);
    clearImportMarker();
    setBusy(false);
    setExtraction(r.extraction ?? null);
    if (!r.ok) { setPreview(null); return setError(r.error ?? "Could not read that."); }
    setAccept(false);
    if (r.needAccount) { setPreview(null); return setNeed(r.needAccount); }
    setPreview(r.preview ?? null);
    setTrackBill(true);
    setBillDue(r.preview?.statementBill?.dueDate ?? "");
  };

  const pickFile = (f: File | undefined, ai: boolean, accountId?: string) => {
    reset();
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("That file is larger than 4 MB. Export a shorter date range.");
    if (!/\.(csv|txt|xlsx|pdf)$/i.test(f.name)) return setError("Upload a .csv, .xlsx or .pdf statement.");
    void read({ kind: "file", file: f, ai, accountId });
  };

  // Rows to add, with your decisions applied. Months come from each row's own date, so a statement that spans two months
  // lands in both.
  const action = (r: PreviewRow) => decisions[String(r.line)] ?? r.action;
  const adding = useMemo(() => (preview ? preview.rows.filter((r) => (decisions[String(r.line)] ?? r.action) === "import") : []), [preview, decisions]);
  const months = useMemo(() => {
    const m = new Map<string, { count: number; out: number }>();
    for (const r of adding) { const k = r.date.slice(0, 7); const cur = m.get(k) ?? { count: 0, out: 0 }; cur.count++; if (r.direction === "debit") cur.out += r.amountPaise; m.set(k, cur); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [adding]);
  const lookalikes = preview ? preview.rows.filter((r) => r.status !== "new") : [];
  const toStage = adding.length;

  const runUndo = async (u: { id: string; filename: string }) => {
    setPhase("undo"); setBusy(true); setError(null);
    const r = await undoImport(u.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(`Undid “${u.filename}”. The transactions it added were removed.`);
    router.refresh();
  };

  const commit = async () => {
    if (!src) return;
    setPhase("save"); setBusy(true); setError(null); markImportStart(src.kind === "file" ? src.file.name : "Pasted text", "save");
    const monthsParam = months.map(([m]) => m).join(",");
    const r = await send(src, "commit");
    clearImportMarker();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not save the import.");
    const c = r.result!.counts;
    setDone(`${c.staged} transaction${c.staged === 1 ? "" : "s"} added as unverified.`);
    setPreview(null); setSrc(null);
    if (aiInput.current) aiInput.current.value = "";
    router.refresh();
    // Straight to the review queue: that is the next thing to do. The queue shows a short confirmation.
    if (c.staged > 0) router.push(`/transactions?v=unverified&scope=all&imported=${c.staged}&skipped=${c.skipped}&months=${monthsParam}${r.result!.batchId ? `&batch=${r.result!.batchId}` : ""}`);
  };

  const failed = preview ? preview.checks.filter((c) => !c.ok) : [];
  const blocked = failed.length > 0 && !accept;
  // The same file again: ask first. Nothing is shown or saved until the owner answers.
  const askReimport = !!preview?.previousImport && !reimportOk;
  // Note: the dialog also reports "closed" when it is closed on purpose after a Yes, so cancelling only counts while the question is open.
  const cancelReimport = () => { setPreview(null); setSrc(null); setReimportOk(false); if (aiInput.current) aiInput.current.value = ""; };
  const setAll = (to: "import" | "skip") => setDecisions(Object.fromEntries(lookalikes.map((r) => [String(r.line), to])));

  return (
    <>
      <ShotImport open={shotOpen} onClose={() => { setShotOpen(false); setShotFile(null); }} aiEnabled={aiEnabled} initialFile={shotFile} />
      {/* Slow work is always announced, and a problem always pops up where you are looking, not somewhere down the page. */}
      <BusyOverlay open={busy}
        title={phase === "undo" ? "Undoing the import…" : phase === "save" ? "Saving to your review queue…" : preview ? "Asking AI about new merchants…" : (src?.kind === "file" && src.ai) || (src?.kind === "text" && src.mode === "ai") ? "Reading your statement with AI…" : "Reading your statement…"}
        detail={phase === "undo" ? "Removing the transactions it added. This only takes a moment." : phase === "save" ? "Adding the transactions. This only takes a moment." : preview ? "Only merchant names are sent. This can take a few seconds." : (src?.kind === "file" && src.ai) || (src?.kind === "text" && src.mode === "ai") ? "Claude is finding every transaction and checking each one against the text. A long statement can take up to a minute." : "Checking every row against the statement's own totals."} />
      <ConfirmDialog open={!!undoing} onClose={() => setUndoing(null)} title="Undo this import?" confirmLabel="Undo import" onConfirm={() => { const u = undoing; setUndoing(null); if (u) void runUndo(u); }}>
        <p>This removes the {undoing?.rows} transaction{undoing?.rows === 1 ? "" : "s"} “{undoing?.filename}” added, including any you have verified since. Your original file is not touched, and you can import it again.</p>
        <p className="mt-2 text-muted">If something from it was already settled with someone, you will be asked to void that first.</p>
      </ConfirmDialog>
      <ErrorDialog message={error} onClose={() => setError(null)} />
      <PageHeader title="Import" sub="Bring in a statement or a note. Everything arrives unverified for you to check." />
      {usable.length === 0 ? (
        <EmptyState title="Add a payment method first" hint="Open Settings and add the card or account this belongs to." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Entry icon={Sparkles} primary title="Import with AI" onDropFile={(f) => pickFile(f, true)} text="Drop in any statement. We find the bank or card for you." badge={<Badge tone={aiEnabled ? "good" : "neutral"}>{aiEnabled ? "On" : "Off"}</Badge>}>
              <input ref={aiInput} type="file" accept=".csv,.txt,.xlsx,.pdf" className="sr-only" aria-label="Choose statement file for AI import" onChange={(e) => { pickFile(e.target.files?.[0], true); e.target.value = ""; }} />
              <Button variant="primary" disabled={busy} onClick={() => aiInput.current?.click()}><UploadCloud size={16} aria-hidden />{busy && src?.kind === "file" && src.ai ? "Reading…" : "Choose statement"}</Button>
            </Entry>
            <Entry icon={FileUp} title="Choose bank, then file" onDropFile={(f) => { setManualFile(f); setManualOpen(true); }} text="You pick the payment method, we read the file. No AI involved.">
              <Button disabled={busy} onClick={() => { setManualFile(null); setManualOpen(true); }}>Choose method and file</Button>
            </Entry>
            <Entry icon={ClipboardPaste} title="Paste or describe" onDropFile={(f) => { if (!/\.(txt|csv)$/i.test(f.name) || f.size > 200_000) { setError("Drop a small .txt or .csv file to paste its text, or use the other options for statements."); return; } void f.text().then((t) => { setPasteText(t.slice(0, 100000)); setPasteOpen(true); }); }} text="Paste rows from your bank app, or just write it in your own words.">
              <Button disabled={busy} onClick={() => setPasteOpen(true)}>Paste or type</Button>
            </Entry>
            <Entry icon={ImageIcon} title="Read a screenshot" onDropFile={aiEnabled ? (f) => { setShotFile(f); setShotOpen(true); } : undefined} text="Orders or payments from an app. We match them to what you have." badge={<Badge tone={aiEnabled ? "good" : "neutral"}>{aiEnabled ? "AI" : "Off"}</Badge>}>
              <Button disabled={busy || !aiEnabled} onClick={() => setShotOpen(true)}>Choose screenshot</Button>
            </Entry>
          </div>
          <details className="group rounded-xl text-sm text-muted">
            <summary className="flex cursor-pointer items-center gap-1.5 hover:text-foreground"><ChevronDown size={14} aria-hidden className="-rotate-90 group-open:rotate-0" />How AI is used here</summary>
            <ul className="mt-2 list-disc space-y-1 pl-9">
              <li>{aiEnabled ? "AI only runs when you click an AI button." : "AI is off on this server. Everything else works without it."}</li>
              <li>Claude sees text only when the app can&apos;t read the file, or when you paste free text.</li>
              <li>Account numbers, emails and phone numbers are hidden first. Your name and the file are never sent.</li>
              <li>You review every row before it counts.</li>
            </ul>
          </details>

          {done && (
            <div className="space-y-2">
              {done && <p role="status" className="rounded-xl bg-good-soft p-3 text-sm text-good">{done} <Link href="/transactions?v=unverified&scope=all" className="font-medium underline">See them now</Link></p>}
            </div>
          )}

          <Dialog open={!!need && !!src} onClose={() => { setNeed(null); setSrc(null); }} title="Which payment method is this?">
            {need && src && (
            <div className="space-y-3 pb-1">
              <p className="text-sm text-muted">{need.reason}. Pick one and it will be read straight away.</p>
              <CompactChips label="Payment method" options={[...usable].sort((x, y) => (need.candidates.find((c) => c.id === y.id)?.score ?? 0) - (need.candidates.find((c) => c.id === x.id)?.score ?? 0)).map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[]} onPick={(id) => void read({ ...src, accountId: id })} />
            </div>
            )}
          </Dialog>

          {/* The result of reading comes to the front as a pop-up, so it is never hidden below the options. */}
          <Dialog open={!!preview && !askReimport} onClose={cancelReimport} title={preview?.format === "text" ? "Here is what we read" : "Here is what we found"}>
            {preview && (
            <div className="space-y-5 pb-1">
              <section aria-label="Summary" className="space-y-3 rounded-3xl bg-gradient-to-br from-accent/10 via-surface to-surface p-4 ring-1 ring-accent/15">
                <div className="flex items-center gap-3">
                  <MerchantAvatar name={accountName(preview.accountId)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold leading-tight">{accountName(preview.accountId)}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{preview.detected?.chosen ? "You chose this" : preview.detected ? "Picked automatically" : ""}</span>
                      {preview.readBy === "ai" && <AiBadge tone="unsure" title="Claude read these rows. Check each amount.">Read by AI</AiBadge>}
                    </div>
                  </div>
                  {src && <button type="button" onClick={() => setChanging(!changing)} className="min-h-9 shrink-0 rounded-full bg-surface px-3 text-xs font-medium text-accent ring-1 ring-border hover:bg-background">{changing ? "Done" : "Change"}</button>}
                </div>
                {changing && src && <CompactChips label="Change payment method" options={usable.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[preview.accountId]} onPick={(id) => { if (id !== preview.accountId) void read({ ...src, accountId: id }); }} />}
                <div>
                  <div className="num text-4xl font-semibold leading-none tracking-tight">{toStage}<span className="ml-2 text-base font-normal text-muted">to add</span></div>
                  <div className="num mt-1 text-sm text-muted">{formatINR(preview.totals.debitPaise)} out · {formatINR(preview.totals.creditPaise)} in</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2.5 py-1 text-good"><CheckCircle2 size={13} aria-hidden />{toStage} ready</span>
                  {lookalikes.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-warn"><TriangleAlert size={13} aria-hidden />{lookalikes.length} to check</span>}
                  {preview.counts.unreadable > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-danger"><XCircle size={13} aria-hidden />{preview.counts.unreadable} unreadable</span>}
                </div>
              </section>

              {preview.checks.length > 0 && failed.length === 0 && (
                <p className="flex items-center gap-2 rounded-2xl bg-good-soft px-3 py-2.5 text-sm text-good"><ShieldCheck size={17} aria-hidden className="shrink-0" />Adds up to the statement&apos;s own totals.</p>
              )}

              {months.length > 0 && (
                <section aria-label="Where it goes" className="space-y-2.5">
                  <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Goes into</h3>
                  <ul className="space-y-2.5 rounded-2xl bg-background p-3">
                    {months.map(([m, v]) => (
                      <li key={m}>
                        <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{monthLabel(m)}</span><span className="num text-xs text-muted">{v.count} transaction{v.count === 1 ? "" : "s"} · {formatINR(v.out)} out</span></div>
                        <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.round((v.out / Math.max(1, ...months.map(([, x]) => x.out))) * 100))}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                  <p className="px-1 text-xs text-muted">Each transaction counts in the month it was paid, not the month you import it.</p>
                </section>
              )}

              {adding.some((r) => r.recurring) && (
                <p className="flex items-start gap-2 rounded-2xl bg-accent/5 px-3 py-2.5 text-sm"><Repeat size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" /><span><b>{adding.filter((r) => r.recurring).length}</b> look like monthly payments (EMI, rent, premium). While you review them, each can be added to Recurring with a tap.</span></p>
              )}
              {lookalikes.length > 0 && (
                <section className="space-y-3 rounded-3xl bg-warn-soft/60 p-3.5 ring-1 ring-warn/20" role="group" aria-label="Entries you may already have">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <TriangleAlert size={17} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                      <div>
                        <h3 className="text-sm font-semibold leading-tight">{lookalikes.length} look{lookalikes.length === 1 ? "s" : ""} like entries you already have</h3>
                        <p className="text-xs text-muted">Nothing is skipped on its own. These are added and flagged, so you can compare them later. Skip any you do not want.</p>
                      </div>
                    </div>
                    <div className="flex gap-2"><Button className="min-h-9" onClick={() => setAll("skip")}>Skip all</Button><Button className="min-h-9" onClick={() => setAll("import")}>Add all anyway</Button></div>
                  </div>
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                    {lookalikes.slice(0, 50).map((r) => (
                      <li key={r.line} className="space-y-2 p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.merchant} <span className="num font-normal text-muted">· {r.date} · {formatINR(r.amountPaise)}</span></div>
                            <div className="text-xs text-muted">{r.status === "duplicate" ? "Exact repeat of" : "Looks like"} {r.match ? `${r.match.merchant} on ${r.match.date} (${r.match.reviewed ? "approved" : "waiting in review"})` : "another line in this file"}</div>
                          </div>
                          <div role="radiogroup" aria-label={`What to do with ${r.merchant}`} className="flex shrink-0 rounded-full bg-border/60 p-0.5 text-xs">
                            {([["skip", "Skip"], ["import", "Add"]] as const).map(([id, label]) => (
                              <button key={id} type="button" role="radio" aria-checked={action(r) === id} onClick={() => setDecisions({ ...decisions, [String(r.line)]: id })} className={`min-h-8 whitespace-nowrap rounded-full px-3.5 font-medium transition-colors ${action(r) === id ? (id === "import" ? "bg-accent text-white shadow-sm" : "bg-surface text-foreground shadow-sm") : "text-muted"}`}>{label}</button>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {lookalikes.length > 50 && <p className="text-xs text-muted">Showing the first 50. “Skip all” and “Add all anyway” apply to all {lookalikes.length}.</p>}
                </section>
              )}

              {!!preview.statementBill && accounts.find((a) => a.id === preview.accountId)?.type === "credit_card" && (
                <div className="space-y-2 rounded-xl bg-accent/5 p-4 text-sm" role="group" aria-label="Card bill">
                  <label className="flex items-start gap-2"><input type="checkbox" checked={trackBill} onChange={(e) => setTrackBill(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" /><span><b>Track this bill under Card bills.</b> Full amount due <b className="num">{formatINR(preview.statementBill.totalDuePaise)}</b>{preview.readBy === "ai" ? " (read by AI, check it)" : ""}.</span></label>
                  {trackBill && (
                    <label className="flex flex-wrap items-center gap-2 pl-6"><span className="text-muted">Payment due date</span><input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} aria-label="Payment due date" className="min-h-9 rounded-full border border-border bg-surface px-3" />{!billDue && <span className="text-xs text-warn">Add the date printed on the statement to track it.</span>}</label>
                  )}
                </div>
              )}
              {preview.checks.length > 0 && (
                failed.length > 0 ? (
                  <div role="group" aria-label="Checks against the statement's own totals" className="rounded-xl bg-danger/10 p-3 text-sm">
                    <div className="mb-2 font-medium text-danger">Some checks failed. Do not import until you have looked at the differences.</div>
                    <ul className="space-y-1">{preview.checks.map((c) => (
                      <li key={c.name} className="flex items-start gap-2">{c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-label="Passed" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Failed" />}<span><b>{c.name}.</b> <span className="text-muted">{c.detail}</span></span></li>
                    ))}</ul>
                    <label className="mt-3 flex items-start gap-2 border-t border-danger/20 pt-3"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" /><span>I have checked the differences and want to import anyway. This will be recorded in the audit trail.</span></label>
                  </div>
                ) : null
              )}
              {preview.warnings.length > 0 && <ul className="space-y-1 rounded-xl bg-warn-soft p-3 text-sm text-warn">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              {preview.unverified.length > 0 && (
                <details className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <summary className="cursor-pointer font-medium">{preview.unverified.length} line{preview.unverified.length === 1 ? "" : "s"} Claude offered could not be found in the text and were left out</summary>
                  <ul className="mt-2 space-y-1 text-xs">{preview.unverified.slice(0, 20).map((u) => <li key={u}>{u}</li>)}</ul>
                </details>
              )}
              {preview.singleAmountColumn && (
                <div className="space-y-1.5 rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <div>This file has one Amount column. A positive amount currently means <b>{preview.positiveIsDebit ? "money out" : "money in"}</b>. If purchases look like refunds, switch it.</div>
                  <ChipGroup label="Sign of amounts" value={preview.positiveIsDebit ? "out" : "in"} options={[{ id: "out", label: "Positive = money out" }, { id: "in", label: "Positive = money in" }]} onChange={(v) => { setSign(v); if (src) void read(src, v); }} />
                </div>
              )}

              <details className="group rounded-xl text-sm">
                <summary className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-foreground"><ChevronDown size={14} aria-hidden className="-rotate-90 group-open:rotate-0" />See all {preview.rows.length} rows and how they were read</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="num text-xs text-muted">Out <b className="text-foreground">{formatINR(preview.totals.debitPaise)}</b> ({preview.totals.debitCount}) · In <b className="text-foreground">{formatINR(preview.totals.creditPaise)}</b> ({preview.totals.creditCount})</p>
                    <div role="radiogroup" aria-label="Show rows" className="flex rounded-full bg-border/60 p-0.5 text-xs">
                      {([["all", "All"], ["out", "Out"], ["in", "In"]] as const).map(([id, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={rowFilter === id} onClick={() => setRowFilter(id)} className={`min-h-8 rounded-full px-3 font-medium ${rowFilter === id ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-background">
                    {preview.rows.filter((r) => rowFilter === "all" || (rowFilter === "out" ? r.direction === "debit" : r.direction === "credit")).slice(0, 100).map((r) => (
                      <li key={r.line} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${action(r) === "skip" ? "opacity-50" : ""}`}>
                        <MerchantAvatar name={r.merchant} size={34} fallback={<CategoryGlyph name={categoryName(r.categoryId)} size={34} />} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium leading-tight">{r.merchant}</div>
                          <div className="truncate text-[11px] text-muted">{shortDate(r.date)} · {kindLabel[r.kind]}{r.categoryId !== "uncategorized" ? ` · ${categoryName(r.categoryId)}` : ""}{r.accountId !== preview.accountId ? ` · via ${accountName(r.accountId)}` : ""}</div>
                          {(r.recurring && action(r) === "import") || action(r) === "skip" || (r.status !== "new" && action(r) === "import") ? (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {r.recurring && action(r) === "import" && <Badge tone="good">Looks monthly</Badge>}
                              {action(r) === "skip" && <Badge tone="bad">Skipped</Badge>}
                              {r.status !== "new" && action(r) === "import" && <Badge tone="warn">{r.status === "duplicate" ? "Exact repeat" : "Possible duplicate"}</Badge>}
                            </div>
                          ) : null}
                        </div>
                        <span className={`num shrink-0 text-sm font-semibold ${r.direction === "credit" ? "text-good" : ""}`}>{r.direction === "credit" ? "+" : ""}{formatINR(r.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                  {preview.rows.length > 100 && <p className="text-xs text-muted">Showing the first 100 of {preview.rows.length}. All of them are used.</p>}
                  {preview.smart && (
                    <p className="text-xs text-muted">
                      {preview.smart.fromMemory} filled in from what you verified before, {preview.smart.fromAi} suggested by AI, {preview.smart.needYou} need your category.
                      {preview.smart.ai.calls > 0 && ` Claude looked at ${preview.smart.ai.asked} new merchant${preview.smart.ai.asked === 1 ? "" : "s"}.`}
                      {extraction && extraction.calls > 0 && ` Claude also read the text itself (${(extraction.inputTokens + extraction.outputTokens).toLocaleString("en-IN")} tokens).`}
                      {preview.smart.ai.error && ` ${preview.smart.ai.error}, so the rest were left for you.`}
                    </p>
                  )}
                  {preview.smart && aiEnabled && (preview.smart.needYou > 0 || preview.smart.ai.error) && src && (
                    <Button disabled={busy} onClick={() => void read(src)}><Sparkles size={15} aria-hidden />{busy ? "Asking AI…" : "Refresh with AI"}<AiBadge>AI</AiBadge></Button>
                  )}
                  {preview.skipped.length > 0 && (
                    <div className="rounded-xl bg-danger/5 p-3 text-sm">
                      <div className="font-medium text-danger">{preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} could not be read</div>
                      <ul className="mt-2 space-y-1 text-xs text-muted">{preview.skipped.slice(0, 30).map((s) => <li key={s.line}>Line {s.line}: {s.reason} — {s.text}</li>)}</ul>
                      <p className="mt-2 text-xs">These are not imported. Add them with the Add button if they matter.</p>
                    </div>
                  )}
                </div>
              </details>

              <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
                <Button variant="primary" className="min-h-11 flex-1 px-5" disabled={busy || toStage === 0 || blocked} onClick={commit}>{busy ? "Saving…" : `Send ${toStage} to review`}</Button>
                <Button onClick={cancelReimport}>Cancel</Button>
                {blocked && <span className="text-xs text-muted">Tick the box above to import despite the failed check.</span>}
              </div>
            </div>
            )}
          </Dialog>

          <section aria-label="Import history" className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted">Earlier imports</h2>
            {importBatches.length === 0 ? <p className="px-1 text-sm text-muted">Nothing imported yet.</p> : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {importBatches.slice(0, 9).map((b) => (
                  <li key={b.id} className="rounded-xl bg-surface p-3 text-sm">
                    <div className="truncate font-medium">{b.filename}</div>
                    <div className="text-xs text-muted">{accountName(b.accountId)} · {b.uploadedAt.slice(0, 10)}{b.readBy === "ai" ? " · read by AI" : ""}</div>
                    <div className="mt-1 text-xs text-muted">{b.rolledBackAt ? "Undone" : `${b.counts.staged} added as unverified`}{b.counts.skippedDuplicate ? ` · ${b.counts.skippedDuplicate} skipped` : ""}{b.reimportOf ? " · read again" : ""}</div>
                    {!b.rolledBackAt && b.counts.staged > 0 && <button type="button" onClick={() => setUndoing({ id: b.id, filename: b.filename, rows: b.counts.staged })} className="mt-1.5 min-h-9 rounded-full px-1 text-xs font-medium text-danger hover:underline">Undo this import</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} title="Choose bank, then file">
        <div className="space-y-4 pb-1 text-sm">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Which bank or payment method is this statement from?</div>
            <CompactChips label="Payment method" options={usable.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[manualAccount]} onPick={setManualAccount} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Statement file</div>
            <input ref={manualInput} type="file" accept=".csv,.txt,.xlsx,.pdf" className="sr-only" aria-label="Choose statement file" onChange={(e) => setManualFile(e.target.files?.[0] ?? null)} />
            <div {...manualDrop.bind} className={`flex flex-wrap items-center gap-2 rounded-2xl border border-dashed p-3 transition-colors ${manualDrop.over ? "border-accent bg-accent/10" : "border-border"}`}>
              <Button onClick={() => manualInput.current?.click()}><FileUp size={16} aria-hidden />{manualFile ? "Change file" : "Choose .csv, .xlsx or .pdf"}</Button>
              {!manualFile && <span className="text-xs text-muted">or drop it here</span>}
              {manualFile && <span className="text-muted">{manualFile.name} · {(manualFile.size / 1024).toFixed(0)} KB</span>}
            </div>
          </div>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!manualFile || !manualAccount} onClick={() => { const f = manualFile; setManualOpen(false); pickFile(f ?? undefined, false, manualAccount); }}>Read statement</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste or describe transactions">
        <div className="space-y-3 pb-1 text-sm">
          <textarea aria-label="Transactions to import" value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8} maxLength={100000}
            placeholder={"Paste rows from a statement or app (include the header line), or write it:\npaid 450 at Swiggy yesterday via GPay\nrent 25000 on the 1st from HDFC"}
            className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
          <p className="text-xs text-muted">Tables with a header (Date, Description, Amount) are read without AI. Free text goes to Claude, with long numbers hidden.</p>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button disabled={!pasteText.trim()} onClick={() => { setPasteOpen(false); reset(); void read({ kind: "text", text: pasteText, mode: "table" }); }}>Read as table</Button>
            <Button variant="primary" disabled={!pasteText.trim() || !aiEnabled} title={aiEnabled ? undefined : "AI is off: no API key on the server"} onClick={() => { setPasteOpen(false); reset(); void read({ kind: "text", text: pasteText, mode: "ai" }); }}>{aiEnabled ? "Read with AI" : "Read with AI (off)"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={askReimport} onClose={() => { if (askReimport) cancelReimport(); }} title="Read this file again?">
        {preview?.previousImport && (
          <div className="space-y-3 pb-1 text-sm">
            <p>You already imported this exact file on <b>{preview.previousImport.uploadedAt.slice(0, 10)}</b> (&ldquo;{preview.previousImport.filename}&rdquo;, {preview.previousImport.staged} transaction{preview.previousImport.staged === 1 ? "" : "s"} added as unverified).</p>
            {toStage > 0 ? (
              <ul className="space-y-1.5 rounded-xl bg-background p-3">
                <li><b className="num">{toStage}</b> of its {preview.counts.rows} rows are not in your transactions right now (for example ones you rejected or removed). They will come back for review.</li>
                <li><b className="num">{lookalikes.length}</b> {lookalikes.length === 1 ? "is" : "are"} already there and will be skipped unless you choose otherwise, so nothing is counted twice.</li>
              </ul>
            ) : (
              <p className="rounded-xl bg-good-soft p-3 text-good">Every row in it is already in your transactions, so reading it again would add nothing.</p>
            )}
            <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
              <Button onClick={cancelReimport}>{toStage > 0 ? "No, cancel" : "Close"}</Button>
              {toStage > 0 && <Button variant="primary" onClick={() => setReimportOk(true)}>Yes, read it again</Button>}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
