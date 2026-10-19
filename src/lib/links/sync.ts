// Keeps the link space in step with an owner's ledger (docs/FRIENDS_FAMILY_LINKING.md section 8). The owner's record is the one
// transaction; the link space holds its shared terms, which either linked person may edit (see shared.ts). Here the owner's changes
// flow outward: created, updated or withdrawn, each logged with who did it. Copies carry the record's id, so every step is
// idempotent, and a sync that changes nothing writes and logs nothing.
import type { Repository } from "@/data/repository";
import { buildLinkShared, planLinkSettlement, planLinkShare, settlementToOwner, sharedDiff, type LinkContext } from "@/domain/links";
import type { ExpenseRecord, Settlement } from "@/domain/types";

/** An active link as seen from the owner's side: who it is with, where the shared terms live, and the other owner's ledger when they hold a contact for you too. */
export interface ActionLink { key: string; ctx: LinkContext; repo: Repository; peer?: { repo: Repository; ctx: LinkContext } }

export interface SyncInfo { categoryName: string; /** Names of the people in the owner's space, by participant id. */ names: Record<string, string>; /** Who made the change (for the log). */ actorUid: string }

const nowIso = () => new Date().toISOString();
const LABEL: Record<string, string> = { merchant: "merchant", date: "date", amountPaise: "amount", categoryName: "category", payerId: "payer", split: "split", note: "note" };
const money = (p: number) => `₹${(p / 100).toFixed(2)}`;

export const namesOf = async (repo: Repository): Promise<Record<string, string>> => Object.fromEntries((await repo.participants.list()).map((p) => [p.id, p.name]));

/** Creates, updates or withdraws (voids) the shared terms of one record in one link space, and logs a real change. */
export async function syncRecord(link: ActionLink, rec: ExpenseRecord, o: SyncInfo): Promise<"created" | "updated" | "withdrawn" | "none"> {
  const plan = planLinkShare(rec, link.ctx);
  const existing = await link.repo.sharedExpenses.get(rec.id);
  const now = nowIso();
  const log = (action: "create" | "edit" | "delete", summary: string, change?: { before: Record<string, unknown>; after: Record<string, unknown> }) =>
    link.repo.audit.append({ actorId: o.actorUid, action, entity: "record", entityId: rec.id, summary: summary.slice(0, 480), ...(change ? { change } : {}) });
  if (plan.action === "share") {
    const next = buildLinkShared(rec, link.ctx, { categoryName: o.categoryName, names: o.names, now, version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt });
    if (existing && !existing.voided) {
      const diff = sharedDiff(existing, next);
      const peopleChanged = JSON.stringify(existing.people ?? null) !== JSON.stringify(next.people ?? null);
      if (!diff && !peopleChanged && existing.version !== undefined) return "none";
      await link.repo.sharedExpenses.put(next);
      if (diff && existing.version !== undefined) await log("edit", `Edited ${Object.keys(diff.after).map((k) => LABEL[k] ?? k).join(", ")} of ${next.merchant}`, diff);
      else if (existing.version === undefined) await log("edit", `Now shows the full expense: ${next.merchant}`);
      return "updated";
    }
    await link.repo.sharedExpenses.put(next);
    await log("create", `${existing?.voided ? "Shared again" : "Shared"} ${next.merchant} ${money(next.amountPaise)}`);
    return "created";
  }
  if (existing && !existing.voided) {
    await link.repo.sharedExpenses.put({ ...existing, voided: true, version: (existing.version ?? 0) + 1, updatedAt: now });
    await log("delete", `Withdrawn: ${existing.merchant} ${money(existing.amountPaise)}`);
    return "withdrawn";
  }
  return "none";
}

export async function syncRecordToLinks(links: ActionLink[], rec: ExpenseRecord, o: SyncInfo): Promise<void> {
  for (const l of links) await syncRecord(l, rec, o);
}

/**
 * Mirrors a settlement that is exactly between the owner and the linked contact into the link space, logs it once, and (when the other
 * person also keeps a ledger here) writes it into their settlements so both balances are right. A settlement never creates an expense.
 */
export async function syncSettlement(link: ActionLink, s: Settlement, actorUid: string): Promise<boolean> {
  const mirror = planLinkSettlement(s, link.ctx);
  if (!mirror) return false;
  const existing = await link.repo.settlements.get(s.id);
  if (existing?.voided && !mirror.voided) return true; // a void is final
  const fresh = !existing, newlyVoided = !!mirror.voided && !existing?.voided;
  if (fresh || newlyVoided) {
    await link.repo.settlements.put(existing ? { ...existing, voided: true } : mirror);
    await link.repo.audit.append({ actorId: actorUid, action: newlyVoided && existing ? "void_settlement" : "settle", entity: "settlement", entityId: s.id, summary: `${newlyVoided && existing ? "Voided payment of" : "Payment of"} ${money(s.amountPaise)}` });
  }
  if (link.peer) {
    const theirs = await link.peer.repo.settlements.get(s.id);
    if (!theirs || (!theirs.voided && mirror.voided)) await link.peer.repo.settlements.put({ ...settlementToOwner(mirror, link.peer.ctx), ...(theirs ? { voided: true } : {}) });
  }
  return true;
}

/** After a confirm or an upgrade: mirrors everything that already qualifies. Reads the owner's ledger, writes only to the link space. */
export async function backfill(ownRepo: Repository, link: ActionLink, actorUid: string): Promise<{ expenses: number; settlements: number }> {
  const [records, settlements, categories, names] = await Promise.all([ownRepo.records.list(), ownRepo.settlements.list(), ownRepo.categories.list(), namesOf(ownRepo)]);
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  let expenses = 0; let n = 0;
  for (const r of records) { const out = await syncRecord(link, r, { categoryName: cat.get(r.categoryId) ?? r.categoryId, names, actorUid }); if (out === "created" || out === "updated") expenses++; }
  for (const s of settlements) if (await syncSettlement(link, s, actorUid)) n++;
  return { expenses, settlements: n };
}
