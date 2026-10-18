"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Download, LayoutGrid, Repeat, Receipt, ShieldCheck, Sparkles, Tags, Trash2, UserRound, Users, Wallet, BarChart3, ClipboardCheck, type LucideIcon } from "lucide-react";
import { AiFeatureCard, Badge, Button, Card, CardTitle, ChipGroup, ConfirmDialog, Dialog, Field, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { checkFriendDelete, friendUsage } from "@/domain/friends";
import type { Account } from "@/domain/types";
import { MerchantAvatar } from "@/components/txn-row";
import { PartnerCard } from "./partner-card";

const typeLabel: Record<Account["type"], string> = { credit_card: "Credit card", bank: "Bank account", upi: "UPI app", cash: "Cash" };

const JUMP = [["methods", "Payment methods"], ["sharing", "Split with people"], ["ai", "Smart import"], ["shortcuts", "Make it yours"], ["data", "Your data"]] as const;
const SHORTCUTS: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: "/profile", label: "Your profile", hint: "Your name and photo, and how the app greets you.", icon: UserRound },
  { href: "/categories", label: "Categories and rules", hint: "Rename, add your own, and auto-sort favourite merchants.", icon: Tags },
  { href: "/recurring", label: "Recurring", hint: "Rent, EMIs and bills that come around every month.", icon: Repeat },
  { href: "/review", label: "Review queue", hint: "Approve imported transactions so they count.", icon: ClipboardCheck },
  { href: "/receipts", label: "Receipts", hint: "Match receipts to the payments they belong to.", icon: Receipt },
  { href: "/reports", label: "Reports", hint: "See where it all went, month by month.", icon: BarChart3 },
];

function Section({ id, icon, title, tagline, children }: { id: string; icon: ReactNode; title: string; tagline: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">{icon}</span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-3xl text-sm text-muted">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { live, aiEnabled, sharedRecords, records, staged, settlements, receipts, categories, rules, participants, accounts, recurringItems, meId, addAccount, addSuggestedAccounts, addParticipant, deleteParticipant } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<Account["type"]>("credit_card");
  const [accError, setAccError] = useState<string | null>(null);
  const [friend, setFriend] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removingPerson = participants.find((p) => p.id === removing);
  const removeCheck = removing ? checkFriendDelete(removingPerson, meId, friendUsage(removing, { records: [...records, ...staged], settlements, recurring: recurringItems })) : null;
  const missingSuggested = SUGGESTED_ACCOUNTS.filter((s) => !accounts.some((a) => a.id === s.id)).length;

  const exportJson = () => {
    const payload = { schemaVersion: 1, note: live ? "Basic export. Full export/restore arrives later." : "MOCK DATA export", exportedAt: new Date().toISOString(), participants, accounts, categories, rules, recurringItems, records: [...records, ...staged], sharedWithPartner: sharedRecords.map(({ originalDescription: _o, accountId: _a, importSource: _i, ...r }) => { void _o; void _a; void _i; return r; }), settlements, receipts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = live ? "personal-finance-export.json" : "ledger-mock-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const usedBy = (id: string) => [...records, ...staged].filter((r) => r.accountId === id).length;
  const friends = participants.filter((p) => !p.userId);

  return (
    <>
      <PageHeader title="Settings" sub="Set up where your money lives, who you split with and how smart your imports are. Change any of it, any time." actions={!live ? <Badge tone="warn">Prototype</Badge> : undefined} />
      <nav aria-label="Jump to a section" className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {JUMP.map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm hover:bg-background">{label}</a>)}
      </nav>

      <div className="space-y-10">
        <Section id="methods" icon={<Wallet size={20} aria-hidden />} title="Payment methods" tagline="Know exactly where every rupee came from. Add the cards, UPI apps and bank accounts you spend with, and each transaction is filed under the right one.">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <CardTitle action={<span className="text-xs text-muted">{accounts.length} added</span>}>Your payment methods</CardTitle>
              <ul className="divide-y divide-border text-sm">
                {accounts.map((a) => {
                  const n = usedBy(a.id);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5"><MerchantAvatar name={a.name} size={32} /><span className="min-w-0"><span className="block truncate font-medium">{a.name}</span><span className="block text-xs text-muted">{n === 0 ? "No transactions yet" : `${n} transaction${n === 1 ? "" : "s"}`}</span></span></span>
                      <Badge>{typeLabel[a.type]}</Badge>
                    </li>
                  );
                })}
                {accounts.length === 0 && <li className="py-3 text-muted">Nothing here yet. Add your first card, UPI app or bank account to start tracking.</li>}
              </ul>
              {missingSuggested > 0 && <Button variant="primary" onClick={addSuggestedAccounts}>Add my usual cards, UPI apps and banks ({missingSuggested})</Button>}
            </Card>
            <Card>
              <CardTitle>Add one of your own</CardTitle>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const err = addAccount(accName, accType); setAccError(err); if (!err) setAccName(""); }}>
                <Field label="Name" error={accError}><Input value={accName} onChange={(e) => { setAccName(e.target.value); setAccError(null); }} placeholder="e.g. Axis Magnus Credit Card" maxLength={60} /></Field>
                <ChipGroup label="Type" options={(Object.keys(typeLabel) as Account["type"][]).map((t) => ({ id: t, label: typeLabel[t] }))} value={accType} onChange={setAccType} />
                <Button type="submit" variant="primary" disabled={!accName.trim()}>Add payment method</Button>
              </form>
            </Card>
          </div>
        </Section>

        <Section id="sharing" icon={<Users size={20} aria-hidden />} title="Split with people" tagline="Rent with your partner, a dinner with friends, a trip with the gang. Split it fairly, see who owes whom, and settle up without the awkward maths.">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PartnerCard />
            <Card className="space-y-3">
              <CardTitle action={<span className="text-xs text-muted">{friends.length === 0 ? "None yet" : `${friends.length} added`}</span>}>Friends and family</CardTitle>
              <p className="text-sm text-muted">Friends never need an account. Add them by name, include them in a split, and keep track of who has paid you back.</p>
              <ul className="divide-y divide-border text-sm">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="font-medium">{p.name}{p.id === meId && <span className="font-normal text-muted"> (you)</span>}</span>
                    <span className="flex items-center gap-2">
                      {p.userId ? <Badge tone="good">Has an account</Badge> : <><Badge>Friend</Badge><button type="button" aria-label={`Remove ${p.name}`} title="Remove friend" onClick={() => { setRemoving(p.id); setRemoveError(null); }} className="grid size-8 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={14} aria-hidden /></button></>}
                    </span>
                  </li>
                ))}
                {friends.length === 0 && <li className="py-3 text-muted">No friends added yet. Add one below to split your next outing.</li>}
              </ul>
              <form className="space-y-2 rounded-xl bg-background p-3" onSubmit={(e) => { e.preventDefault(); const err = addParticipant(friend); setFriendError(err); if (!err) setFriend(""); }}>
                <Field label="Add a friend" error={friendError}><Input value={friend} onChange={(e) => { setFriend(e.target.value); setFriendError(null); }} placeholder="e.g. Karthik" maxLength={60} /></Field>
                <Button type="submit" disabled={!friend.trim()}>Add friend</Button>
              </form>
            </Card>
          </div>
        </Section>

        {live && (
          <Section id="ai" icon={<Sparkles size={20} aria-hidden />} title="Smart import" tagline="Let the busywork read itself. Drop in a statement and the app does the sorting, so you only review.">
            <AiFeatureCard enabled={aiEnabled} title="AI assistant">
              <p>{aiEnabled
                ? "AI is on. Claude names merchants, picks categories, spots card-bill payments, works out which bank or card a statement belongs to, and reads statements or notes the app has never seen before. It remembers what you approve, so every month needs less review."
                : "AI is off. Everything still works and learns from what you approve. Switch it on to have Claude read unfamiliar statements, name and categorise merchants, and turn a note like “paid 450 at Swiggy” into a transaction."}</p>
              <p className="text-xs">{aiEnabled
                ? "Your privacy: Claude only sees text you choose to send, and only after you click an AI button. Account numbers, emails and phone numbers are hidden first; your name and the file itself are never sent. Nothing counts until you approve it."
                : "To switch it on, the app owner adds an Anthropic API key to the server settings. Until then, nothing is ever sent to AI."}</p>
              <Link href="/import" className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-background">Go to Import</Link>
            </AiFeatureCard>
          </Section>
        )}

        <Section id="shortcuts" icon={<LayoutGrid size={20} aria-hidden />} title="Make it yours" tagline="Rename categories, set up recurring bills, tune how the app greets you.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SHORTCUTS.map(({ href, label, hint, icon: I }) => (
              <Link key={href} href={href} className="group flex items-start gap-3 rounded-[var(--radius-card)] bg-surface p-4 transition-shadow hover:shadow-md">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-accent"><I size={18} /></span>
                <span className="min-w-0"><span className="block font-medium">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
              </Link>
            ))}
          </div>
        </Section>

        <Section id="data" icon={<ShieldCheck size={20} aria-hidden />} title="Your data" tagline="It is your money and your data. Take a copy whenever you like.">
          <Card className="space-y-3">
            <p className="text-sm text-muted">{live ? "Download everything as a file you keep: transactions, people, categories, rules and settlements. A fuller export with CSV and restore is on the way." : "Exports the sample data in this prototype as a file."}</p>
            <div className="flex flex-wrap gap-2"><Button onClick={exportJson}><Download size={16} aria-hidden />Download my data</Button><Button variant="danger" onClick={() => setConfirm(true)}>Delete all my data…</Button></div>
          </Card>
        </Section>
      </div>

      <ConfirmDialog open={!!removing && removeCheck?.ok === true} onClose={() => setRemoving(null)} title={`Remove ${removingPerson?.name ?? "this friend"}?`} confirmLabel="Remove friend" onConfirm={() => { if (removing) setRemoveError(deleteParticipant(removing)); }}>
        <p>{removingPerson?.name} is not in any transaction, split, settlement or recurring item, so nothing changes for anyone. They can be added again later.</p>
      </ConfirmDialog>
      <Dialog open={!!removing && removeCheck?.ok === false} onClose={() => setRemoving(null)} title={`Can't remove ${removingPerson?.name ?? "this friend"}`}>
        <p className="text-sm" role="alert">{removeCheck && !removeCheck.ok ? removeCheck.reason : ""}</p>
        <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button onClick={() => setRemoving(null)}>Close</Button></div>
      </Dialog>
      {removeError && <p role="alert" className="mt-3 text-sm text-danger">{removeError}</p>}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete all my data?">
        <p className="text-sm">{live ? "Deleting your data from the app is not built yet, so nothing was removed. When it is, it will permanently delete every record and uploaded file after a typed confirmation." : "The prototype holds only mock data, so nothing is deleted."}</p>
        <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => setConfirm(false)}>Close</Button></div>
      </Dialog>
    </>
  );
}
