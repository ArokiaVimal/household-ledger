"use client";
import Link from "next/link";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AiFeatureCard, Badge, Button, Card, CardTitle, ChipGroup, ConfirmDialog, Dialog, Field, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { checkFriendDelete, friendUsage } from "@/domain/friends";
import type { Account } from "@/domain/types";
import { MerchantAvatar } from "@/components/txn-row";
import { PartnerCard } from "./partner-card";

const typeLabel: Record<Account["type"], string> = { credit_card: "Credit card", bank: "Bank account", upi: "UPI app", cash: "Cash" };

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

  return (
    <>
      <PageHeader title="Settings" actions={!live ? <Badge tone="warn">Prototype</Badge> : undefined} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><PartnerCard /></div>

        {live && (
          <AiFeatureCard enabled={aiEnabled} title="AI assistant" className="md:col-span-2">
            <p>{aiEnabled ? "AI is on. When you import a statement, Claude names and categorises merchants the app has not seen before, and the app remembers your choices so the AI is asked less every month." : "AI is off. Import still works and learns from your approvals; add an Anthropic API key on the server to have Claude name and categorise new merchants."}</p>
            <p className="text-xs">Sent to Claude: merchant text, amount and debit or credit, with long numbers hidden. Never your name, the file, or account numbers. Nothing is approved without you.</p>
          </AiFeatureCard>
        )}

        <Card className="space-y-3">
          <CardTitle>Payment methods</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 py-2"><span className="flex items-center gap-2"><MerchantAvatar name={a.name} size={28} />{a.name}</span><Badge>{typeLabel[a.type]}</Badge></li>)}
            {accounts.length === 0 && <li className="py-2 text-muted">None yet. Add the cards, UPI apps and banks you use.</li>}
          </ul>
          {missingSuggested > 0 && <Button onClick={addSuggestedAccounts}>Add my usual cards, UPI apps and banks ({missingSuggested})</Button>}
          <form className="space-y-2 rounded-xl bg-background p-3" onSubmit={(e) => { e.preventDefault(); const err = addAccount(accName, accType); setAccError(err); if (!err) setAccName(""); }}>
            <Field label="Add another" error={accError}><Input value={accName} onChange={(e) => { setAccName(e.target.value); setAccError(null); }} placeholder="e.g. Axis Magnus Credit Card" maxLength={60} /></Field>
            <ChipGroup label="Type" options={(Object.keys(typeLabel) as Account["type"][]).map((t) => ({ id: t, label: typeLabel[t] }))} value={accType} onChange={setAccType} />
            <Button type="submit" disabled={!accName.trim()}>Add payment method</Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <CardTitle>People in splits</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {participants.map((p) => <li key={p.id} className="flex items-center justify-between py-2"><span>{p.name}</span><span className="flex items-center gap-2">{p.userId ? <Badge tone="good">Has an account</Badge> : <><Badge>Friend, no account</Badge><button type="button" aria-label={`Remove ${p.name}`} title="Remove friend" onClick={() => { setRemoving(p.id); setRemoveError(null); }} className="grid size-8 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={14} aria-hidden /></button></>}</span></li>)}
            {participants.every((p) => p.userId) && <li className="py-2 text-muted">No friends added yet.</li>}
          </ul>
          <form className="space-y-2 rounded-xl bg-background p-3" onSubmit={(e) => { e.preventDefault(); const err = addParticipant(friend); setFriendError(err); if (!err) setFriend(""); }}>
            <Field label="Add a friend (they don't need an account)" error={friendError}><Input value={friend} onChange={(e) => { setFriend(e.target.value); setFriendError(null); }} placeholder="e.g. Karthik" maxLength={60} /></Field>
            <Button type="submit" disabled={!friend.trim()}>Add person</Button>
          </form>
        </Card>

        <Card>
          <CardTitle>More screens</CardTitle>
          <div className="flex flex-wrap gap-2">
            {[["/profile", "Your profile"], ["/review", "Review queue"], ["/recurring", "Recurring"], ["/receipts", "Receipts"], ["/reports", "Reports"], ["/categories", "Categories & rules"]].map(([h, l]) => <Link key={h} href={h} className="rounded-full border border-border bg-surface px-3 py-2 text-sm">{l}</Link>)}
          </div>
        </Card>

        <Card>
          <CardTitle>Export & privacy</CardTitle>
          <p className="mb-2 text-xs text-muted">{live ? "Downloads your data as JSON (transactions, people, categories, settlements). A full export and restore with CSV is planned." : "Exports the in-memory mock data as JSON."}</p>
          <div className="flex flex-wrap gap-2"><Button onClick={exportJson}>Export JSON</Button><Button variant="danger" onClick={() => setConfirm(true)}>Delete all my data…</Button></div>
        </Card>
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
