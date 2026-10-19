"use client";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useHousehold } from "@/components/household-context";
import { PersonGlyph } from "@/components/glyphs";
import { Badge, Button, Card, CardTitle, ChipGroup, ConfirmDialog, Dialog, Field, Input, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { undoableIds } from "@/domain/audit";
import { pairBalances } from "@/domain/balances";
import { formatINR, parseRupees } from "@/domain/money";
import { computeShares } from "@/domain/splits";
import { sharedToRecord } from "@/domain/sharing";
import type { SharedExpense } from "@/domain/types";
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
  const run = async (payload: Record<string, unknown>, okText: (r: { found?: number }) => string): Promise<boolean> => {
    setBusy(true); setMsg(null);
    const r = await call(payload);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText(r) } : { ok: false, text: r.error ?? "Something went wrong." });
    router.refresh(); // also after a refusal: the screen then shows what the other person changed
    return r.ok;
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

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Edit one shared expense. Either linked person may; the server refuses a stale save and writes the change through to the owner's ledger. */
function EditDialog({ l, s, onClose }: { l: LinkView; s: SharedExpense; onClose: () => void }) {
  const { categories, today } = useStore();
  const router = useRouter();
  const nameFor = (id: string) => (id === l.me ? "You" : id === `u_${l.other.uid}` ? l.other.name : s.people?.[id] ?? "Someone");
  const ids = [...new Set([s.payerId, ...s.split.participantIds, ...(s.split.items ?? []).flatMap((i) => i.participantIds)])];
  const shares = computeShares(s.amountPaise, s.split);
  const [merchant, setMerchant] = useState(s.merchant);
  const [amount, setAmount] = useState((s.amountPaise / 100).toFixed(2));
  const [date, setDate] = useState(s.date);
  const [category, setCategory] = useState(s.categoryName);
  const [payer, setPayer] = useState(s.payerId);
  const [mode, setMode] = useState<"keep" | "equal" | "custom">("keep");
  const [custom, setCustom] = useState<Record<string, string>>(Object.fromEntries(ids.map((id) => [id, ((shares[id] ?? 0) / 100).toFixed(2)])));
  const [note, setNote] = useState(s.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paise = parseRupees(amount);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (merchant.trim() !== s.merchant) patch.merchant = merchant.trim();
    if (paise === null || paise <= 0) return setError("Enter a valid amount.");
    if (paise !== s.amountPaise) patch.amountPaise = paise;
    if (date !== s.date) patch.date = date;
    if (category !== s.categoryName) patch.categoryName = category;
    if (payer !== s.payerId) patch.payerId = payer;
    if (s.note !== undefined && note.trim() !== (s.note ?? "")) patch.note = note.trim() || null;
    if (mode === "equal") patch.split = { mode: "equal", participantIds: s.split.participantIds };
    if (mode === "custom") {
      const values = Object.fromEntries(s.split.participantIds.map((id) => [id, parseRupees(custom[id] ?? "0") ?? 0]));
      patch.split = { mode: "custom", participantIds: s.split.participantIds, values };
    }
    if (Object.keys(patch).length === 0) return onClose();
    setBusy(true); setError(null);
    const r = await call({ action: "edit", key: l.key, id: s.id, ifVersion: s.version ?? 0, patch });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save."); router.refresh(); return; }
    router.refresh(); onClose();
  };
  const names = new Set(categories.map((c) => c.name));
  return (
    <Dialog open onClose={onClose} title={`Edit ${s.merchant}`}>
      <div className="space-y-3 pb-1 text-sm">
        <p className="rounded-xl bg-background p-3 text-xs text-muted">This is one shared expense: your change also updates it for {l.other.name}, and is logged with your name. If they changed it first, your save is refused and nothing is overwritten.</p>
        <Field label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <p className="-mt-1 text-xs text-muted">Amount and date can only change for expenses that were typed in by hand, not for ones read from a bank statement.</p>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {!names.has(s.categoryName) && <option value={s.categoryName}>{s.categoryName}</option>}
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Paid by"><Select value={payer} onChange={(e) => setPayer(e.target.value)}>{ids.map((id) => <option key={id} value={id}>{nameFor(id)}</option>)}</Select></Field>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted">Split</div>
          <ChipGroup label="Split" options={[{ id: "keep", label: "Keep" }, { id: "equal", label: "Equal" }, { id: "custom", label: "Amounts" }]} value={mode} onChange={(m) => setMode(m as typeof mode)} />
          {mode === "custom" && s.split.participantIds.map((id) => (
            <label key={id} className="flex items-center justify-between gap-3"><span>{nameFor(id)}</span><Input className="max-w-32 text-right" inputMode="decimal" value={custom[id] ?? ""} onChange={(e) => setCustom({ ...custom, [id]: e.target.value })} /></label>
          ))}
          {mode === "keep" && <ul className="rounded-xl bg-background p-3 text-xs">{Object.entries(shares).map(([id, v]) => <li key={id} className="flex justify-between"><span>{nameFor(id)}</span><span className="num">{formatINR(v)}</span></li>)}</ul>}
        </div>
        {s.note !== undefined && <Field label="Note (shown to both of you)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>Save</Button></div>
      </div>
    </Dialog>
  );
}

function PaymentDialog({ l, onClose }: { l: LinkView; onClose: () => void }) {
  const { today } = useStore();
  const { busy, msg, run } = useLinkActions();
  const [dir, setDir] = useState<"paid" | "received">("paid");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const paise = parseRupees(amount);
  return (
    <Dialog open onClose={onClose} title="Record a payment">
      <div className="space-y-3 pb-1 text-sm">
        <p className="rounded-xl bg-background p-3 text-xs text-muted">A payment between the two of you. It only reduces what is owed; it never creates an expense. It appears in both ledgers and in the log.</p>
        <ChipGroup label="Who paid" options={[{ id: "paid", label: `I paid ${l.other.name}` }, { id: "received", label: `${l.other.name} paid me` }]} value={dir} onChange={(v) => setDir(v as typeof dir)} />
        <Field label="Amount (₹)" error={amount && (paise === null || paise <= 0) ? "Enter a valid amount." : null}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        {msg && !msg.ok && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || paise === null || paise <= 0} onClick={() => void run({ action: "pay", key: l.key, id: crypto.randomUUID(), date: today, amountPaise: paise, direction: dir, note: note.trim() || undefined }, () => "Payment recorded.").then((ok) => ok && onClose())}>Save</Button>
        </div>
      </div>
    </Dialog>
  );
}

function LinkCard({ l }: { l: LinkView }) {
  const router = useRouter();
  const { busy, msg, run } = useLinkActions();
  const [editing, setEditing] = useState<SharedExpense | null>(null);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const rows = useMemo(() => l.shared.map(sharedToRecord), [l.shared]);
  const net = useMemo(() => {
    const them = `u_${l.other.uid}`; // other people in a group expense are not part of this balance
    const b = pairBalances(rows, l.settlements).find((x) => [x.from, x.to].includes(l.me) && [x.from, x.to].includes(them));
    if (!b || b.outstanding === 0) return 0;
    return b.to === l.me ? b.outstanding : -b.outstanding; // + = they owe me
  }, [rows, l.settlements, l.me]);
  const undoable = useMemo(() => (l.live ? undoableIds(l.audit) : new Set<string>()), [l.audit, l.live]);
  const who = (uid: string) => (uid === l.me.slice(2) ? "You" : l.names[uid] ?? "Someone");
  const nameIn = (s: SharedExpense, id: string) => (id === l.me ? "You" : id === `u_${l.other.uid}` ? l.other.name : s.people?.[id] ?? "Someone");
  const events = [...l.audit].reverse().slice(0, 12);
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
      {l.shared.length === 0 ? <p className="text-sm text-muted">Nothing shared yet. Expenses you both take part in will appear here.</p> : (
        <ul className="divide-y divide-border text-sm">
          {l.shared.slice(0, 20).map((s) => {
            const sh = computeShares(s.amountPaise, s.split);
            const canEdit = l.live && l.activeOwners.includes(s.ownerUid);
            return (
              <li key={s.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{s.merchant}</span><span className="block text-xs text-muted">{s.date} · {s.categoryName} · paid by {nameIn(s, s.payerId)}</span></span>
                    <span className="num text-right"><span className="block">{formatINR(s.amountPaise)}</span><span className="block text-xs text-muted">your share {formatINR(sh[l.me] ?? 0)}</span></span>
                  </summary>
                  <div className="mt-2 space-y-2 rounded-xl bg-background p-3 text-xs">
                    <ul className="space-y-0.5">{Object.entries(sh).map(([id, v]) => <li key={id} className="flex justify-between"><span>{nameIn(s, id)}</span><span className="num">{formatINR(v)}</span></li>)}</ul>
                    {s.note && <p className="text-muted">Note: {s.note}</p>}
                    {canEdit ? <Button onClick={() => setEditing(s)}>Edit</Button> : <p className="text-muted">{l.live ? "Only changes made by the people in it are possible here." : "This link has ended, so it can no longer be changed."}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {l.withdrawn.length > 0 && <p className="text-xs text-muted">{l.withdrawn.length} expense{l.withdrawn.length === 1 ? "" : "s"} withdrawn by {l.withdrawn.length === 1 ? "its owner" : "their owners"}: not counted, kept in the log below.</p>}
      <div className="space-y-1">
        <div className="flex items-center justify-between"><div className="text-xs font-medium text-muted">Payments between you</div>{l.live && <Button onClick={() => setPaying(true)}>Record a payment</Button>}</div>
        {l.settlements.length === 0 ? <p className="text-xs text-muted">None yet.</p> : (
          <ul className="divide-y divide-border text-sm">
            {[...l.settlements].reverse().map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className={p.voided ? "text-muted line-through" : ""}>{p.fromId === l.me ? "You" : l.other.name} → {p.toId === l.me ? "you" : l.other.name} <b className="num">{formatINR(p.amountPaise)}</b><span className="block text-xs text-muted">{p.date}{p.note ? ` · ${p.note}` : ""}</span></span>
                {p.voided ? <Badge>Voided</Badge> : l.live ? <Button variant="danger" onClick={() => setVoiding(p.id)}>Void</Button> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted">Activity log ({l.audit.length})</summary>
        <ul className="mt-2 divide-y divide-border text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 py-1.5">
              <span><b>{who(e.actorId)}</b> · {e.summary}<span className="block text-muted">{when(e.at)}</span></span>
              {undoable.has(e.id) && <Button disabled={busy} onClick={() => void run({ action: "undo", key: l.key, eventId: e.id }, () => "Undone.")}>Undo</Button>}
            </li>
          ))}
        </ul>
      </details>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-good" : "text-xs text-danger"}>{msg.text}</p>}
      <p className="text-xs text-muted">You see the full expense because you both take part in it: merchant, date, amount, category, who paid and how it is split. Never bank text, accounts or cards, or anything else about the other person&apos;s money.</p>
      {l.live && <UnlinkButton linkKey={l.key} name={l.other.name} />}
      {editing && <EditDialog l={l} s={editing} onClose={() => { setEditing(null); router.refresh(); }} />}
      {paying && <PaymentDialog l={l} onClose={() => setPaying(false)} />}
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this payment?" confirmLabel="Void it" onConfirm={() => voiding && void run({ action: "voidPayment", key: l.key, id: voiding }, () => "Voided.")}>
        <p>It stops counting for both of you, so the amount owed goes back up. It stays in the log as voided.</p>
      </ConfirmDialog>
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
