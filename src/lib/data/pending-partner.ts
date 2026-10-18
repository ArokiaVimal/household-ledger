// An invited partner shows up as a person you can split with before they accept, so you can start using their name right
// away. Their id is temporary (`pendingEmail` marks it). When they accept, every split that used it is rewritten to
// their real participant id, so nothing is lost or double counted.
import type { Repository } from "@/data/repository";
import type { ExpenseRecord, Participant, RecurringItem, SplitConfig } from "@/domain/types";

const swapSplit = (s: SplitConfig, from: string, to: string): SplitConfig => ({
  ...s,
  participantIds: s.participantIds.map((x) => (x === from ? to : x)),
  ...(s.values ? { values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k === from ? to : k, v])) } : {}),
});
const touches = (id: string, o: { payerId: string; split: SplitConfig }) => o.payerId === id || o.split.participantIds.includes(id);

/** Shows the invited person by name. Replaces any earlier pending person (one invitation waits at a time). */
export async function setPendingPartner(repo: Repository, p: { id: string; name: string; email: string }): Promise<void> {
  await dropPendingPartners(repo, p.id);
  await repo.participants.put({ id: p.id, name: p.name.trim().slice(0, 60) || "Partner", userId: null, pendingEmail: p.email.trim().toLowerCase() });
}

/** The invitation was cancelled or replaced: remove the pending person, or keep them as a plain friend if a split already uses them. */
export async function dropPendingPartners(repo: Repository, except?: string): Promise<void> {
  const pending = (await repo.participants.list()).filter((p) => p.pendingEmail && p.id !== except);
  if (pending.length === 0) return;
  const [records, recurring] = await Promise.all([repo.records.list(), repo.recurring.list()]);
  for (const p of pending) {
    if (records.some((r) => touches(p.id, r)) || recurring.some((r) => touches(p.id, r))) {
      const { pendingEmail: _gone, ...friend } = p;
      void _gone;
      await repo.participants.put(friend);
    } else await repo.participants.remove(p.id);
  }
}

/** The invited person accepted: their pending id becomes their real participant everywhere. Returns how many records changed. */
export async function adoptPendingPartner(repo: Repository, who: { email: string; id: string; uid: string; name: string }): Promise<number> {
  const email = who.email.trim().toLowerCase();
  const pending = (await repo.participants.list()).find((p) => p.pendingEmail === email);
  if (!pending) return 0;
  const [records, recurring] = await Promise.all([repo.records.list(), repo.recurring.list()]);
  let changed = 0;
  if (!(await repo.participants.get(who.id))) await repo.participants.put({ id: who.id, name: pending.name || who.name, userId: who.uid });
  for (const r of records.filter((x) => touches(pending.id, x))) {
    const next: ExpenseRecord = { ...r, payerId: r.payerId === pending.id ? who.id : r.payerId, split: swapSplit(r.split, pending.id, who.id) };
    await repo.records.put(next);
    changed++;
  }
  for (const r of recurring.filter((x) => touches(pending.id, x))) {
    const next: RecurringItem = { ...r, payerId: r.payerId === pending.id ? who.id : r.payerId, split: swapSplit(r.split, pending.id, who.id) };
    await repo.recurring.put(next);
  }
  await repo.participants.remove(pending.id);
  return changed;
}

export const isPending = (p: Participant) => !!p.pendingEmail;
