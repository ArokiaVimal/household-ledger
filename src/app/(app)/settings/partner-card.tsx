"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHousehold } from "@/components/household-context";
import { Badge, Button, Card, CardTitle, ChipGroup, ConfirmDialog, Field, Input } from "@/components/ui";

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false, error: "Network problem. Try again." };
  }
}

const PRESETS = [5000, 6000, 6400, 7000];
const pct = (bps: number) => (Number.isInteger(bps / 100) ? String(bps / 100) : (bps / 100).toFixed(1));

/**
 * Partner sharing. The app is personal first: everything is private and this card is optional. Linking a partner
 * creates a separate shared space; only expenses you choose to split with them ever appear there.
 */
export function PartnerCard() {
  const { membership, status, uid, partner, offers, myName } = useHousehold();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [custom, setCustom] = useState("");

  const run = async (payload: Record<string, unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    const r = await call(payload);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Something went wrong." }); return false; }
    if (ok) setMsg({ ok: true, text: ok });
    router.refresh();
    return true;
  };

  if (status === "off") return <Card><CardTitle>Partner</CardTitle><p className="text-sm text-muted">Sharing needs sign-in. Prototype mode has no accounts.</p></Card>;
  if (status === "error" || !membership) return <Card><CardTitle>Partner</CardTitle><p role="alert" className="text-sm text-danger">Could not load your sharing settings. Reload in a moment.</p></Card>;

  const linked = partner?.active && partner.partner;
  const waiting = membership.invites;
  const feedback = msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>;

  const inviteForm = (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "invite", email }, `Invitation saved for ${email}. Ask them to sign in with that email and accept it in Settings.`).then((ok) => { if (ok) setEmail(""); }); }}>
      <Field label="Your partner's Google email"><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" /></Field>
      <Button type="submit" variant="primary" disabled={busy || !email.includes("@")}>Send invitation</Button>
    </form>
  );

  if (linked && partner.partner) {
    const them = partner.partner;
    const ratio = partner.ratio;
    const leaderUid = ratio?.leaderUid ?? uid ?? "";
    const leaderBps = ratio?.leaderBps ?? 5000;
    const leaderName = leaderUid === uid ? (myName || "You") : them.name;
    const otherName = leaderUid === uid ? them.name : (myName || "You");
    const save = (nextLeader: string, bps: number) => run({ action: "ratio", leaderUid: nextLeader, leaderBps: bps }, "Split saved.");
    return (
      <Card className="space-y-4">
        <CardTitle action={<Badge tone="good">Linked</Badge>}>Partner</CardTitle>
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0"><div className="truncate font-medium">{them.name}</div><div className="truncate text-xs text-muted">{them.email}</div></div>
        </div>
        <p className="text-sm text-muted">Your transactions stay private. Only an expense you split with {them.name} is shared, and they see just the merchant, amount, date, category and split, never the bank text, your card or your notes.</p>
        <div className="space-y-3 rounded-xl bg-background p-3">
          <div className="text-sm font-medium">{ratio ? "Your usual split" : `How do you and ${them.name} usually split?`}</div>
          {!ratio && <p className="text-xs text-muted">Until you choose, shared expenses start at 50/50. You can still change any expense.</p>}
          <ChipGroup label="Who carries the larger share" options={[{ id: uid ?? "", label: myName || "You" }, { id: them.uid, label: them.name }]} value={leaderUid} onChange={(v) => save(v, leaderBps)} />
          <ChipGroup label="Share" options={PRESETS.map((b) => ({ id: String(b), label: b === 5000 ? "50 / 50" : `${pct(b)} / ${pct(10000 - b)}` }))} value={PRESETS.includes(leaderBps) ? String(leaderBps) : ""} onChange={(v) => save(leaderUid, Number(v))} />
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(custom) * 100); if (n >= 500 && n <= 9500) save(leaderUid, n).then((ok) => { if (ok) setCustom(""); }); else setMsg({ ok: false, text: "Enter a percentage between 5 and 95." }); }}>
            <Field label="Or a custom share"><Input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 64" aria-label="Custom percentage for the larger share" /></Field>
            <Button type="submit" disabled={busy || !custom.trim()}>Set</Button>
          </form>
          <p className="text-xs text-muted">Now: {leaderName} {pct(leaderBps)}% · {otherName} {pct(10000 - leaderBps)}%</p>
        </div>
        <div className="border-t border-border pt-3"><Button variant="danger" disabled={busy} onClick={() => setUnlinking(true)}>Unlink from {them.name}…</Button></div>
        {feedback}
        <ConfirmDialog open={unlinking} onClose={() => setUnlinking(false)} title={`Unlink from ${them.name}?`} confirmLabel="Unlink" onConfirm={() => run({ action: "unlink" }, "Unlinked. Your shared history stays for both of you.")}>
          <p>You will both keep your own private transactions untouched. Everything already shared stays visible to both as history, but nothing new can be shared until you link again.</p>
        </ConfirmDialog>
      </Card>
    );
  }

  const offer = offers[0];
  return (
    <Card className="space-y-4">
      <CardTitle action={<Badge>{partner ? "Unlinked" : "Just you"}</Badge>}>Share with a partner</CardTitle>
      {partner && <p className="text-sm text-muted">You unlinked{partner.endedAt ? ` on ${partner.endedAt.slice(0, 10)}` : ""}{partner.partner ? ` from ${partner.partner.name}` : ""}. What you shared stays as history. You can link with someone again below.</p>}
      {offer && (
        <div className="space-y-2 rounded-xl bg-background p-3">
          <p className="text-sm"><b>{offer.inviterName}</b> invited you to share expenses. Your own transactions stay private; only what you choose to split is shared.</p>
          <Button variant="primary" disabled={busy} onClick={() => run({ action: "accept", hash: offer.hash }, "Linked. Set your usual split below.")}>Accept invitation</Button>
        </div>
      )}
      <p className="text-sm text-muted">Everything here is yours alone and nothing needs a partner. When you want to split expenses, invite your partner by email. They sign in with that Google account and accept in Settings.</p>
      {inviteForm}
      {waiting.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Waiting to accept</div>
          <ul className="space-y-1">{waiting.map((i) => (
            <li key={i.hash} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{i.email} <span className="text-xs text-muted">expires {i.expiresAt.slice(0, 10)}</span></span>
              <Button disabled={busy} onClick={() => run({ action: "revoke", hash: i.hash })}>Cancel</Button></li>
          ))}</ul>
          <p className="mt-2 text-xs text-muted">Their email must be on this app&apos;s access list before they can sign in and accept.</p>
        </div>
      )}
      {feedback}
    </Card>
  );
}
