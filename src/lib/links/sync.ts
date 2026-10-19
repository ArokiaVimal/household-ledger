// Keeps the link space in step with the owner's ledger. The owner's records are only ever READ here; the only writes are to the
// link space (a redacted, pair-scoped mirror) and, on confirm, a `linkId` on the contact. Copies carry the record's id, so every
// step is idempotent and a failed action can simply be retried.
import type { Repository } from "@/data/repository";
import { buildLinkShared, planLinkSettlement, planLinkShare, type LinkContext } from "@/domain/links";
import type { ExpenseRecord, Settlement } from "@/domain/types";

/** An active link as seen from the owner's side: who it is with, and where the mirror lives. */
export interface ActionLink { key: string; ctx: LinkContext; repo: Repository }

const nowIso = () => new Date().toISOString();

/** Creates, updates or withdraws (voids) the copy of one record in one link space. */
export async function syncRecord(link: ActionLink, rec: ExpenseRecord, categoryName: string): Promise<"shared" | "withdrawn" | "none"> {
  const plan = planLinkShare(rec, link.ctx);
  const existing = await link.repo.sharedExpenses.get(rec.id);
  const now = nowIso();
  if (plan.action === "share") {
    await link.repo.sharedExpenses.put(buildLinkShared(rec, plan.copy, { ownerUid: link.ctx.ownerUid, categoryName, now, createdAt: existing?.createdAt }));
    return "shared";
  }
  if (existing && !existing.voided) { await link.repo.sharedExpenses.put({ ...existing, voided: true, updatedAt: now }); return "withdrawn"; }
  return "none";
}

export async function syncRecordToLinks(links: ActionLink[], rec: ExpenseRecord, categoryName: string): Promise<void> {
  for (const l of links) await syncRecord(l, rec, categoryName);
}

/** Mirrors (or re-mirrors, e.g. when voided) a settlement that is exactly between the owner and the linked contact. */
export async function syncSettlement(link: ActionLink, s: Settlement): Promise<boolean> {
  const mirror = planLinkSettlement(s, link.ctx);
  if (!mirror) return false;
  const existing = await link.repo.settlements.get(s.id);
  if (existing?.voided && !mirror.voided) return true; // a void is final
  await link.repo.settlements.put(mirror);
  return true;
}

/** After a confirm: mirrors everything that already qualifies. Reads the owner's ledger, writes only to the link space. */
export async function backfill(ownRepo: Repository, link: ActionLink): Promise<{ expenses: number; settlements: number }> {
  const [records, settlements, categories] = await Promise.all([ownRepo.records.list(), ownRepo.settlements.list(), ownRepo.categories.list()]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  let expenses = 0; let n = 0;
  for (const r of records) if ((await syncRecord(link, r, names.get(r.categoryId) ?? r.categoryId)) === "shared") expenses++;
  for (const s of settlements) if (await syncSettlement(link, s)) n++;
  return { expenses, settlements: n };
}
