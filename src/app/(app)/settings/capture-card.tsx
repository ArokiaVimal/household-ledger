"use client";
import { Check, Copy, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MerchantAvatar } from "@/components/txn-row";
import { Badge, Button, Card, CardTitle, CompactChips, ConfirmDialog } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";

interface Status { active: boolean; defaultAccountId: string | null; lastUsedAt: string | null; today: number }
interface Tried { result: string; message: string; preview?: { merchant: string; amountPaise: number; direction: "debit" | "credit"; account: string; kind: string; category: string; status: string } }

async function call<T>(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & T> {
  try {
    const res = await fetch("/api/capture-setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, ...data } as { ok: boolean; error?: string } & T;
  } catch {
    return { ok: false, error: "Network problem. Try again." } as { ok: boolean; error?: string } & T;
  }
}

/** Auto-capture of bank messages: a private link that a phone automation posts each SMS to. Messages wait in the review queue. */
export function CaptureCard() {
  const { accounts, categoryName } = useStore();
  const usable = accounts.filter((a) => a.type !== "cash");
  const [status, setStatus] = useState<Status | null>(null);
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [tried, setTried] = useState<Tried | null>(null);
  const [off, setOff] = useState(false);

  const load = useCallback(async () => {
    const r = await call<Status>({ action: "status" });
    if (r.ok) { setStatus(r); if (r.defaultAccountId) setAccountId(r.defaultAccountId); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const create = async () => {
    setBusy(true); setError(null);
    const r = await call<{ url: string }>({ action: "create", defaultAccountId: accountId });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not create the link.");
    setLink(r.url); setCopied(false); void load();
  };
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Copy failed. Select the link and copy it by hand."); } };
  const check = async () => {
    setBusy(true); setError(null); setTried(null);
    const r = await call<Tried>({ action: "try", text: sample });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not check that.");
    setTried(r);
  };
  const changeDefault = async (id: string) => { setAccountId(id); if (status?.active) { const r = await call<object>({ action: "setDefault", defaultAccountId: id }); if (!r.ok) setError(r.error ?? "Could not change that."); } };
  const revoke = async () => { await call<object>({ action: "revoke" }); setLink(null); setStatus((s) => (s ? { ...s, active: false } : s)); void load(); };

  if (usable.length === 0) return <Card><CardTitle>Messages</CardTitle><p className="text-sm text-muted">Add a payment method first, so captured messages know where to go.</p></Card>;
  return (
    <Card className="space-y-4">
      <CardTitle action={<Badge tone={status?.active ? "good" : "neutral"}>{status === null ? "…" : status.active ? "On" : "Off"}</Badge>}><span className="inline-flex items-center gap-2"><MessageSquare size={16} aria-hidden className="text-accent" />Bank messages (SMS)</span></CardTitle>
      <p className="text-sm text-muted">Every bank, card and UPI text can add itself to your review queue the moment it arrives. You still approve each one before it counts. OTPs and offers are skipped.</p>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted">If a message does not say which card or bank, file it under</div>
        <CompactChips label="Default payment method" options={usable.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[accountId]} onPick={(id) => void changeDefault(id)} />
      </div>

      {status?.active && !link && (
        <p className="rounded-xl bg-good-soft p-3 text-sm text-good">Capture is on.{status.lastUsedAt ? ` Last message ${new Date(status.lastUsedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.` : " Waiting for the first message."}{status.today > 0 ? ` ${status.today} today.` : ""}</p>
      )}

      {link ? (
        <div className="space-y-3 rounded-xl bg-accent/5 p-4 text-sm">
          <p className="font-medium">Your private link. It is shown only now; copy it.</p>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs" aria-label="Capture link">{link}</code><Button onClick={() => void copy()}>{copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied ? "Copied" : "Copy"}</Button></div>
          <p className="text-xs text-muted">Anyone with this link can add entries to your review queue (they cannot read anything). If it leaks, create a new link and the old one stops working.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li><b>iPhone:</b> open <b>Shortcuts</b>, then <b>Automation</b>, tap <b>+</b>, choose <b>Message</b>.</li>
            <li>Under <b>Sender</b> pick your bank&apos;s sender (for example HDFCBK), or use <b>Message Contains</b> &ldquo;debited&rdquo;. Choose <b>Run Immediately</b>.</li>
            <li>Add the action <b>Get Contents of URL</b>. Paste the link, set <b>Method</b> to POST, <b>Request Body</b> to JSON, and add a Text field named <b>text</b> whose value is <b>Shortcut Input</b>.</li>
            <li>Repeat for each bank or card sender. <b>Android:</b> use an SMS-forwarding app (MacroDroid, Tasker or similar) to POST the same JSON.</li>
          </ol>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || !accountId} onClick={() => void create()}>{status?.active ? "Create a new link" : "Set up SMS capture"}</Button>
          {status?.active && <Button variant="danger" onClick={() => setOff(true)}>Switch off</Button>}
        </div>
      )}

      <details className="group rounded-xl bg-background p-3 text-sm">
        <summary className="cursor-pointer font-medium">Try a message</summary>
        <div className="mt-3 space-y-2">
          <textarea aria-label="Sample message" rows={3} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Paste a bank SMS here to see what the app would add. Nothing is saved." className="w-full resize-y rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
          <Button disabled={busy || !sample.trim()} onClick={() => void check()}>Check it</Button>
          {tried && (
            <div role="status" className="rounded-xl bg-surface p-3">
              <p className="font-medium">{tried.message}</p>
              {tried.preview && <p className="mt-1 text-xs text-muted">{tried.preview.merchant} · {tried.preview.direction === "credit" ? "+" : ""}{formatINR(tried.preview.amountPaise)} · {tried.preview.account} · {categoryName(tried.preview.category)}</p>}
            </div>
          )}
        </div>
      </details>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ConfirmDialog open={off} onClose={() => setOff(false)} title="Switch off SMS capture?" confirmLabel="Switch off" onConfirm={() => void revoke()}>
        <p>The link stops working straight away. Entries already captured stay in your review queue.</p>
      </ConfirmDialog>
    </Card>
  );
}
