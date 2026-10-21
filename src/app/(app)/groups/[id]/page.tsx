"use client";
import { ArrowLeft, ArrowRight, Handshake, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PersonGlyph } from "@/components/glyphs";
import { SplitTabs } from "@/components/split-tabs";
import { balanceWords, GroupDialog, KindGlyph, PersonStack, ReopenButton, KIND_META, SimplifySwitch } from "@/components/split-groups";
import { TxnAddDialog, TxnEditDialog } from "@/components/txn-edit-dialog";
import { Badge, Button, Card, CardTitle, CompactChips, ConfirmDialog, Dialog, EmptyState, FormRow, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { groupBalances, groupExpenses, suggestedPayments, waitingForReview, type Transfer } from "@/domain/split-groups";
import type { ExpenseRecord, SplitGroup } from "@/domain/types";

/** One split group: what was spent, each person's balance, the fewest payments that settle it, and the payments made so far. */
export default function GroupPage() {
  const { id: raw } = useParams<{ id: string }>();
  const gid = decodeURIComponent(raw);
  const { splitGroups, splitSettlements, records, staged, meId, nameOf, voidSplitSettlement, saveSplitGroup } = useStore();
  const group = splitGroups.find((g) => g.id === gid);
  const [adding, setAdding] = useState(0); // 0 closed; each "add another" bumps it so the form resets
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [editGroup, setEditGroup] = useState(false);
  const [settling, setSettling] = useState<Transfer | "new" | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const balances = useMemo(() => (group ? groupBalances(group, records, splitSettlements) : null), [group, records, splitSettlements]);
  const transfers = useMemo(() => (group ? suggestedPayments(group, records, splitSettlements) : []), [group, records, splitSettlements]);
  const expenses = useMemo(() => (group ? [...groupExpenses(records, group.id)].reverse() : []), [group, records]);
  const waiting = group ? waitingForReview(staged, group.id) : 0;
  const payments = useMemo(() => splitSettlements.filter((s) => s.groupId === gid).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [splitSettlements, gid]);

  if (!group || !balances) {
    return (
      <>
        <SplitTabs active="groups" />
        <Card><EmptyState title="We could not find that group" /><Link href="/groups" className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">Back to Groups</Link></Card>
      </>
    );
  }
  const mine = balances.people.find((p) => p.id === meId);
  const mineWords = balanceWords(mine?.balancePaise ?? 0);
  const open = !group.archived;
  const simplify = group.simplifyDebts !== false;
  const youPay = transfers.filter((t) => t.fromId === meId), youGet = transfers.filter((t) => t.toId === meId);

  return (
    <>
      <Link href="/groups" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} aria-hidden />Groups</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <KindGlyph kind={group.kind} size={44} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{group.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><PersonStack ids={group.participantIds} size={22} /><span>{KIND_META[group.kind].label} · {group.participantIds.length} people</span>{group.archived && <Badge>Archived</Badge>}</div>
            {group.note && <p className="text-xs text-muted">{group.note}</p>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {open ? <Button variant="primary" className="min-h-11 flex-1 sm:flex-none" onClick={() => setAdding(1)}><Plus size={15} aria-hidden />Add expense</Button> : <ReopenButton id={group.id} />}
          <Button aria-label="Edit group" className="min-h-11" onClick={() => setEditGroup(true)}><Pencil size={15} aria-hidden /><span className="sm:inline">Edit</span></Button>
        </div>
      </div>
      {note && <p role="status" className="mb-3 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{note}</p>}
      {waiting > 0 && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{waiting} imported expense{waiting === 1 ? " is" : "s are"} tagged to this group and waiting for review. They count here once you <Link href="/review" className="underline">approve them</Link>.</p>}
      {group.archived && <p className="mb-3 rounded-xl bg-background px-3 py-2 text-sm text-muted">This group is archived. You can look at everything, but nothing new can be added until you reopen it.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="text-xs text-muted">Group spent</div><div className="num text-xl font-semibold">{formatINR(balances.totalPaise)}</div><div className="text-xs text-muted">{balances.expenseCount} expense{balances.expenseCount === 1 ? "" : "s"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">You</div><div className={`num text-xl font-semibold ${mineWords.tone}`}>{mineWords.amount}</div><div className="text-xs text-muted">{mine?.balancePaise ? mineWords.text === "gets back" ? "you get back" : "you owe" : "you are even"}</div></Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Card>
            <CardTitle tip="The fewest payments that make everyone even. Recording one only adds a payment to this group; it never creates an expense.">Settle up</CardTitle>
            {balances.expenseCount === 0 && payments.length === 0 ? <p className="text-sm text-muted">Add the first expense and the payments to settle it show up here.</p>
              : transfers.length === 0 ? <p className="text-sm font-medium text-good">Everyone is even. Nothing to pay.</p> : (
                <>
                  <ul className="divide-y divide-border">
                    {transfers.map((t) => (
                      <li key={`${t.fromId}-${t.toId}`} className="flex items-center gap-2 py-2.5">
                        <PersonGlyph name={nameOf(t.fromId)} id={t.fromId} size={32} />
                        <span className="min-w-0 flex-1 text-sm"><b>{t.fromId === meId ? "You" : nameOf(t.fromId)}</b> pay{t.fromId === meId ? "" : "s"} <b>{t.toId === meId ? "you" : nameOf(t.toId)}</b></span>
                        <span className="num font-semibold">{formatINR(t.amountPaise)}</span>
                        {open && <Button className="min-h-9" onClick={() => setSettling(t)}>Settle</Button>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">{transfers.length} payment{transfers.length === 1 ? "" : "s"} settle{transfers.length === 1 ? "s" : ""} the whole group{simplify ? "" : ", each to the person who paid for you"}.{youPay.length > 0 ? ` You pay ${formatINR(youPay.reduce((s, t) => s + t.amountPaise, 0))}.` : ""}{youGet.length > 0 ? ` You receive ${formatINR(youGet.reduce((s, t) => s + t.amountPaise, 0))}.` : ""}</p>
                </>
              )}
            {open && <div className="mt-3"><SimplifySwitch on={simplify} onChange={(v) => saveSplitGroup({ id: group.id, name: group.name, kind: group.kind, participantIds: group.participantIds, note: group.note, simplifyDebts: v })} /></div>}
            {open && <Button className="mt-3 w-full sm:w-auto" onClick={() => setSettling("new")}><Handshake size={15} aria-hidden />Record a payment</Button>}
          </Card>
          <Card>
            <CardTitle tip="Paid is what the person put in. Share is what the group's expenses cost them. Balance is paid minus share, after payments made inside the group.">Balances</CardTitle>
            <ul className="divide-y divide-border">
              {[...balances.people].sort((a, b) => b.balancePaise - a.balancePaise || nameOf(a.id).localeCompare(nameOf(b.id))).map((p) => {
                const w = balanceWords(p.balancePaise);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <PersonGlyph name={nameOf(p.id)} id={p.id} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.id === meId ? "You" : nameOf(p.id)}</span>
                      <span className="block text-xs text-muted">Paid {formatINR(p.paidPaise)} · share {formatINR(p.sharePaise)}</span>
                    </span>
                    <span className="text-right"><span className={`num block font-semibold ${w.tone}`}>{w.amount}</span><span className="block text-xs text-muted">{w.text}</span></span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        <div className="space-y-3">
          <Card>
            <CardTitle>{`Expenses (${expenses.length})`}</CardTitle>
            {expenses.length === 0 ? <EmptyState title="No expenses yet" hint="Add what someone paid and choose how to split it. Everyone in the group is picked for you." /> : (
              <ul className="divide-y divide-border">
                {expenses.map((e) => (
                  <li key={e.record.id}>
                    <button type="button" onClick={() => setEditing(e.record)} className="flex w-full items-center gap-3 rounded-xl py-2.5 text-left hover:bg-background sm:px-2">
                      <PersonGlyph name={nameOf(e.payerId)} id={e.payerId} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.record.merchant}</span>
                        <span className="block text-xs text-muted">{e.record.date} · paid by {e.payerId === meId ? "you" : nameOf(e.payerId)}{e.record.kind === "refund" ? " · refund" : ""}</span>
                      </span>
                      <span className="text-right"><span className="num block font-semibold">{formatINR(e.totalPaise)}</span><span className="block text-xs text-muted">your share {formatINR(e.shares[meId] ?? 0)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>{`Payments (${payments.filter((p) => !p.voided).length})`}</CardTitle>
            {payments.length === 0 ? <p className="text-sm text-muted">No payments yet. When someone pays someone back, record it here.</p> : (
              <ul className="divide-y divide-border">
                {payments.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className={s.voided ? "text-muted line-through" : ""}>
                      {nameOf(s.fromId)} <ArrowRight size={12} aria-hidden className="mb-0.5 inline" /> {nameOf(s.toId)} <span className="num font-medium">{formatINR(s.amountPaise)}</span>
                      <div className="text-xs text-muted">{s.date}{s.note ? ` · ${s.note}` : ""}</div>
                    </div>
                    {s.voided ? <Badge>Voided</Badge> : open ? <Button variant="danger" onClick={() => setVoiding(s.id)}>Void</Button> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">A payment only moves balances. It is not an expense, so it never changes your spending.</p>
          </Card>
        </div>
      </div>

      <TxnAddDialog open={adding > 0} round={adding} splitGroup={group} onClose={() => setAdding(0)} onAnother={() => setAdding((n) => n + 1)} onAdded={(m) => setNote(`${m} to ${group.name}`)} />
      <TxnEditDialog record={editing} onClose={() => setEditing(null)} />
      <GroupDialog open={editGroup} onClose={() => setEditGroup(false)} group={group} />
      <SettleDialog group={group} preset={settling} onClose={() => setSettling(null)} onDone={setNote} />
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this payment?" confirmLabel="Void it" onConfirm={() => voiding && voidSplitSettlement(voiding)}>
        <p>It stops counting, so the balances go back to what they were before it. It stays in the list as voided. If it involved you, the matching payment in People is voided too.</p>
      </ConfirmDialog>
    </>
  );
}

function SettleDialog({ group, preset, onClose, onDone }: { group: SplitGroup; preset: Transfer | "new" | null; onClose: () => void; onDone: (msg: string) => void }) {
  return (
    <Dialog open={!!preset} onClose={onClose} title="Record a payment">
      {preset && <SettleForm key={preset === "new" ? "new" : `${preset.fromId}-${preset.toId}`} group={group} preset={preset === "new" ? null : preset} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function SettleForm({ group, preset, onClose, onDone }: { group: SplitGroup; preset: Transfer | null; onClose: () => void; onDone: (msg: string) => void }) {
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
