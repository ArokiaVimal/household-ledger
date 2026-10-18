"use client";
import { CheckCircle2, ClipboardPaste, FileUp, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AiBadge, AiFeatureCard, Badge, Button, Card, CardTitle, ChipGroup, CompactChips, Dialog, EmptyState, PageHeader } from "@/components/ui";
import { MerchantAvatar } from "@/components/txn-row";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { Preview } from "@/lib/import/service";

const MAX_BYTES = 4 * 1024 * 1024;
const kindLabel: Record<string, string> = { purchase: "Purchase", refund: "Refund", fee: "Fee", income: "Income", transfer: "Transfer", cc_payment: "Card bill" };

/** What is being read. Kept so a choice (payment method, sign, "yes read it again") can re-read the same input without a new upload. */
type Src = { kind: "file"; file: File; ai: boolean; accountId?: string } | { kind: "text"; text: string; mode: "table" | "ai"; accountId?: string };
type Extraction = { calls: number; inputTokens: number; outputTokens: number; error?: string };
type Reply = {
  ok: boolean; error?: string; preview?: Preview; extraction?: Extraction;
  needAccount?: { reason: string; candidates: { id: string; name: string; score: number }[] };
  result?: { counts: { staged: number; duplicate: number; possible: number; unreadable: number } };
};

export function LiveImport() {
  const { accounts, accountName, categoryName, importBatches, aiEnabled } = useStore();
  const router = useRouter();
  const usable = accounts.filter((a) => a.type !== "cash");
  const [src, setSrc] = useState<Src | null>(null);
  const [sign, setSign] = useState<"auto" | "out" | "in">("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [need, setNeed] = useState<Reply["needAccount"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState(false);
  const [reimportOk, setReimportOk] = useState(false); // the owner said yes to reading a file that was imported before
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAccount, setManualAccount] = useState(usable[0]?.id ?? "");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const aiInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);

  const send = async (s: Src, mode: "preview" | "commit", signOverride = sign): Promise<Reply> => {
    const flip = signOverride === "auto" ? undefined : signOverride === "out";
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
        res = await fetch("/api/import", { method: "POST", body: form });
      } else {
        res = await fetch("/api/import/text", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: s.text, mode: s.mode, ai: s.mode === "ai", accountId: s.accountId, action: mode, reimport: mode === "commit" && reimportOk, positiveIsDebit: flip }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as Reply;
      return res.ok ? { ...data, ok: true } : { ok: false, error: data.error ?? "Something went wrong." };
    } catch {
      return { ok: false, error: "Network problem. Try again." };
    }
  };

  const reset = () => { setPreview(null); setNeed(null); setError(null); setDone(null); setSign("auto"); setAccept(false); setReimportOk(false); setExtraction(null); };

  const read = async (s: Src, signOverride = sign) => {
    setSrc(s); setBusy(true); setError(null); setDone(null); setNeed(null);
    const r = await send(s, "preview", signOverride);
    setBusy(false);
    setExtraction(r.extraction ?? null);
    if (!r.ok) { setPreview(null); return setError(r.error ?? "Could not read that."); }
    setAccept(false);
    if (r.needAccount) { setPreview(null); return setNeed(r.needAccount); }
    setPreview(r.preview ?? null);
  };

  const pickFile = (f: File | undefined, ai: boolean, accountId?: string) => {
    reset();
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("That file is larger than 4 MB. Export a shorter date range.");
    if (!/\.(csv|txt|xlsx|pdf)$/i.test(f.name)) return setError("Upload a .csv, .xlsx or .pdf statement.");
    void read({ kind: "file", file: f, ai, accountId });
  };

  const commit = async () => {
    if (!src) return;
    setBusy(true); setError(null);
    const r = await send(src, "commit");
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not save the import.");
    const c = r.result!.counts;
    setDone(`${c.staged} transaction${c.staged === 1 ? "" : "s"} sent to the review queue. ${c.duplicate} duplicate${c.duplicate === 1 ? "" : "s"} skipped.`);
    setPreview(null); setSrc(null);
    if (aiInput.current) aiInput.current.value = "";
    router.refresh();
    // Straight to the review queue: that is the next thing to do. The queue shows a short confirmation.
    if (c.staged > 0) router.push(`/review?imported=${c.staged}&skipped=${c.duplicate}`);
  };

  const toStage = preview ? preview.counts.new + preview.counts.possible : 0;
  const failed = preview ? preview.checks.filter((c) => !c.ok) : [];
  const blocked = failed.length > 0 && !accept;
  // The same file again: ask first. Nothing is shown or saved until the owner answers.
  const askReimport = !!preview?.previousImport && !reimportOk;
  // Note: the dialog also reports "closed" when it is closed on purpose after a Yes, so cancelling only counts while the question is open.
  const cancelReimport = () => { setPreview(null); setSrc(null); setReimportOk(false); if (aiInput.current) aiInput.current.value = ""; };

  return (
    <>
      <PageHeader title="Import transactions" sub="Bring in a statement, or paste or describe transactions. Nothing counts until you approve it in the review queue, and the file itself is not stored." />
      {usable.length === 0 ? (
        <EmptyState title="Add a payment method first" hint="Open Settings and add the card or account this belongs to." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 md:grid-cols-3 lg:col-span-3">
            <AiFeatureCard enabled={aiEnabled} title="Import with AI">
              <p>Choose any statement file. The app works out which bank or card it is, and files UPI-app payments and card-bill payments in the right place.</p>
              <p className="text-xs">{aiEnabled ? "Claude only sees the text of the statement when your own parser cannot read it, with account numbers, emails and phone numbers hidden. You review every row." : "Off: add ANTHROPIC_API_KEY on the server to switch it on. Payment-method sensing still works without it."}</p>
              <input ref={aiInput} type="file" accept=".csv,.txt,.xlsx,.pdf" className="sr-only" aria-label="Choose statement file for AI import" onChange={(e) => { pickFile(e.target.files?.[0], true); e.target.value = ""; }} />
              <Button variant="primary" disabled={busy} onClick={() => aiInput.current?.click()}><FileUp size={16} aria-hidden />{busy && src?.kind === "file" && src.ai ? "Reading…" : "Choose statement"}</Button>
            </AiFeatureCard>
            <Card className="space-y-3">
              <CardTitle>Import a statement file</CardTitle>
              <p className="text-sm text-muted">Pick the bank or payment method yourself, then upload its CSV, Excel or PDF. Nothing is sent to AI.</p>
              <Button disabled={busy} onClick={() => { setManualFile(null); setManualOpen(true); }}><FileUp size={16} aria-hidden />Choose method and file</Button>
            </Card>
            <Card className="space-y-3">
              <CardTitle>Paste or describe</CardTitle>
              <p className="text-sm text-muted">Paste rows copied from a statement or app, or just write it: &ldquo;paid 450 at Swiggy yesterday via GPay&rdquo;.</p>
              <Button disabled={busy} onClick={() => setPasteOpen(true)}><ClipboardPaste size={16} aria-hidden />Paste or type</Button>
            </Card>
          </div>

          {(error || done || busy) && (
            <div className="space-y-2 lg:col-span-3">
              {busy && !preview && <p role="status" className="rounded-xl bg-background p-3 text-sm text-muted">Reading…</p>}
              {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
              {done && (
                <p role="status" className="rounded-xl bg-good-soft p-3 text-sm text-good">
                  {done} <Link href="/review" className="font-medium underline">Review them now</Link>
                </p>
              )}
            </div>
          )}

          {need && src && (
            <Card className="space-y-3 lg:col-span-3">
              <CardTitle>Which payment method is this?</CardTitle>
              <p className="text-sm text-muted">{need.reason}. Pick one and it will be read straight away.</p>
              <CompactChips label="Payment method" options={[...usable].sort((x, y) => (need.candidates.find((c) => c.id === y.id)?.score ?? 0) - (need.candidates.find((c) => c.id === x.id)?.score ?? 0)).map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[]} onPick={(id) => void read({ ...src, accountId: id })} />
            </Card>
          )}

          <Card className="lg:col-span-3">
            <CardTitle>Import history</CardTitle>
            {importBatches.length === 0 ? <p className="text-sm text-muted">Nothing imported yet.</p> : (
              <ul className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {importBatches.slice(0, 12).map((b) => (
                  <li key={b.id}>
                    <div className="truncate font-medium">{b.filename}</div>
                    <div className="text-xs text-muted">{accountName(b.accountId)} · {b.uploadedAt.slice(0, 10)}{b.readBy === "ai" ? " · read by AI" : ""}</div>
                    <div className="text-xs text-muted">{b.reimportOf ? "Read again · " : ""}{b.counts.staged} sent to review · {b.counts.skippedDuplicate} duplicates skipped{b.counts.unreadable ? ` · ${b.counts.unreadable} unreadable` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {preview && !askReimport && (
            <Card className="space-y-4 lg:col-span-3">
              <CardTitle>{preview.format === "text" ? "What was read" : "What the file contains"}</CardTitle>
              <div className="space-y-2 rounded-xl bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><MerchantAvatar name={accountName(preview.accountId)} size={24} /><b>{accountName(preview.accountId)}</b>
                  <span className="text-muted">{preview.detected?.chosen ? "you chose this" : preview.detected ? `picked automatically: ${preview.detected.reason}` : ""}</span>
                  {preview.readBy === "ai" && <AiBadge tone="unsure" title="Claude read these rows. Each one was found in the text, but check every amount.">Read by AI</AiBadge>}
                </div>
                {src && <CompactChips label="Change payment method" options={usable.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[preview.accountId]} onPick={(id) => { if (id !== preview.accountId) void read({ ...src, accountId: id }); }} />}
                {extraction && extraction.calls > 0 && <p className="text-xs text-muted">Claude read this text ({(extraction.inputTokens + extraction.outputTokens).toLocaleString("en-IN")} tokens). Account numbers, emails and phone numbers were hidden first.</p>}
              </div>
              {preview.unverified.length > 0 && (
                <details className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <summary className="cursor-pointer font-medium">{preview.unverified.length} line{preview.unverified.length === 1 ? "" : "s"} Claude offered could not be found in the text and were left out</summary>
                  <ul className="mt-2 space-y-1 text-xs">{preview.unverified.slice(0, 20).map((u) => <li key={u}>{u}</li>)}</ul>
                </details>
              )}
              {preview.summary && (
                <p className="text-sm text-muted">{preview.summary.issuer} statement{preview.summary.periodStart && preview.summary.periodEnd ? `, ${preview.summary.periodStart} to ${preview.summary.periodEnd}` : ""}{preview.summary.closingPaise !== undefined ? `. Closing balance ${formatINR(preview.summary.closingPaise)}.` : "."}</p>
              )}
              {preview.checks.length > 0 && (
                <div role="group" aria-label="Checks against the statement's own totals" className={`rounded-xl p-3 text-sm ${failed.length ? "bg-danger/10" : "bg-good-soft"}`}>
                  <div className={`mb-2 font-medium ${failed.length ? "text-danger" : "text-good"}`}>{failed.length ? "Some checks failed. Do not import until you have looked at the differences." : "Everything adds up to the statement's own totals."}</div>
                  <ul className="space-y-1">
                    {preview.checks.map((c) => (
                      <li key={c.name} className="flex items-start gap-2">
                        {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-label="Passed" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Failed" />}
                        <span><b>{c.name}.</b> <span className="text-muted">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                  {failed.length > 0 && (
                    <label className="mt-3 flex items-start gap-2 border-t border-danger/20 pt-3">
                      <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                      <span>I have checked the differences and want to import anyway. This will be recorded in the audit trail.</span>
                    </label>
                  )}
                </div>
              )}
              {preview.smart && (
                <div className="rounded-xl bg-accent/5 p-3 text-sm" role="status">
                  <div className="flex items-center gap-2 font-medium">Smart suggestions <AiBadge>AI-powered</AiBadge></div>
                  <p className="text-muted">
                    {preview.smart.fromMemory} filled in from what you approved before, {preview.smart.fromAi} suggested by AI (Claude), {preview.smart.needYou} need your category.
                    {preview.smart.ai.calls > 0 && ` Claude looked at ${preview.smart.ai.asked} new merchant${preview.smart.ai.asked === 1 ? "" : "s"} (${(preview.smart.ai.inputTokens + preview.smart.ai.outputTokens).toLocaleString("en-IN")} tokens). Next time it will already know them.`}
                    {!preview.smart.aiEnabled && " Claude is switched off (no API key on the server), so only your own memory is used."}
                    {preview.smart.ai.error && ` ${preview.smart.ai.error}, so the rest were left for you.`}
                  </p>
                  {preview.smart.aiEnabled && <p className="mt-1 text-xs text-muted">Only the merchant text, the amount and debit or credit are sent, with long numbers hidden. Never your name, the file, or account numbers.</p>}
                </div>
              )}
              {preview.warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-warn-soft p-3 text-sm text-warn">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["Rows read", preview.counts.rows, ""], ["New", preview.counts.new, "text-good"], ["Already imported", preview.counts.duplicate, ""], ["Possible duplicates", preview.counts.possible, "text-warn"], ["Unreadable", preview.counts.unreadable, preview.counts.unreadable ? "text-danger" : ""]].map(([l, v, c]) => (
                  <div key={String(l)} className="rounded-xl bg-background p-3"><div className="text-xs text-muted">{l}</div><div className={`num text-xl font-semibold ${c}`}>{v}</div></div>
                ))}
              </div>
              <p className="num text-sm">Money out <b>{formatINR(preview.totals.debitPaise)}</b> ({preview.totals.debitCount} rows) · Money in <b>{formatINR(preview.totals.creditPaise)}</b> ({preview.totals.creditCount} rows). <span className="text-muted">Compare these with the totals on your statement.</span></p>
              {preview.singleAmountColumn && (
                <div className="space-y-1.5 rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <div>This file has one Amount column, so the sign decides direction. Currently a positive amount means <b>{preview.positiveIsDebit ? "money out" : "money in"}</b>. If purchases look like refunds, switch it.</div>
                  <ChipGroup label="Sign of amounts" value={preview.positiveIsDebit ? "out" : "in"} options={[{ id: "out", label: "Positive = money out" }, { id: "in", label: "Positive = money in" }]} onChange={(v) => { setSign(v); if (src) void read(src, v); }} />
                </div>
              )}
              <ul className="divide-y divide-border rounded-xl border border-border">
                {preview.rows.slice(0, 100).map((r) => (
                  <li key={r.line} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                    <span className="num w-20 shrink-0 text-xs text-muted">{r.date.slice(2)}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.merchant}</div><div className="truncate text-xs text-muted">{r.description}</div></div>
                    {r.accountId !== preview.accountId && <span title={r.fundedBy ? `Paid from ${accountName(r.fundedBy)}` : undefined}><Badge>via {accountName(r.accountId)}</Badge></span>}
                    <Badge>{kindLabel[r.kind]}</Badge><span className="hidden text-xs text-muted sm:inline">{categoryName(r.categoryId)}</span>
                    {r.status === "duplicate" && <Badge tone="bad">Already imported</Badge>}
                    {r.status === "possible" && <Badge tone="warn">Possible duplicate</Badge>}
                    <span className={`num w-28 text-right font-medium ${r.direction === "credit" ? "text-good" : ""}`}>{r.direction === "credit" ? "+" : ""}{formatINR(r.amountPaise)}</span>
                  </li>
                ))}
              </ul>
              {preview.rows.length > 100 && <p className="text-xs text-muted">Showing the first 100 of {preview.rows.length}. All of them are imported.</p>}
              {preview.skipped.length > 0 && (
                <details className="rounded-xl bg-danger/5 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-danger">{preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} could not be read</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">{preview.skipped.slice(0, 30).map((s) => <li key={s.line}>Line {s.line}: {s.reason} — {s.text}</li>)}</ul>
                  <p className="mt-2 text-xs">These are not imported. Add them with the Add button if they matter.</p>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" disabled={busy || toStage === 0 || blocked} onClick={commit}>{busy ? "Saving…" : `Send ${toStage} to review queue`}</Button>
                <span className="text-xs text-muted">{blocked ? "Tick the box above to import despite the failed check. " : ""}{preview.counts.duplicate > 0 ? `${preview.counts.duplicate} already-imported rows will be skipped. ` : ""}Possible duplicates are added but flagged for you to decide.</span>
              </div>
            </Card>
          )}
        </div>
      )}

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} title="Import a statement file">
        <div className="space-y-4 pb-1 text-sm">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Which bank or payment method is this statement from?</div>
            <CompactChips label="Payment method" options={usable.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[manualAccount]} onPick={setManualAccount} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Statement file</div>
            <input ref={manualInput} type="file" accept=".csv,.txt,.xlsx,.pdf" className="sr-only" aria-label="Choose statement file" onChange={(e) => setManualFile(e.target.files?.[0] ?? null)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => manualInput.current?.click()}><FileUp size={16} aria-hidden />{manualFile ? "Change file" : "Choose .csv, .xlsx or .pdf"}</Button>
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
          <p className="text-xs text-muted">Pasted rows with a header (Date, Description, Amount) are read without AI. Free text is read by Claude: it sees only what you type here, with long numbers hidden. Everything goes to the review queue first.</p>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <Button disabled={!pasteText.trim()} onClick={() => { setPasteOpen(false); reset(); void read({ kind: "text", text: pasteText, mode: "table" }); }}>Read as table</Button>
            <Button variant="primary" disabled={!pasteText.trim() || !aiEnabled} title={aiEnabled ? undefined : "AI is off: no API key on the server"} onClick={() => { setPasteOpen(false); reset(); void read({ kind: "text", text: pasteText, mode: "ai" }); }}>{aiEnabled ? "Read with AI" : "Read with AI (off)"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={askReimport} onClose={() => { if (askReimport) cancelReimport(); }} title="Read this file again?">
        {preview?.previousImport && (
          <div className="space-y-3 pb-1 text-sm">
            <p>You already imported this exact file on <b>{preview.previousImport.uploadedAt.slice(0, 10)}</b> (&ldquo;{preview.previousImport.filename}&rdquo;, {preview.previousImport.staged} transaction{preview.previousImport.staged === 1 ? "" : "s"} sent to review).</p>
            {toStage > 0 ? (
              <ul className="space-y-1.5 rounded-xl bg-background p-3">
                <li><b className="num">{toStage}</b> of its {preview.counts.rows} rows are not in your ledger or review queue right now (for example ones you rejected or removed). They will come back for review.</li>
                <li><b className="num">{preview.counts.duplicate}</b> {preview.counts.duplicate === 1 ? "is" : "are"} already there and will be skipped, so nothing is counted twice.</li>
              </ul>
            ) : (
              <p className="rounded-xl bg-good-soft p-3 text-good">Every row in it is already in your ledger or review queue, so reading it again would add nothing.</p>
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
