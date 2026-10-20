"use client";
import { Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardTitle, ConfirmDialog } from "@/components/ui";

interface Status { configured: boolean; connected: boolean; email: string | null; lastSyncAt: string | null; lastResult: { scanned: number; added: number; bills: number; duplicates: number } | null; needsReconnect: boolean; defaultAccountId: string | null }
const NOTE: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail is connected. Press Sync now to read your recent bank emails." },
  denied: { ok: false, text: "Google did not give access, so nothing was connected." },
  error: { ok: false, text: "Could not finish connecting Gmail. Try again." },
  notset: { ok: false, text: "Gmail is not set up on this server yet." },
};

async function call<T>(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & T> {
  try {
    const res = await fetch("/api/gmail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, ...data } as { ok: boolean; error?: string } & T;
  } catch {
    return { ok: false, error: "Network problem. Try again." } as { ok: boolean; error?: string } & T;
  }
}

/** Reads your bank emails (only from bank, card and UPI senders) into the review queue. Read-only access, revocable any time. */
export function GmailCard() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [off, setOff] = useState(false);

  const load = useCallback(async () => { const r = await call<Status>({ action: "status" }); if (r.ok) setS(r); }, []);
  useEffect(() => {
    void Promise.resolve().then(() => {
      void load();
      const flag = new URLSearchParams(window.location.search).get("gmail");
      if (flag && NOTE[flag]) setMsg(NOTE[flag]);
    });
  }, [load]);

  const sync = async () => {
    setBusy(true); setMsg(null);
    const r = await call<{ counts?: { scanned: number; added: number; bills: number; duplicates: number }; needsReconnect?: boolean; skipped?: string }>({ action: "sync" });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not sync." });
    if (r.needsReconnect) setMsg({ ok: false, text: "Google no longer allows this connection. Connect again." });
    else if (r.counts) setMsg({ ok: true, text: r.counts.added + r.counts.bills > 0 ? `Found ${r.counts.added} new transaction${r.counts.added === 1 ? "" : "s"}${r.counts.bills ? ` and ${r.counts.bills} card bill${r.counts.bills === 1 ? "" : "s"}` : ""}. They are waiting in your review queue.` : `Checked ${r.counts.scanned} bank email${r.counts.scanned === 1 ? "" : "s"}. Nothing new.` });
    void load();
  };
  const disconnect = async () => { await call<object>({ action: "disconnect" }); setMsg({ ok: true, text: "Gmail is disconnected." }); void load(); };

  return (
    <Card className="space-y-4">
      <CardTitle action={<Badge tone={s?.connected && !s.needsReconnect ? "good" : "neutral"}>{s === null ? "…" : s.connected ? (s.needsReconnect ? "Reconnect" : "On") : "Off"}</Badge>}><span className="inline-flex items-center gap-2"><Mail size={16} aria-hidden className="text-accent" />Bank emails (Gmail)</span></CardTitle>
      <p className="text-sm text-muted">Reads bank, card and UPI emails (read-only) into Transactions as unverified. You verify them.</p>

      {s && !s.configured && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Gmail isn&apos;t set up yet. The app owner needs to configure it once.<code>docs/GMAIL_SETUP.md</code>), and after that everyone can connect their own mailbox.</p>
      )}
      {s?.configured && !s.connected && <a href="/api/gmail/connect" className="inline-flex min-h-9 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-white hover:bg-accent/90">Connect Gmail</a>}
      {s?.connected && (
        <div className="space-y-3">
          <p className="text-sm">Connected as <b>{s.email || "your Gmail"}</b>.{s.lastSyncAt ? ` Last checked ${new Date(s.lastSyncAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${s.lastResult ? `: ${s.lastResult.added} new, ${s.lastResult.bills} card bill${s.lastResult.bills === 1 ? "" : "s"}` : ""}.` : " Not checked yet."}</p>
          <p className="text-xs text-muted">Emails that do not name a card wait for you to pick one when you verify.</p>
          <div className="flex flex-wrap gap-2">
            {s.needsReconnect ? <a href="/api/gmail/connect" className="inline-flex min-h-9 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-white">Connect again</a> : <Button variant="primary" disabled={busy} onClick={() => void sync()}>{busy ? "Checking…" : "Sync now"}</Button>}
            <Button variant="danger" onClick={() => setOff(true)}>Disconnect</Button>
          </div>
          <p className="text-xs text-muted">It also checks quietly when you open the app and once a day.</p>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}
      <ConfirmDialog open={off} onClose={() => setOff(false)} title="Disconnect Gmail?" confirmLabel="Disconnect" onConfirm={() => void disconnect()}>
        <p>Stops reading your email and disconnects Google. Captured entries stay unverified.</p>
      </ConfirmDialog>
    </Card>
  );
}
