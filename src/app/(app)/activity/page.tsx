"use client";
import { History, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ChipGroup, ConfirmDialog, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";

interface Change { id: string; at: string; actorId: string; action: string; entity: string; entityId: string; summary: string; undoable: boolean; undone: boolean }
interface ImportRow { id: string; filename: string; uploadedAt: string; rows: number; rolledBackAt: string | null; approved: number; waiting: number }

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; changes?: Change[]; imports?: ImportRow[] }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch { return { ok: false, error: "Network problem. Try again." }; }
}

/** The audit trail: who changed what and when, with one-step undo, and the import history with rollback. */
export default function Activity() {
  const { live, meId, participants } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<"changes" | "imports">("changes");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState<ImportRow | null>(null);

  const load = useCallback(async () => {
    const r = await post("/api/activity");
    if (!r.ok) { setError(r.error ?? "Could not load the activity."); return; }
    setChanges(r.changes ?? []); setImports(r.imports ?? []);
  }, []);
  useEffect(() => { if (live) void Promise.resolve().then(load); }, [live, load]);

  const who = (uid: string) => (uid === "demo" || `u_` === meId ? "You" : participants.find((p) => p.userId === uid || p.id === `u_${uid}`)?.name ?? "Someone");
  const run = async (action: object) => {
    setBusy(true); setError(null);
    const r = await post("/api/data", action);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    router.refresh();
    await load();
  };

  if (!live) return <><PageHeader title="Activity" /><Card><EmptyState title="Activity is recorded for signed-in accounts" hint="Every change is logged and can be undone here." /></Card></>;

  return (
    <>
      <PageHeader title="Activity" tip="Every change is logged with who and when. Undo reverses one change and never alters original bank text. Rolling back an import removes its transactions." sub="Who changed what, and when" />
      <div className="mb-3 max-w-xs"><ChipGroup tabs label="Activity view" options={[{ id: "changes", label: "Changes" }, { id: "imports", label: "Imports" }]} value={tab} onChange={setTab} /></div>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}

      {tab === "changes" && (changes === null ? <Card><p className="text-sm text-muted">Loading…</p></Card> : changes.length === 0 ? <Card><EmptyState title="Nothing yet" hint="Changes will appear here as you approve, edit and settle." /></Card> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {changes.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><History size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{c.summary}</div>
                  <div className="text-xs text-muted">{who(c.actorId)} · {when(c.at)}{c.undone && " · undone"}</div>
                </div>
                {c.undoable && <Button disabled={busy} onClick={() => void run({ type: "audit.undo", eventId: c.id })} aria-label={`Undo: ${c.summary}`}><Undo2 size={14} aria-hidden />Undo</Button>}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {tab === "imports" && (imports.length === 0 ? <Card><EmptyState title="No imports yet" hint="Statement imports will be listed here, and can be rolled back." /></Card> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {imports.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-sm font-medium">{b.filename}</div>
                  <div className="text-xs text-muted">{when(b.uploadedAt)} · {b.rows} rows · {b.approved} approved · {b.waiting} waiting</div>
                </div>
                {b.rolledBackAt ? <Badge>Rolled back {when(b.rolledBackAt)}</Badge> : <Button variant="danger" disabled={busy} onClick={() => setRolling(b)}>Roll back…</Button>}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <ConfirmDialog open={!!rolling} onClose={() => setRolling(null)} title={`Roll back ${rolling?.filename ?? "this import"}?`} confirmLabel="Roll back" onConfirm={() => rolling && void run({ type: "batch.rollback", id: rolling.id })}>
        <p>This removes the {rolling ? rolling.approved + rolling.waiting : 0} transaction{rolling && rolling.approved + rolling.waiting === 1 ? "" : "s"} this import created{rolling && rolling.approved > 0 ? `, including ${rolling.approved} you already approved, so they stop counting` : ""}. The original rows from the statement are kept, and the file can be imported again afterwards.</p>
        <p className="text-xs text-muted">If any of them are part of a settlement, it will refuse and tell you to void that settlement first.</p>
      </ConfirmDialog>
    </>
  );
}
