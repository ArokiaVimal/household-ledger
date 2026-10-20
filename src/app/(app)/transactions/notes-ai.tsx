"use client";
import { BusyOverlay, ErrorDialog } from "@/components/feedback";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AiBadge, Badge, Button, Dialog } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { notesToRead } from "@/lib/notes/ai";

interface Change { id: string; fromCategoryId: string; toCategoryId: string; confident: boolean; why: string; merchant: string; date: string; amountPaise: number; note: string; status: "reviewed" | "unreviewed" }

/** "Read notes with AI": Claude proposes a category for each transaction from the note you wrote; you choose what to apply. */
export function NotesAi() {
  const { live, aiEnabled, records, staged, categoryName, updateRecord, updateStaged } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ read: number; changes: Change[]; partial: string | null } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const withNotes = useMemo(() => notesToRead([...records, ...staged]).length, [records, staged]);
  const off = !live ? "Reading notes works on your real entries, once you are signed in." : !aiEnabled ? "AI is off on this server." : withNotes === 0 ? "Add a note to a transaction first." : null;

  const run = async () => {
    setBusy(true); setError(null); setResult(null); setDone(null);
    try {
      const res = await fetch("/api/notes", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; read?: number; proposals?: Change[]; partial?: string | null };
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      const changes = data.proposals ?? [];
      setResult({ read: data.read ?? 0, changes, partial: data.partial ?? null });
      setPicked(new Set(changes.filter((c) => c.confident).map((c) => c.id)));
    } catch { setError("Network problem. Try again."); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = () => {
    let n = 0;
    for (const c of result?.changes ?? []) {
      if (!picked.has(c.id)) continue;
      const rev = records.find((r) => r.id === c.id), wait = staged.find((r) => r.id === c.id);
      const cur = rev ?? wait;
      if (!cur || cur.categoryId !== c.fromCategoryId) continue; // changed since: leave it alone
      if (rev) updateRecord(c.id, { categoryId: c.toCategoryId }); else updateStaged(c.id, { categoryId: c.toCategoryId });
      n++;
    }
    setDone(`Updated ${n} categor${n === 1 ? "y" : "ies"}.`);
    setResult(null); setPicked(new Set());
  };

  return (
    <>
      <Button disabled={!!off} title={off ?? undefined} aria-label="Read notes with AI" onClick={() => { setOpen(true); setResult(null); setError(null); setDone(null); }}><Sparkles size={15} aria-hidden /><span className="max-sm:sr-only">Read notes with AI</span><span className="max-sm:hidden"><AiBadge>AI</AiBadge></span></Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Read notes with AI">
        <div className="space-y-3 pb-1 text-sm">
          {!result && !done && (
            <>
              <p>Claude reads the <b>{withNotes}</b> note{withNotes === 1 ? "" : "s"} you wrote on your transactions and suggests the category each payment really belongs to. Your note is the best clue about what a payment was for.</p>
              <p className="text-xs text-muted">Sends merchant, amount, category and note. Long numbers, emails and phone numbers are hidden. Nothing changes until you apply.</p>
              <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void run()}>{busy ? "Reading…" : "Read my notes"}</Button></div>
            </>
          )}
          {done && (
            <>
              <p role="status" className="rounded-xl bg-good-soft p-3 text-good">{done} They are saved like any edit, and your totals follow the new categories.</p>
              <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></div>
            </>
          )}
          {result && (
            <>
              <p className="text-muted">Read {result.read} note{result.read === 1 ? "" : "s"}. {result.changes.length === 0 ? "The categories already match what your notes say." : `${result.changes.length} would change. Confident ones are ticked; check the rest.`}</p>
              {result.partial && <p className="rounded-xl bg-warn-soft p-3 text-warn">Only part of the notes could be read ({result.partial}).</p>}
              {result.changes.length > 0 && (
                <ul className="max-h-[50vh] divide-y divide-border overflow-auto rounded-xl border border-border">
                  {result.changes.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-background">
                        <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Apply the new category to ${c.merchant}`} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="flex flex-wrap items-center gap-x-2"><span className="font-medium">{c.merchant}</span><span className="num text-xs text-muted">{c.date} · {formatINR(c.amountPaise)}{c.status === "unreviewed" ? " · waiting for review" : ""}</span></span>
                          <span className="block text-xs italic text-muted">“{c.note}”</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted">{categoryName(c.fromCategoryId)}</span><span aria-hidden>→</span><b>{categoryName(c.toCategoryId)}</b>{c.confident ? <Badge tone="good">Clear note</Badge> : <AiBadge tone="unsure">Check</AiBadge>}</span>
                          {c.why && <span className="block text-xs text-muted">{c.why}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3">
                {result.changes.length > 0 ? <Button onClick={() => setPicked(picked.size === result.changes.length ? new Set() : new Set(result.changes.map((c) => c.id)))}>{picked.size === result.changes.length ? "Clear all" : "Select all"}</Button> : <span />}
                <div className="flex gap-2"><Button onClick={() => setOpen(false)}>{result.changes.length ? "Cancel" : "Close"}</Button>{result.changes.length > 0 && <Button variant="primary" disabled={picked.size === 0} onClick={apply}>Apply {picked.size}</Button>}</div>
              </div>
            </>
          )}
        </div>
      </Dialog>
      <BusyOverlay open={busy} title="Reading your notes with AI…" detail="Claude is reading the notes and suggesting categories. This usually takes under half a minute." />
      <ErrorDialog message={error} onClose={() => setError(null)} />
    </>
  );
}
