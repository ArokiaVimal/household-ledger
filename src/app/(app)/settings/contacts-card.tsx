"use client";
import { Heart, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { PersonGlyph } from "@/components/glyphs";
import { Badge, Button, Card, CardTitle, ChipGroup, Dialog, Field, Input } from "@/components/ui";
import { CheckLinksButton, LinkProposals, UnlinkButton } from "@/components/links";
import { useStore } from "@/data/store";
import { RELATIONSHIP_LABEL, relationshipText } from "@/domain/contacts";
import { RELATIONSHIPS, type Participant, type Relationship } from "@/domain/types";

/**
 * Friends & Family: everyone you split with, in one list, whether or not they have an account. A contact's email is only a hint
 * for linking a future sign-up; nothing here gives anyone access to your money.
 */
export function ContactsCard({ onRemove }: { onRemove: (id: string) => void }) {
  const { participants, meId, partnerId, addParticipant, updateParticipant } = useStore();
  const [dlg, setDlg] = useState<{ person?: Participant } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [rel, setRel] = useState<Relationship>("friend");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const others = participants.filter((p) => p.id !== meId);
  const linked = !!dlg?.person?.userId;

  const open = (person?: Participant) => {
    setDlg({ person }); setError(null);
    setName(person?.name ?? ""); setNick(person?.nickname ?? ""); setEmail(person?.email ?? ""); setRel(person?.relationship ?? "friend"); setLabel(person?.relationshipLabel ?? "");
  };
  const save = () => {
    const err = dlg?.person
      ? updateParticipant(dlg.person.id, { name, nickname: nick.trim() || null, email: email.trim() || null, relationship: rel, relationshipLabel: rel === "custom" ? label : null })
      : addParticipant(name, { email, nickname: nick, relationship: rel, relationshipLabel: label }).error ?? null;
    if (err) setError(err); else setDlg(null);
  };
  const isPartner = (p: Participant) => p.relationship === "partner" || p.id === partnerId;
  const status = (p: Participant) => (p.userId ? <Badge tone="good">Has an account</Badge> : p.linkId ? <Badge tone="good">Linked</Badge> : p.pendingEmail ? <Badge tone="warn">Invited</Badge> : null);

  return (
    <Card className="space-y-3">
      <CardTitle tip="Everyone you split with lives here, with or without an account. The email is optional and only used to recognise them if they sign up later; it never gives anyone access to your finances. Friends & Family is different from Split With (who is in one expense), Payment Groups (how you view spending) and Categories." action={<span className="text-xs text-muted">{others.length === 0 ? "None yet" : `${others.length} added`}</span>}>Friends &amp; Family</CardTitle>
      <ul className="divide-y divide-border text-sm">
        {others.map((p) => {
          const canEdit = !p.pendingEmail && (p.id === partnerId ? false : true);
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <PersonGlyph name={p.name} id={p.id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium"><span className="truncate">{p.nickname?.trim() || p.name}</span>{isPartner(p) && <Heart size={14} aria-label="Partner" className="shrink-0 fill-rose-500 text-rose-500" />}</div>
                <div className="truncate text-xs text-muted">{p.nickname?.trim() ? `${p.name} · ` : ""}{isPartner(p) ? "Partner" : relationshipText(p)}{p.email ? ` · ${p.email}` : p.pendingEmail ? ` · ${p.pendingEmail}` : ""}</div>
              </div>
              {status(p)}
              {p.linkId && <UnlinkButton linkKey={p.linkId} name={p.name} />}
              {canEdit && <button type="button" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => open(p)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={15} aria-hidden /></button>}
              {!p.userId && !p.pendingEmail && !p.linkId && <button type="button" aria-label={`Remove ${p.name}`} title="Remove" onClick={() => onRemove(p.id)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={15} aria-hidden /></button>}
            </li>
          );
        })}
        {others.length === 0 && <li className="py-3 text-muted">No one yet. Add your partner, a friend or family so you can split with them.</li>}
      </ul>
      <LinkProposals />
      <Button variant="primary" onClick={() => open()}>+ Add a contact</Button>
      <CheckLinksButton />

      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.person ? `Edit ${dlg.person.name}` : "Add a contact"}>
        {dlg && (
          <div className="space-y-3 pb-1 text-sm">
            <Field label="Name" error={error && !error.toLowerCase().includes("email") && !error.toLowerCase().includes("relationship") ? error : null}><Input autoFocus value={name} disabled={linked} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Karthik" maxLength={60} /></Field>
            <Field label="Nickname (optional)"><Input value={nick} onChange={(e) => { setNick(e.target.value); setError(null); }} placeholder="What you call them, e.g. Varu" maxLength={30} /></Field>
            <Field label="Email (optional)" error={error && error.toLowerCase().includes("email") ? error : null}><Input type="email" inputMode="email" value={email} disabled={linked} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="name@example.com" maxLength={200} /></Field>
            {linked && <p className="text-xs text-muted">{dlg.person?.name} has an account, so their name and email come from them. You can still change how you know them.</p>}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted">Relationship</div>
              <ChipGroup label="Relationship" options={RELATIONSHIPS.map((r) => ({ id: r, label: RELATIONSHIP_LABEL[r] }))} value={rel} onChange={(r) => { setRel(r); setError(null); }} />
              {rel === "custom" && <Field label="What is the relationship?" error={error && error.toLowerCase().includes("relationship") ? error : null}><Input value={label} onChange={(e) => { setLabel(e.target.value); setError(null); }} placeholder="e.g. Flatmate, Colleague" maxLength={30} /></Field>}
            </div>
            <p className="rounded-xl bg-background p-3 text-xs text-muted">Adding someone does not share your transactions with them. Only expenses you split with them are ever theirs to see, and only once they have an account linked.</p>
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>{dlg.person ? "Save" : "Add"}</Button></div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
