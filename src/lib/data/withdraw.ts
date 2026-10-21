import type { Repository } from "@/data/repository";

const money = (p: number) => `₹${(p / 100).toFixed(2)}`;

/**
 * Withdraws (voids, never removes) every shared expense that `uid` put into a shared space. Used when the originals are deleted
 * wholesale ("Delete all my data"), so nobody is left owing money for expenses that no longer exist. Copies stay as history.
 */
export async function withdrawOwnShares(space: Repository, uid: string, why: string): Promise<number> {
  const now = new Date().toISOString();
  let n = 0;
  for (const s of await space.sharedExpenses.list()) {
    if (s.ownerUid !== uid || s.voided) continue;
    await space.sharedExpenses.put({ ...s, voided: true, ...(s.version !== undefined ? { version: s.version + 1 } : {}), updatedAt: now });
    await space.audit.append({ actorId: uid, action: "delete", entity: "record", entityId: s.id, summary: `Withdrawn: ${s.merchant} ${money(s.amountPaise)} (${why})`.slice(0, 480) });
    n++;
  }
  return n;
}
