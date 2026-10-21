"use client";
// Shared pieces of the Split Groups screens: the occasion icons, the create/edit dialog and the way a balance is worded.
import { Archive, ArchiveRestore, PartyPopper, Plane, Tent, Trash2, Users, Utensils, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { checkSplitGroup, peopleInUse, SPLIT_GROUP_NAME_MAX } from "@/domain/split-groups";
import { SPLIT_GROUP_KINDS, type SplitGroup, type SplitGroupKind } from "@/domain/types";
import { Dot, PersonGlyph } from "./glyphs";
import { Button, CompactChips, ConfirmDialog, Dialog, FormRow, Input } from "./ui";

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
      <FormRow label="Payments" tip={SIMPLIFY_TIP}><SimplifySwitch on={simplify} onChange={setSimplify} /></FormRow>
      {(error || (problem && name)) && <p role="alert" className="text-xs text-danger">{error ?? problem}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="primary" className="w-full sm:order-last sm:ml-auto sm:w-auto" disabled={!!problem} onClick={save}>{group ? "Save" : "Create group"}</Button>
        {group && <Button className="border-0" onClick={() => { archiveSplitGroup(group.id, true); onClose(); }}><Archive size={15} aria-hidden />Archive</Button>}
        {empty && <Button variant="danger" className="border-0" onClick={() => setDeleting(true)} aria-label="Delete group"><Trash2 size={15} aria-hidden />Delete</Button>}
        {!group && <Button className="border-0" onClick={onClose}>Cancel</Button>}
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

export const SIMPLIFY_TIP = "On: the fewest payments settle the group, even if that means paying someone who did not pay for you (A owes B, B owes C, so A pays C). Off: everyone pays back exactly the people who paid for them. Balances are the same either way.";

/** The "Simplify payments" switch, as a labelled row. */
export function SimplifySwitch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 text-left transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Simplify payments</span><span className="block text-xs text-muted">{on ? "Fewest payments to settle everyone" : "Pay back exactly who paid for you"}</span></span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.15rem]" : "left-0.5"}`} /></span>
    </button>
  );
}
