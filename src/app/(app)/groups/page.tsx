"use client";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { balanceWords, GroupDialog, KindGlyph, PersonStack } from "@/components/split-groups";
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { groupBalances, waitingForReview } from "@/domain/split-groups";
import { useRouter } from "next/navigation";

/** Split Groups: trips, dinners and outings shared by several contacts. Not Payment Groups (lenses on your spending) and not Categories. */
export default function Groups() {
  const { splitGroups, splitSettlements, records, staged, meId } = useStore();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(() => splitGroups.map((g) => {
    const b = groupBalances(g, records, splitSettlements);
    return { g, total: b.totalPaise, mine: b.people.find((p) => p.id === meId)?.balancePaise ?? 0, count: b.expenseCount, waiting: waitingForReview(staged, g.id) };
  }), [splitGroups, records, staged, splitSettlements, meId]);
  const active = rows.filter((r) => !r.g.archived), archived = rows.filter((r) => r.g.archived);

  const row = ({ g, total, mine, count, waiting }: (typeof rows)[number]) => {
    const w = balanceWords(mine);
    return (
      <li key={g.id}>
        <Link href={`/groups/${encodeURIComponent(g.id)}`} className="flex items-center gap-3 rounded-xl py-3 hover:bg-background sm:px-2">
          <KindGlyph kind={g.kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{g.name}</span>
            <span className="mt-0.5 block text-xs text-muted">{count === 0 ? "No expenses yet" : `${count} expense${count === 1 ? "" : "s"} · ${formatINR(total)}`}</span>
            <span className="mt-1 block"><PersonStack ids={g.participantIds} size={20} /></span>
            {waiting > 0 && <span className="mt-1 inline-block"><Badge tone="warn">{waiting} waiting for review</Badge></span>}
          </span>
          <span className="text-right">
            <span className={`num block font-semibold ${w.tone}`}>{w.amount}</span>
            <span className="block text-xs text-muted">{mine === 0 ? (count === 0 ? "" : "you are even") : `you ${mine > 0 ? "get back" : "owe"}`}</span>
          </span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Split groups" tip="Split groups are for an occasion: a trip, a dinner, a party. Pick the people, add expenses, and see who owes whom. They are separate from Payment Groups (views of your own spending) and Categories. An expense is still one transaction, so your spending is never counted twice."
        sub="Trips, dinners and outings you share with friends and family." actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} aria-hidden />New group</Button>} />
      {splitGroups.length === 0 ? (
        <Card>
          <EmptyState title="No groups yet" hint="Make one for your next trip or dinner. Choose who is in it, add what each person paid, and the app works out who pays whom." />
          <Button variant="primary" className="mt-3 min-h-11 w-full sm:w-auto" onClick={() => setCreating(true)}>Create your first group</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-2">
          <Card>
            <CardTitle>{`Active (${active.length})`}</CardTitle>
            {active.length === 0 ? <p className="text-sm text-muted">Everything is archived. Create a new group, or reopen an old one below.</p> : <ul className="divide-y divide-border">{active.map(row)}</ul>}
          </Card>
          {archived.length > 0 && (
            <Card>
              <CardTitle action={<Button className="border-0" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>{showArchived ? "Hide" : "Show"}</Button>}>{`Archived (${archived.length})`}</CardTitle>
              {showArchived ? <ul className="divide-y divide-border">{archived.map(row)}</ul> : <p className="text-sm text-muted">Finished groups stay here. Nothing new can be added to them until you reopen them.</p>}
            </Card>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Contacts come from Friends &amp; Family in Settings; they do not need an account.</p>
      <GroupDialog open={creating} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/groups/${encodeURIComponent(id)}`)} />
    </>
  );
}
