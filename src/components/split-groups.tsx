"use client";
// Shared pieces of the Split Groups screens: the occasion icons, the create/edit dialog and the way a balance is worded.
import { Archive, ArchiveRestore, PartyPopper, Plane, Tent, Trash2, Users, Utensils, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { checkSplitGroup, peopleInUse, SPLIT_GROUP_NAME_MAX, type Transfer } from "@/domain/split-groups";
import { SPLIT_GROUP_KINDS, type SplitGroup, type SplitGroupKind } from "@/domain/types";
import { Dot, PersonGlyph } from "./glyphs";
import { cn } from "@/lib/cn";
import { Button, CompactChips, ConfirmDialog, Dialog, FormRow, InfoTip, Input } from "./ui";

export const KIND_META: Record<SplitGroupKind, { label: string; icon: LucideIcon; tone: string }> = {
  trip: { label: "Trip", icon: Plane, tone: "bg-sky-100 text-sky-700" },
  outing: { label: "Outing", icon: Tent, tone: "bg-emerald-100 text-emerald-700" },
  party: { label: "Party", icon: PartyPopper, tone: "bg-pink-100 text-pink-700" },
  dinner: { label: "Dinner", icon: Utensils, tone: "bg-orange-100 text-orange-700" },
  other: { label: "Other", icon: Users, tone: "bg-slate-100 text-slate-600" },
};

export function KindGlyph({ kind, size = 40 }: { kind: SplitGroupKind; size?: number }) {
  const m = KIND_META[kind];
  return <Dot icon={m.icon} tone={m.tone} size={size} />;
}

/** "gets back ₹500", "owes ₹250" or "settled", with the tone to show it in. */
export function balanceWords(paise: number): { text: string; tone: string; amount: string } {
  if (paise === 0) return { text: "settled", tone: "text-muted", amount: "₹0" };
  return paise > 0 ? { text: "gets back", tone: "text-good", amount: formatINR(paise) } : { text: "owes", tone: "text-danger", amount: formatINR(-paise) };
}

/** Overlapping faces of the people in a group (first few, then a count). */
export function PersonStack({ ids, max = 4, size = 24 }: { ids: string[]; max?: number; size?: number }) {
  const { nameOf } = useStore();
  const shown = ids.slice(0, max);
  return (
    <span className="flex items-center" aria-label={ids.map(nameOf).join(", ")}>
      {shown.map((id, i) => <span key={id} className={`rounded-full ring-2 ring-surface ${i ? "-ml-1.5" : ""}`}><PersonGlyph name={nameOf(id)} id={id} size={size} /></span>)}
      {ids.length > max && <span className="-ml-1.5 grid place-items-center rounded-full bg-background px-1.5 text-xs font-medium text-muted ring-2 ring-surface" style={{ height: size, minWidth: size }}>+{ids.length - max}</span>}
    </span>
  );
}

/** Create a group (no `group`) or change one. Archive and delete of an existing group live here too, so the group page stays uncrowded. */
export function GroupDialog({ open, onClose, group, onSaved }: { open: boolean; onClose: () => void; group?: SplitGroup; onSaved?: (id: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={group ? "Edit group" : "New group"}>
      {open && <GroupForm key={group?.id ?? "new"} group={group} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function GroupForm({ group, onClose, onSaved }: { group?: SplitGroup; onClose: () => void; onSaved?: (id: string) => void }) {
  const { participants, meId, nameOf, splitGroups, splitSettlements, records, staged, saveSplitGroup, archiveSplitGroup, deleteSplitGroup, addParticipant } = useStore();
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [kind, setKind] = useState<SplitGroupKind>(group?.kind ?? "trip");
  const [others, setOthers] = useState<string[]>(group?.participantIds.filter((id) => id !== meId) ?? []);
  const [note, setNote] = useState(group?.note ?? "");
  const [simplify, setSimplify] = useState(group?.simplifyDebts !== false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ids = [meId, ...others];
  const live = useMemo(() => splitGroups.filter((g) => g.id !== group?.id), [splitGroups, group]);
  const problem = checkSplitGroup({ name, participantIds: ids }, live);
  const inUse = useMemo(() => (group ? peopleInUse(group.id, [...records, ...staged], splitSettlements) : new Set<string>()), [group, records, staged, splitSettlements]);
  const empty = !!group && inUse.size === 0;
  const contacts = participants.filter((p) => p.id !== meId);
  const toggle = (id: string) => {
    setError(null);
    if (others.includes(id) && inUse.has(id)) { setError(`${nameOf(id)} has expenses or payments in this group, so they cannot be removed.`); return; }
    setOthers(others.includes(id) ? others.filter((x) => x !== id) : [...others, id]);
  };
  const save = () => {
    const r = saveSplitGroup({ id: group?.id, name, kind, participantIds: ids, note, simplifyDebts: simplify });
    if (r.error) { setError(r.error); return; }
    onSaved?.(r.id!);
    onClose();
  };
  return (
    <div className="space-y-3 pb-1">
      <FormRow label="Name"><Input aria-label="Group name" autoFocus={!group} value={name} maxLength={SPLIT_GROUP_NAME_MAX} placeholder="e.g. Goa trip, Anna's birthday" onChange={(e) => { setName(e.target.value); setError(null); }} /></FormRow>
      <FormRow label="Kind"><CompactChips label="Kind of group" options={SPLIT_GROUP_KINDS.map((k) => ({ id: k, label: KIND_META[k].label, icon: <KindGlyph kind={k} size={24} /> }))} selected={[kind]} onPick={setKind} /></FormRow>
      <FormRow label="People" tip="Pick from your Friends & Family contacts. They do not need an account. You are always in the group.">
        <CompactChips multi label="People in the group" options={contacts.map((p) => ({ id: p.id, label: p.pendingEmail ? `${p.name} (invited)` : p.name, icon: <PersonGlyph name={p.name} id={p.id} /> }))} selected={others} onPick={toggle}
          adder={{ label: "Add a contact", placeholder: "Name, e.g. Karthik", add: (n) => { const r = addParticipant(n); if (r.id) setOthers((o) => [...o, r.id!]); return r; } }} />
        <p className="mt-1.5 text-xs text-muted">You and {others.length} {others.length === 1 ? "other" : "others"}.</p>
      </FormRow>
      <FormRow label="Note"><Input aria-label="Note" value={note} maxLength={200} placeholder="Optional, e.g. 12-15 Nov" onChange={(e) => setNote(e.target.value)} /></FormRow>
      <SimplifySwitch on={simplify} onChange={setSimplify} />
      {(error || (problem && name)) && <p role="alert" className="text-xs text-danger">{error ?? problem}</p>}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!group && <Button onClick={onClose}>Cancel</Button>}
        {group && <Button className="border-0" onClick={() => { archiveSplitGroup(group.id, true); onClose(); }}><Archive size={15} aria-hidden />Archive</Button>}
        {empty && <Button variant="danger" className="border-0" onClick={() => setDeleting(true)} aria-label="Delete group"><Trash2 size={15} aria-hidden />Delete</Button>}
        <Button variant="primary" className="flex-1 sm:ml-auto sm:flex-none" disabled={!!problem} onClick={save}>{group ? "Save" : "Create group"}</Button>
      </div>
      {group && (
        <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} title="Delete this group?" onConfirm={() => { const err = deleteSplitGroup(group.id); if (err) { setError(err); return; } onClose(); router.push("/groups"); }}>
          <p><strong>{group.name}</strong> has no expenses or payments yet.</p>
          <p className="text-muted">The group is removed. Your contacts are not affected. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Reopen button for an archived group. */
export function ReopenButton({ id }: { id: string }) {
  const { archiveSplitGroup } = useStore();
  return <Button onClick={() => archiveSplitGroup(id, false)}><ArchiveRestore size={15} aria-hidden />Reopen</Button>;
}

export const SIMPLIFY_TIP = "On: the group settles with the fewest payments, so you may pay someone who didn't pay for you. For example, if A owes B and B owes C, A pays C directly. Off: everyone pays back exactly the people who paid for them. Balances are the same either way.";

/** The "Simplify payments" switch: a title with a help icon, one line of what it does now, and the switch. */
export function SimplifySwitch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface py-1.5 pl-3.5 pr-3", disabled && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-0.5 text-sm font-medium">Simplify payments<InfoTip text={SIMPLIFY_TIP} /></div>
        <div className="text-xs text-muted">{on ? "Fewest payments to settle up" : "Everyone pays back who paid for them"}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label="Simplify payments" disabled={disabled} onClick={() => onChange(!on)} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed", on ? "bg-accent" : "bg-border")}>
        <span aria-hidden className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

/** The "Record a payment" dialog for one split group. `preset` is a suggested payment, or "new" for an empty form. */
export function SettleDialog({ group, preset, onClose, onDone }: { group: SplitGroup; preset: Transfer | "new" | null; onClose: () => void; onDone: (msg: string) => void }) {
  return (
    <Dialog open={!!preset} onClose={onClose} title="Record a payment">
      {preset && <SettleForm key={preset === "new" ? "new" : `${preset.fromId}-${preset.toId}`} group={group} preset={preset === "new" ? null : preset} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

export function SettleForm({ group, preset, onClose, onDone }: { group: SplitGroup; preset: Transfer | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { nameOf, meId, today, addSplitSettlement } = useStore();
  const [from, setFrom] = useState(preset?.fromId ?? group.participantIds.find((p) => p !== meId) ?? meId);
  const [to, setTo] = useState(preset?.toId ?? meId);
  const [amount, setAmount] = useState(preset ? (preset.amountPaise / 100).toFixed(2) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupees(amount);
  const bad = from === to ? "Pick two different people." : paise === null || paise <= 0 ? "Enter an amount." : null;
  const people = group.participantIds.map((id) => ({ id, label: id === meId ? "You" : nameOf(id), icon: <PersonGlyph name={nameOf(id)} id={id} /> }));
  const save = () => {
    const err = addSplitSettlement({ groupId: group.id, fromId: from, toId: to, amountPaise: paise!, date: today, note: note.trim() || undefined });
    if (err) { setError(err); return; }
    onDone(`${nameOf(from)} paid ${nameOf(to)} ${formatINR(paise!)}`);
    onClose();
  };
  return (
    <div className="space-y-3 pb-1">
      <FormRow label="Paid by"><CompactChips label="Paid by" options={people} selected={[from]} onPick={setFrom} /></FormRow>
      <FormRow label="Paid to"><CompactChips label="Paid to" options={people} selected={[to]} onPick={setTo} /></FormRow>
      <FormRow label="Amount"><span className="flex items-center gap-1.5"><span className="text-lg font-semibold text-accent">₹</span><Input aria-label="Amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} /></span></FormRow>
      <FormRow label="Note"><Input aria-label="Note" value={note} maxLength={200} placeholder="Optional, e.g. UPI" onChange={(e) => setNote(e.target.value)} /></FormRow>
      <p className="text-xs text-muted">This records a payment between two people in {group.name}. It does not create an expense.{from === meId || to === meId ? " Because it involves you, it also appears under People." : ""}</p>
      {(error || (amount && bad)) && <p role="alert" className="text-xs text-danger">{error ?? bad}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!!bad} onClick={save}>Save payment</Button>
      </div>
    </div>
  );
}
