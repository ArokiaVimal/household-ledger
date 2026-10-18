"use client";
import { FileUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, Button, Card, CardTitle, ChipGroup, CompactChips, EmptyState, FormRow, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { Preview } from "@/lib/import/service";

const MAX_BYTES = 4 * 1024 * 1024;
const kindLabel: Record<string, string> = { purchase: "Purchase", refund: "Refund", fee: "Fee", income: "Income", transfer: "Transfer", cc_payment: "Card bill" };

type Reply = { ok: boolean; error?: string; preview?: Preview; result?: { counts: { staged: number; duplicate: number; possible: number; unreadable: number } } };

export function LiveImport() {
  const { accounts, accountName, categoryName, importBatches } = useStore();
  const router = useRouter();
  const usable = accounts.filter((a) => a.type !== "cash");
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [sign, setSign] = useState<"auto" | "out" | "in">("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = async (mode: "preview" | "commit", signOverride = sign): Promise<Reply> => {
    const form = new FormData();
    form.set("file", file!);
    form.set("accountId", accountId);
    form.set("mode", mode);
    if (signOverride !== "auto") form.set("positiveIsDebit", signOverride === "out" ? "true" : "false");
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as Reply;
      return res.ok ? { ...data, ok: true } : { ok: false, error: data.error ?? "Something went wrong." };
    } catch {
      return { ok: false, error: "Network problem. Try again." };
    }
  };

  const pick = (f: File | undefined) => {
    setPreview(null); setError(null); setDone(null); setSign("auto");
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) { setFile(null); return setError("That file is larger than 4 MB. Export a shorter date range."); }
    if (!/\.(csv|txt|xlsx)$/i.test(f.name)) { setFile(null); return setError(/\.pdf$/i.test(f.name) ? "PDF statements can't be read yet. Download the CSV or Excel version from your bank if it offers one." : "Upload a .csv or .xlsx statement."); }
    setFile(f);
  };

  const read = async (s = sign) => {
    if (!file || !accountId) return;
    setBusy(true); setError(null); setDone(null);
    const r = await send("preview", s);
    setBusy(false);
    if (!r.ok) { setPreview(null); return setError(r.error ?? "Could not read that file."); }
    setPreview(r.preview ?? null);
  };

  const commit = async () => {
    setBusy(true); setError(null);
    const r = await send("commit");
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not save the import.");
    const c = r.result!.counts;
    setDone(`${c.staged} transaction${c.staged === 1 ? "" : "s"} sent to the review queue. ${c.duplicate} duplicate${c.duplicate === 1 ? "" : "s"} skipped.`);
    setPreview(null); setFile(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const toStage = preview ? preview.counts.new + preview.counts.possible : 0;

  return (
    <>
      <PageHeader title="Import a statement" sub="CSV or Excel. Nothing counts until you approve it in the review queue, and the file itself is not stored." />
      {usable.length === 0 ? (
        <EmptyState title="Add a payment method first" hint="Open Settings and add the card or account this statement belongs to." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 lg:col-span-2">
            <FormRow label="Statement for">
              <CompactChips label="Payment method" options={usable.map((a) => ({ id: a.id, label: a.name }))} selected={[accountId]} onPick={(id) => { setAccountId(id); setPreview(null); setDone(null); }} />
            </FormRow>
            <FormRow label="File">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={input} type="file" accept=".csv,.txt,.xlsx" className="sr-only" aria-label="Choose statement file" onChange={(e) => pick(e.target.files?.[0])} />
                <Button onClick={() => input.current?.click()}><FileUp size={16} aria-hidden />{file ? "Change file" : "Choose .csv or .xlsx"}</Button>
                {file && <span className="text-sm text-muted">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
              </div>
            </FormRow>
            <div className="flex flex-wrap gap-2 pl-0 sm:pl-[4.75rem]"><Button variant="primary" disabled={!file || !accountId || busy} onClick={() => read()}>{busy && !preview ? "Reading…" : "Read statement"}</Button></div>
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            {done && (
              <p role="status" className="rounded-xl bg-good-soft p-3 text-sm text-good">
                {done} <Link href="/review" className="font-medium underline">Review them now</Link>
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Import history</CardTitle>
            {importBatches.length === 0 ? <p className="text-sm text-muted">No statements imported yet.</p> : (
              <ul className="space-y-3 text-sm">
                {importBatches.slice(0, 12).map((b) => (
                  <li key={b.id}>
                    <div className="truncate font-medium">{b.filename}</div>
                    <div className="text-xs text-muted">{accountName(b.accountId)} · {b.uploadedAt.slice(0, 10)}</div>
                    <div className="text-xs text-muted">{b.counts.staged} sent to review · {b.counts.skippedDuplicate} duplicates skipped{b.counts.unreadable ? ` · ${b.counts.unreadable} unreadable` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {preview && (
            <Card className="space-y-4 lg:col-span-3">
              <CardTitle>What the file contains</CardTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["Rows read", preview.counts.rows, ""], ["New", preview.counts.new, "text-good"], ["Already imported", preview.counts.duplicate, ""], ["Possible duplicates", preview.counts.possible, "text-warn"], ["Unreadable", preview.counts.unreadable, preview.counts.unreadable ? "text-danger" : ""]].map(([l, v, c]) => (
                  <div key={String(l)} className="rounded-xl bg-background p-3"><div className="text-xs text-muted">{l}</div><div className={`num text-xl font-semibold ${c}`}>{v}</div></div>
                ))}
              </div>
              <p className="num text-sm">Money out <b>{formatINR(preview.totals.debitPaise)}</b> ({preview.totals.debitCount} rows) · Money in <b>{formatINR(preview.totals.creditPaise)}</b> ({preview.totals.creditCount} rows). <span className="text-muted">Compare these with the totals on your statement.</span></p>
              {preview.singleAmountColumn && (
                <div className="space-y-1.5 rounded-xl bg-warn-soft p-3 text-sm text-warn">
                  <div>This file has one Amount column, so the sign decides direction. Currently a positive amount means <b>{preview.positiveIsDebit ? "money out" : "money in"}</b>. If purchases look like refunds, switch it.</div>
                  <ChipGroup label="Sign of amounts" value={preview.positiveIsDebit ? "out" : "in"} options={[{ id: "out", label: "Positive = money out" }, { id: "in", label: "Positive = money in" }]} onChange={(v) => { setSign(v); void read(v); }} />
                </div>
              )}
              <ul className="divide-y divide-border rounded-xl border border-border">
                {preview.rows.slice(0, 100).map((r) => (
                  <li key={r.line} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                    <span className="num w-20 shrink-0 text-xs text-muted">{r.date.slice(2)}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.merchant}</div><div className="truncate text-xs text-muted">{r.description}</div></div>
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
                <Button variant="primary" disabled={busy || toStage === 0} onClick={commit}>{busy ? "Saving…" : `Send ${toStage} to review queue`}</Button>
                <span className="text-xs text-muted">{preview.counts.duplicate > 0 ? `${preview.counts.duplicate} already-imported rows will be skipped. ` : ""}Possible duplicates are added but flagged for you to decide.</span>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
