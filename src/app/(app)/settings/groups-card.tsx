"use client";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { PersonGlyph } from "@/components/glyphs";
import { SortableList } from "@/components/sortable";
import { Badge, Button, Card, CardTitle, CompactChips, ConfirmDialog, Dialog, Field, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import type { PaymentGroup } from "@/domain/types";

/** Your own Payment Groups: lenses on spending (Mine, Wife & Me, Parents…). Set up per profile; nothing is built in for anyone else. */
export function GroupsCard() {
  const { groups, participants, meId, saveGroup, deleteGroup, reorderGroups, addStarterGroups, addParticipant, nameOf } = useStore();
  const [dlg, setDlg] = useState<{ group?: PaymentGroup } | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [cover, setCover] = useState(false);
  const [includeMe, setIncludeMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PaymentGroup | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const isMine = dlg?.group?.kind === "mine";
  const others = participants.filter((p) => p.id !== meId);
  const saved = groups.filter((g) => !(g.id === "mine" && g.kind === "mine" && g.order === -1));

  const open = (group?: PaymentGroup) => {
    setDlg({ group }); setError(null);
    setName(group?.name ?? ""); setMembers(group?.memberIds.filter((m) => m !== meId) ?? []); setCover(group?.coverMembers ?? false); setIncludeMe(group?.includeMe ?? true);
  };
  const save = () => {
    const err = saveGroup({ id: dlg?.group?.id, name, kind: dlg?.group?.kind ?? "people", memberIds: isMine ? [] : includeMe ? [meId, ...members] : members, coverMembers: cover, includeMe });
    if (err) setError(err); else setDlg(null);
  };
  const describe = (g: PaymentGroup) => g.kind === "mine"
    ? "Your own share, plus what you pay for people you cover"
    : g.memberIds.length === 0 ? "No contacts yet" : g.memberIds.filter((m) => m !== meId).map((m) => nameOf(m)).join(", ") + (g.includeMe ? " and you" : "") + (g.coverMembers ? " · you cover them" : "");

  return (
    <Card className="space-y-3">
      <CardTitle tip="A view of your spending, like Mine or Parents. Switch views at the top of any screen. Shares are never counted twice." action={<span className="text-xs text-muted">{saved.length} set up</span>}>Your spending views</CardTitle>
      <SortableList className="space-y-1 text-sm" ids={groups.map((g) => g.id)} label="spending view" onReorder={(ids) => reorderGroups(ids)}>
        {(id, handle) => {
          const g = groups.find((x) => x.id === id)!;
          return (
            <div className="flex items-center gap-2 py-1.5">
              {handle}
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-medium"><span className="truncate">{g.name}</span>{g.kind === "mine" && <Badge>Mine</Badge>}</div><div className="truncate text-xs text-muted">{describe(g)}</div></div>
              <button type="button" aria-label={`Edit ${g.name}`} title="Edit" onClick={() => open(g)} className="grid size-11 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={16} aria-hidden /></button>
            </div>
          );
        }}
      </SortableList>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => open()}>+ Add a view</Button>
        <Button onClick={() => { const n = addStarterGroups(); setNote(n === 0 ? "Those views already exist." : `Added ${n} starter view${n === 1 ? "" : "s"}.`); }}>Add Mine, partner and Parents views</Button>
      </div>
      {note && <p role="status" className="text-sm text-good">{note}</p>}

      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.group ? `Edit ${dlg.group.name}` : "Add a view"}>
        {dlg && (
          <div className="space-y-3 pb-1 text-sm">
            <Field label="Name" error={error}><Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Parents, Flat with Raj" maxLength={40} /></Field>
            {isMine ? <p className="rounded-xl bg-background p-3 text-xs text-muted">Mine counts your share plus what you pay for people in your other groups. You can rename it, not delete it.</p> : (
              <>
                <div className="space-y-1.5"><div className="text-xs font-medium text-muted">Contacts in this group</div>
                  <CompactChips multi label="Contacts in this group" options={others.map((p) => ({ id: p.id, label: nameOf(p.id), icon: <PersonGlyph name={nameOf(p.id)} id={p.id} /> }))} selected={members} onPick={(id) => setMembers(members.includes(id) ? members.filter((x) => x !== id) : [...members, id])} adder={{ label: "Add a contact", placeholder: "e.g. Amma, Appa", add: (n) => { const r = addParticipant(n); if (r.id) setMembers((m) => [...m, r.id!]); return r; } }} />
                </div>
                <ToggleRow checked={includeMe} onChange={setIncludeMe} title="Count my own share too" hint="Count your own share too. Turn off for groups like Parents." />
                <ToggleRow checked={cover} onChange={setCover} title="I pay their share" hint="Also count what I pay for them in Mine." />
              </>
            )}
            {error && !name.trim() ? null : error && <p role="alert" className="text-danger">{error}</p>}
            {dlg.group && dlg.group.kind !== "mine" && <div className="border-t border-border pt-3"><Button variant="danger" onClick={() => setRemoving(dlg.group!)}>Delete this group…</Button><p className="mt-1 text-xs text-muted">Transactions are never deleted; the group is just a lens.</p></div>}
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>{dlg.group ? "Save" : "Add"}</Button></div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? "group"}?`} onConfirm={() => { if (removing) { const err = deleteGroup(removing.id); if (err) setError(err); else setDlg(null); } }}>
        <p>The group goes away. Your transactions and totals are untouched.</p>
      </ConfirmDialog>
    </Card>
  );
}

function ToggleRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-background p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="mt-0.5 h-6 w-10 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:block after:size-5 after:translate-x-0.5 after:translate-y-0.5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[1.1rem]" />
      <span className="min-w-0"><span className="block font-medium">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
    </label>
  );
}
