"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHousehold } from "@/components/household-context";
import { Badge, Button, Card, CardTitle, Field, Input } from "@/components/ui";

async function call(payload: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false, error: "Network problem. Try again." };
  }
}

/** Sharing with a partner. The app is personal first: this is optional, and nothing here is needed to track your own spending. */
export function SharingCard() {
  const { membership, status, uid } = useHousehold();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (payload: Record<string, string>, ok?: string) => {
    setBusy(true); setMsg(null);
    const r = await call(payload);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Something went wrong." });
    if (ok) setMsg({ ok: true, text: ok });
    router.refresh();
  };

  if (status === "off") return <Card><CardTitle>Sharing</CardTitle><p className="text-sm text-muted">Sharing needs sign-in. Prototype mode has no accounts.</p></Card>;
  if (status === "error" || !membership) return <Card><CardTitle>Sharing</CardTitle><p role="alert" className="text-sm text-danger">Could not load your sharing settings. Reload in a moment.</p></Card>;

  const owner = membership.role === "owner";
  const others = membership.members.filter((m) => m.uid !== uid);
  const solo = others.length === 0;

  return (
    <Card className="space-y-4">
      <CardTitle action={!solo ? <Badge tone="good">Shared</Badge> : <Badge>Just you</Badge>}>{solo ? "Share with your partner" : "Sharing"}</CardTitle>
      {solo ? (
        <p className="text-sm text-muted">Everything here is yours alone. When you want to split expenses, invite your partner by email. They sign in with that Google account and choose to join, so there is no code to send. Only what you split is shared.</p>
      ) : (
        <ul className="divide-y divide-border">
          {membership.members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{m.displayName}{m.uid === uid && <span className="text-muted"> (you)</span>}</div><div className="truncate text-xs text-muted">{m.email}</div></div>
              <div className="flex items-center gap-2"><Badge tone={m.role === "owner" ? "good" : "neutral"}>{m.role === "owner" ? "Owner" : "Partner"}</Badge>
                {owner && m.role !== "owner" && <Button disabled={busy} onClick={() => { if (confirm(`Stop sharing with ${m.displayName}? They will lose access to this space.`)) run({ action: "remove", uid: m.uid }); }}>Remove</Button>}</div>
            </li>
          ))}
        </ul>
      )}
      {owner && (
        <div className="space-y-3 border-t border-border pt-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "invite", email }, `Invitation saved for ${email}. Ask them to sign in with that email.`).then(() => setEmail("")); }}>
            <Field label={solo ? "Your partner's Google email" : "Invite someone else"}><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" /></Field>
            <Button type="submit" variant={solo ? "primary" : "ghost"} disabled={busy || !email.includes("@")}>Send invitation</Button>
          </form>
          {membership.invites.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Waiting to join</div>
              <ul className="space-y-1">{membership.invites.map((i) => (
                <li key={i.hash} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{i.email} <span className="text-xs text-muted">expires {i.expiresAt.slice(0, 10)}</span></span>
                  <Button disabled={busy} onClick={() => run({ action: "revoke", hash: i.hash })}>Cancel</Button></li>
              ))}</ul>
              <p className="mt-2 text-xs text-muted">They need to be allowed to sign in to this app (their email must be on the access list) before they can accept.</p>
            </div>
          )}
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>}
    </Card>
  );
}
