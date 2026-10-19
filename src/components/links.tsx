"use client";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useHousehold } from "@/components/household-context";
import { PersonGlyph } from "@/components/glyphs";
import { Badge, Button, Card, CardTitle, ConfirmDialog, Select } from "@/components/ui";
import { pairBalances } from "@/domain/balances";
import { formatINR } from "@/domain/money";
import { computeShares } from "@/domain/splits";
import { sharedToRecord } from "@/domain/sharing";
import type { LinkView } from "@/lib/links/service";

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; found?: number }> {
  try {
    const res = await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false, error: "Network problem. Try again." };
  }
}

/** Runs a link action, shows its message, and refreshes the server data. */
export function useLinkActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (payload: Record<string, unknown>, okText: (r: { found?: number }) => string) => {
    setBusy(true); setMsg(null);
    const r = await call(payload);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText(r) } : { ok: false, text: r.error ?? "Something went wrong." });
    if (r.ok) router.refresh();
  };
  return { busy, msg, run };
}

/**
 * Friends & Family: accounts that signed in with an email you saved for a contact. Nothing is linked until you say yes, and
 * a link only ever shows that person the expenses you split with them (their share, who paid, payments between you two).
 */
export function LinkProposals() {
  const { linkData, status, membership } = useHousehold();
  const { busy, msg, run } = useLinkActions();
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (status !== "ok" || !membership) return null;
  return (
    <div className="space-y-2">
      {linkData.proposals.map((p) => {
        const choice = picked[p.key] ?? (p.conflict ? "" : p.contacts[0].id);
        return (
          <div key={p.key} className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
            <div className="flex items-start gap-2"><Link2 size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" /><div>{p.conflict ? "Someone signed up with an email you saved for more than one contact. Which contact is it?" : <><b>{p.contacts[0].name}</b> has an account with the email you saved. Link it?</>}</div></div>
            {p.conflict && (
              <Select aria-label="Which contact is this?" value={choice} onChange={(e) => setPicked({ ...picked, [p.key]: e.target.value })}>
                <option value="">Choose the right contact…</option>
                {p.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>)}
              </Select>
            )}
            <p className="text-xs text-muted">They will see only the expenses you split with them: their share, who paid, and payments between you two. Nothing else, and your own transactions are not changed. You can unlink any time.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={busy} onClick={() => run({ action: "decline", key: p.key }, () => "Okay, not linking.")}>Not now</Button>
              <Button variant="primary" disabled={busy || !choice} onClick={() => run({ action: "confirm", key: p.key, contactId: choice }, () => "Linked. Expenses you split with them now show on their side.")}>Link</Button>
            </div>
          </div>
        );
      })}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>}
    </div>
  );
}

/** "Check for accounts": re-runs the match for your own sign-in email (for example after you verified it). */
export function CheckLinksButton() {
  const { busy, msg, run } = useLinkActions();
  return (
    <div className="space-y-1">
      <Button disabled={busy} onClick={() => run({ action: "check" }, (r) => (r.found ? "Someone saved your email. Check Friends & Family or the People page to see who." : "Nobody has saved your verified email as a contact."))}>Look for people who saved my email</Button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-muted" : "text-xs text-danger"}>{msg.text}</p>}
    </div>
  );
}

/** Unlink (with a confirm dialog) for a linked contact. History stays; only syncing stops. */
export function UnlinkButton({ linkKey, name }: { linkKey: string; name: string }) {
  const { busy, msg, run } = useLinkActions();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button disabled={busy} onClick={() => setOpen(true)}>Unlink</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title={`Unlink ${name}?`} confirmLabel="Unlink" onConfirm={() => run({ action: "unlink", key: linkKey }, () => "Unlinked. Past shared expenses stay as history; nothing new is shared.")}>
        <p>New and edited expenses stop reaching {name}. What was already shared stays visible to both of you as history, and your own transactions are not touched. Linking again later needs a fresh confirmation.</p>
      </ConfirmDialog>
      {msg && !msg.ok && <p role="alert" className="text-xs text-danger">{msg.text}</p>}
    </>
  );
}

function LinkCard({ l }: { l: LinkView }) {
  const rows = useMemo(() => l.shared.map(sharedToRecord), [l.shared]);
  const net = useMemo(() => {
    const b = pairBalances(rows, l.settlements)[0];
    if (!b || b.outstanding === 0) return 0;
    return b.to === l.me ? b.outstanding : -b.outstanding; // + = they owe me
  }, [rows, l.settlements, l.me]);
  const myShare = (i: number) => computeShares(rows[i].amountPaise, rows[i].split)[l.me] ?? 0;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <PersonGlyph name={l.other.name} id={l.other.uid} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{l.other.name}</div>
          <div className="text-xs text-muted">{l.live ? "Linked account" : "Unlinked: history only"}</div>
        </div>
        <div className="text-right">
          <div className={`num font-semibold ${net > 0 ? "text-good" : ""}`}>{net === 0 ? "₹0" : formatINR(Math.abs(net))}</div>
          <div className="text-xs text-muted">{net === 0 ? "even" : net > 0 ? `${l.other.name} owes you` : "you owe"}</div>
        </div>
      </div>
      {l.shared.length === 0 ? <p className="text-sm text-muted">Nothing shared yet. Expenses split between you two will appear here.</p> : (
        <ul className="divide-y divide-border text-sm">
          {l.shared.slice(0, 20).map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0"><div className="truncate font-medium">{s.merchant}</div><div className="text-xs text-muted">{s.date} · {s.categoryName} · paid by {s.payerId === l.me ? "you" : l.other.name}</div></div>
              <div className="num text-right"><div>{formatINR(myShare(i))}</div><div className="text-xs text-muted">your share</div></div>
            </li>
          ))}
        </ul>
      )}
      {l.settlements.length > 0 && <p className="text-xs text-muted">{l.settlements.filter((s) => !s.voided).length} payment(s) between you two are counted above.</p>}
      <p className="text-xs text-muted">You see only your share, who paid, and payments between you two. Not the full bill, other people, accounts or notes.</p>
      {l.live && <UnlinkButton linkKey={l.key} name={l.other.name} />}
    </Card>
  );
}

/** People who share expenses with you through a linked account (and your own links), as read-only history. */
export function LinkedWithYou() {
  const { linkData } = useHousehold();
  if (linkData.links.length === 0) return null;
  return (
    <div className="mb-4 space-y-3">
      <CardTitle action={<Badge>Read only</Badge>}>Shared through linked accounts</CardTitle>
      {linkData.links.map((l) => <LinkCard key={l.key} l={l} />)}
    </div>
  );
}
