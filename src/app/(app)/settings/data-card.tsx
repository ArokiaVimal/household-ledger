"use client";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, Button, Card, CardTitle, Dialog, Field, Input } from "@/components/ui";
import { useStore } from "@/data/store";

type Verify = { ok: boolean; exportedAt?: string; counts?: Record<string, number>; warnings?: string[]; errors?: string[]; error?: string };
async function call(payload: Record<string, unknown>): Promise<Record<string, unknown> & { ok?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch { return { ok: false, error: "Network problem. Try again." }; }
}

/** Complete backup, verified restore and permanent deletion. Each destructive step needs a typed confirmation. */
export function DataCard() {
  const { live, today } = useStore();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backup, setBackup] = useState<unknown>(null);
  const [check, setCheck] = useState<Verify | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delTyped, setDelTyped] = useState("");

  const download = async () => {
    setBusy(true); setMsg(null);
    const r = await call({ action: "export" });
    setBusy(false);
    if (!r.ok || !r.backup) return setMsg({ ok: false, text: r.error ?? "Could not create the backup." });
    const blob = new Blob([JSON.stringify(r.backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `ledger-backup-${today}.json`; a.click(); URL.revokeObjectURL(a.href);
    setMsg({ ok: true, text: "Backup downloaded. It has a checksum, so a damaged copy is caught when you restore." });
  };
  const pick = async (f: File) => {
    setMsg(null); setCheck(null); setBackup(null); setTyped("");
    let json: unknown;
    try { json = JSON.parse(await f.text()); } catch { return setMsg({ ok: false, text: "That file is not a backup (it is not valid JSON)." }); }
    setBusy(true);
    const r = (await call({ action: "verify", backup: json })) as Verify;
    setBusy(false);
    setBackup(json); setCheck(r);
  };
  const restore = async () => {
    setBusy(true);
    const r = await call({ action: "restore", backup, confirm: typed });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: (r.error as string) ?? ((r.errors as string[] | undefined)?.[0] ?? "The restore failed.") });
    setCheck(null); setBackup(null); setTyped("");
    setMsg({ ok: true, text: "Restored. Your data is back as it was in the backup." });
    router.refresh();
  };
  const remove = async () => {
    setBusy(true);
    const r = await call({ action: "delete", confirm: delTyped });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not delete." });
    setDeleting(false); setDelTyped("");
    try { localStorage.clear(); } catch { /* storage unavailable */ }
    router.replace("/"); router.refresh();
  };

  if (!live) return <Card className="space-y-2"><CardTitle>Backup, restore and delete</CardTitle><p className="text-sm text-muted">The demo holds only sample data. Sign in to back up, restore or delete your real data.</p></Card>;
  const total = check?.counts ? Object.entries(check.counts).filter(([k]) => ["records", "settlements", "importBatches"].includes(k)).map(([k, v]) => `${v} ${k === "records" ? "transactions" : k === "importBatches" ? "imports" : "settlements"}`).join(", ") : "";

  return (
    <Card className="space-y-4">
      <CardTitle tip="A backup holds all your data and activity history. Shared spaces aren't included. Restoring replaces your current data.">Backup, restore and delete</CardTitle>
      <div className="space-y-2">
        <p className="text-sm text-muted">Download one file with everything. Keep it somewhere safe.</p>
        <Button onClick={() => void download()} disabled={busy}><Download size={16} aria-hidden />Download full backup</Button>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-muted">Restore from a backup. We check the file first. Nothing changes until you confirm.</p>
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose a backup file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
        <Button onClick={() => file.current?.click()} disabled={busy}><Upload size={16} aria-hidden />Choose a backup to restore</Button>
        {check && (check.ok ? (
          <div className="space-y-2 rounded-xl bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="good">Verified</Badge><span>Backup from {check.exportedAt ? new Date(check.exportedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "an unknown date"}: {total}.</span></div>
            {(check.warnings ?? []).length > 0 && <ul className="list-disc pl-5 text-xs text-muted">{check.warnings!.map((w) => <li key={w}>{w}</li>)}</ul>}
            <p className="text-warn">Restoring replaces all your current data. Download a backup first.</p>
            <Field label="Type RESTORE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="RESTORE" /></Field>
            <div className="flex gap-2"><Button variant="danger" disabled={busy || typed !== "RESTORE"} onClick={() => void restore()}><RotateCcw size={15} aria-hidden />Restore and replace my data</Button><Button onClick={() => { setCheck(null); setBackup(null); }}>Cancel</Button></div>
          </div>
        ) : (
          <div role="alert" className="space-y-1 rounded-xl bg-danger/10 p-3 text-sm text-danger"><b>This file was not restored.</b><ul className="list-disc pl-5">{(check.errors ?? [check.error ?? "It could not be verified."]).map((e) => <li key={e}>{e}</li>)}</ul></div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-muted">Permanently delete all your data and links. This can&apos;t be undone.</p>
        <Button variant="danger" onClick={() => { setDeleting(true); setDelTyped(""); }}><Trash2 size={16} aria-hidden />Delete all my data…</Button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>}

      <Dialog open={deleting} onClose={() => setDeleting(false)} title="Delete all my data?">
        <div className="space-y-3 pb-1 text-sm">
          <p>This permanently deletes all transactions, people, settings, history and links. It can&apos;t be undone.</p>
          <p className="text-xs text-muted">Not affected: your Google sign-in and any joint space with a partner.</p>
          <Field label="Type DELETE MY DATA to confirm"><Input value={delTyped} onChange={(e) => setDelTyped(e.target.value)} autoComplete="off" placeholder="DELETE MY DATA" /></Field>
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setDeleting(false)}>Keep my data</Button><Button variant="danger" disabled={busy || delTyped !== "DELETE MY DATA"} onClick={() => void remove()}>Delete everything</Button></div>
        </div>
      </Dialog>
    </Card>
  );
}
