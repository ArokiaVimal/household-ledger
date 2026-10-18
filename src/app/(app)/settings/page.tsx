"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, CardTitle, Dialog, PageHeader } from "@/components/ui";
import { accounts, participants } from "@/data/mock";
import { useStore } from "@/data/store";

export default function Settings() {
  const { records, settlements, receipts } = useStore();
  const [confirm, setConfirm] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, note: "MOCK DATA export", participants, accounts, records, settlements, receipts }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ledger-mock-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title="Settings" actions={<Badge tone="warn">Prototype</Badge>} />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardTitle>More screens</CardTitle>
          <div className="flex flex-wrap gap-2">
            {[["/profile", "Your profile"], ["/review", "Review queue"], ["/recurring", "Recurring"], ["/receipts", "Receipts"], ["/reports", "Reports"], ["/categories", "Categories & rules"]].map(([h, l]) => <Link key={h} href={h} className="rounded-md border border-border px-3 py-2 text-sm">{l}</Link>)}
          </div>
        </Card>
        <Card>
          <CardTitle>Household members</CardTitle>
          <ul className="space-y-1 text-sm">
            <li>Vimal <Badge tone="good">Owner</Badge></li>
            <li>Wife <Badge>Member</Badge></li>
          </ul>
          <p className="mt-2 text-xs text-muted">Separate logins and invitations need Firebase Auth (Stage 3).</p>
        </Card>
        <Card>
          <CardTitle>Participants</CardTitle>
          <ul className="space-y-1 text-sm">{participants.map((p) => <li key={p.id}>{p.name} {p.userId ? <Badge tone="good">Account</Badge> : <Badge>Friend, no account</Badge>}</li>)}</ul>
        </Card>
        <Card>
          <CardTitle>Accounts</CardTitle>
          <ul className="space-y-1 text-sm">{accounts.map((a) => <li key={a.id}>{a.name} <span className="text-xs text-muted">{a.type}</span></li>)}</ul>
        </Card>
        <Card>
          <CardTitle>Export & privacy</CardTitle>
          <p className="mb-2 text-xs text-muted">Exports the in-memory mock data as JSON. Real export (JSON/CSV with stable ids) comes with persistence.</p>
          <div className="flex flex-wrap gap-2"><Button onClick={exportJson}>Export mock JSON</Button><Button variant="danger" onClick={() => setConfirm(true)}>Delete household data…</Button></div>
        </Card>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete household data?">
        <p className="text-sm">In production this permanently deletes every record and uploaded file. The prototype holds only mock data, so nothing is deleted.</p>
        <div className="mt-3 flex justify-end gap-2"><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => setConfirm(false)}>Understood</Button></div>
      </Dialog>
    </>
  );
}
