"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHousehold } from "@/components/household-context";
import { Badge, Button, Card, CardTitle, Field, Input } from "@/components/ui";

async function call(payload: Record<string, string>): Promise<{ ok: boolean; error?: string; code?: string; expiresAt?: string }> {
  try {
    const res = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false, error: "Network problem. Try again." };
  }
}

export function HouseholdCard() {
  const { membership, status, uid } = useHousehold();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState<{ email: string; code: string; expiresAt: string } | null>(null);

  const run = async (payload: Record<string, string>, after?: (r: Awaited<ReturnType<typeof call>>) => void) => {
    setBusy(true);
    setMsg(null);
    const r = await call(payload);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Something went wrong." });
    after?.(r);
    router.refresh(); // reload the server-side membership
  };

  if (status === "off") return <Card><CardTitle>Household</CardTitle><p className="text-sm text-muted">Households need sign-in. Prototype mode has no accounts.</p></Card>;
  if (status === "error") return <Card><CardTitle>Household</CardTitle><p role="alert" className="text-sm text-danger">Could not load your household. Check the server log and that Firestore is available.</p></Card>;

  if (!membership) {
    return (
      <Card className="space-y-4">
        <CardTitle>Household</CardTitle>
        <p className="text-sm text-muted">You are not in a household yet. Create one, or join with a code your partner sent you.</p>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "create", name }); }}>
          <Field label="Household name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our home" maxLength={60} /></Field>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Create household</Button>
        </form>
        <div className="border-t border-border pt-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "join", code }); }}>
            <Field label="Have an invite code?"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" /></Field>
            <Button type="submit" disabled={busy || code.trim().length < 10}>Join household</Button>
          </form>
        </div>
        {msg && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
      </Card>
    );
  }

  const owner = membership.role === "owner";
  return (
    <Card className="space-y-4">
      <CardTitle action={<Badge tone={owner ? "good" : "neutral"}>{owner ? "Owner" : "Member"}</Badge>}>{membership.household.name}</CardTitle>
      <ul className="divide-y divide-border">
        {membership.members.map((m) => (
          <li key={m.uid} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0"><div className="truncate font-medium">{m.displayName}{m.uid === uid && <span className="text-muted"> (you)</span>}</div><div className="truncate text-xs text-muted">{m.email}</div></div>
            <div className="flex items-center gap-2"><Badge tone={m.role === "owner" ? "good" : "neutral"}>{m.role}</Badge>
              {owner && m.role !== "owner" && <Button disabled={busy} onClick={() => { if (confirm(`Remove ${m.displayName} from the household?`)) run({ action: "remove", uid: m.uid }); }}>Remove</Button>}</div>
          </li>
        ))}
      </ul>
      {owner && (
        <div className="space-y-3 border-t border-border pt-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ action: "invite", email }, (r) => { setFresh({ email, code: r.code ?? "", expiresAt: r.expiresAt ?? "" }); setEmail(""); }); }}>
            <Field label="Invite someone by email"><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" /></Field>
            <Button type="submit" disabled={busy || !email.includes("@")}>Create invite code</Button>
          </form>
          {fresh && (
            <div role="status" className="rounded-xl bg-accent-soft p-3 text-sm">
              <div>Invite for <b>{fresh.email}</b> (valid 7 days). Share this code privately. It is shown only now:</div>
              <div className="mt-1 flex items-center gap-2"><code className="num text-lg font-semibold tracking-wider">{fresh.code}</code>
                <Button onClick={() => navigator.clipboard?.writeText(fresh.code)}>Copy</Button></div>
              <div className="mt-1 text-xs text-muted">They must sign in with that exact email, open Settings, and choose “Join household”.</div>
            </div>
          )}
          {membership.invites.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Pending invites</div>
              <ul className="space-y-1">{membership.invites.map((i) => (
                <li key={i.hash} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{i.email} <span className="text-xs text-muted">expires {i.expiresAt.slice(0, 10)}</span></span>
                  <Button disabled={busy} onClick={() => run({ action: "revoke", hash: i.hash })}>Revoke</Button></li>
              ))}</ul>
            </div>
          )}
        </div>
      )}
      {msg && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
    </Card>
  );
}
