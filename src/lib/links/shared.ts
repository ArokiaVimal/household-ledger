// Two-way editing of shared expenses and payments between linked people (docs/FRIENDS_FAMILY_LINKING.md section 8).
// Every change: checks a version (a second save is refused, never merged silently), writes the shared terms, writes the same change
// through to the origin owner's record, and logs who/when/before/after in the link space. Authority comes from the verified actor
// and the stored pair, never from the request.
import { ExpenseRecordSchema } from "@/data/schemas";
import { ConflictError, type Repository } from "@/data/repository";
import { undoableIds } from "@/domain/audit";
import { applySharedPatch, checkSharedEdit, linkParticipantId, otherUid, recordFromShared, SHARED_FIELDS, settlementToOwner, sharedDiff, type ContactLink, type LinkContext, type SharedPatch } from "@/domain/links";
import type { ExpenseRecord, Settlement, SharedExpense } from "@/domain/types";
import { actionLinkOf, type LinkActor, type LinkDeps } from "./service";
import { namesOf, syncRecord } from "./sync";
import { LinkError } from "./types";

const money = (p: number) => `₹${(p / 100).toFixed(2)}`;
const LABEL: Record<string, string> = { merchant: "merchant", date: "date", amountPaise: "amount", categoryName: "category", payerId: "payer", split: "split", note: "note" };
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function open(d: LinkDeps, actor: LinkActor, key: string): Promise<{ pair: ContactLink; space: Repository }> {
  const pair = await d.store.getPair(key);
  if (!pair || !pair.uids.includes(actor.uid) || !pair.spaceId) throw new LinkError("not_found", "That link was not found.");
  return { pair, space: d.repoFor(pair.spaceId) };
}

/** The origin owner's side of an expense, and the context to translate between the shared terms and their ledger. */
function originOf(d: LinkDeps, pair: ContactLink, owner: string): { ctx: LinkContext; repo: Repository } {
  const side = pair.sides[owner];
  if (side?.status !== "active" || !side.contactId) throw new LinkError("conflict", "This link has ended, so the expense cannot be changed here any more. It stays as it was in each person's own ledger.");
  return { ctx: { meId: linkParticipantId(owner), contactId: side.contactId, ownerUid: owner, otherUid: otherUid(pair, owner) }, repo: d.repoFor(side.householdId) };
}

const recordDiff = (a: ExpenseRecord, b: ExpenseRecord) => {
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const k of ["merchant", "categoryId", "payerId", "split", "notes"] as const) {
    const x = a[k], y = b[k];
    if (!sameValue(x, y)) { before[k] = x ?? null; after[k] = y ?? null; }
  }
  return Object.keys(after).length ? { before, after } : undefined;
};

export interface SharedEdit { key: string; id: string; /** The version of the expense the editor was looking at. */ ifVersion: number; patch: SharedPatch }

async function applyEdit(d: LinkDeps, actor: LinkActor, input: SharedEdit, undoes?: { id: string; summary: string }): Promise<{ version: number }> {
  const { pair, space } = await open(d, actor, input.key);
  const cur = await space.sharedExpenses.get(input.id);
  if (!cur) throw new LinkError("not_found", "That expense was not found.");
  if (cur.voided) throw new LinkError("invalid", "That expense was withdrawn, so it cannot be edited.");
  if ((cur.version ?? 0) !== input.ifVersion) {
    const last = [...(await space.audit.list())].reverse().find((e) => e.entityId === cur.id && e.actorId !== actor.uid);
    const who = last ? (await d.households.listMembers(pair.spaceId!)).find((m) => m.uid === last.actorId)?.displayName : undefined;
    throw new LinkError("conflict", `${who || "The other person"} changed this expense since you opened it. Reload to see their change; nothing was overwritten.`);
  }
  const origin = originOf(d, pair, cur.ownerUid);
  const rec = await origin.repo.records.get(cur.id);
  if (!rec) throw new LinkError("conflict", "The original transaction no longer exists.");
  const canBank = rec.importSource === "Manual entry";
  const bad = checkSharedEdit(cur, input.patch, { canEditBankFields: canBank, noteShared: !!rec.shareNote, ownerUid: cur.ownerUid, otherUid: otherUid(pair, cur.ownerUid) });
  if (bad) throw new LinkError("invalid", bad);
  let categoryId = cur.categoryId, categoryName = cur.categoryName;
  if (input.patch.categoryName !== undefined && input.patch.categoryName.trim().toLowerCase() !== cur.categoryName.trim().toLowerCase()) {
    const hit = (await origin.repo.categories.list()).find((c) => c.name.trim().toLowerCase() === input.patch.categoryName!.trim().toLowerCase());
    if (!hit) throw new LinkError("invalid", `${(await d.households.listMembers(pair.spaceId!)).find((m) => m.uid === cur.ownerUid)?.displayName ?? "They"} has no category called "${input.patch.categoryName.trim()}". Pick one of your own that they also use.`);
    categoryId = hit.id; categoryName = hit.name;
  }
  const now = new Date(d.now()).toISOString();
  const { categoryName: _c, ...rest } = input.patch; void _c;
  const next: SharedExpense = { ...applySharedPatch(cur, rest, now), categoryId, categoryName };
  const diff = sharedDiff(cur, next);
  if (!diff) return { version: cur.version ?? 0 };
  const newRec = ExpenseRecordSchema.parse({ ...recordFromShared(rec, next, origin.ctx, { categoryId, canEditBankFields: canBank }), ...(actor.uid !== cur.ownerUid ? { sharedRev: (rec.sharedRev ?? 0) + 1 } : {}) }) as ExpenseRecord;
  try { await space.sharedExpenses.put(next); }
  catch (e) { if (e instanceof ConflictError) throw new LinkError("conflict", "Someone saved this expense at the same moment. Reload to see their change; nothing was overwritten."); throw e; }
  try { await origin.repo.records.put(newRec); }
  catch (e) {
    // Keep the two in step: put the shared terms back (as a newer version) and report the failure.
    await space.sharedExpenses.put({ ...cur, version: next.version! + 1, updatedAt: now }).catch(() => undefined);
    throw e;
  }
  const fields = Object.keys(diff.after).map((k) => LABEL[k] ?? k).join(", ");
  const summary = undoes ? `Undid: ${undoes.summary}` : `Edited ${fields} of ${next.merchant}`;
  await space.audit.append({ actorId: actor.uid, action: "edit", entity: "record", entityId: cur.id, summary: summary.slice(0, 480), change: diff, ...(undoes ? { undoes: undoes.id } : {}) });
  await origin.repo.audit.append({ actorId: actor.uid, action: "edit", entity: "record", entityId: cur.id, summary: `${actor.uid === cur.ownerUid ? "Edited" : "Edited by the person you share it with"}: ${fields} of ${next.merchant}`.slice(0, 480), ...(recordDiff(rec, newRec) ? { change: recordDiff(rec, newRec) } : {}) });
  // The same record may be shared with another linked person too: keep that copy in step.
  for (const other of (await d.store.listForUser(cur.ownerUid)).filter((p) => p.id !== pair.id)) {
    const l = actionLinkOf(d, other, cur.ownerUid);
    if (l) await syncRecord(l, newRec, { categoryName: next.categoryName, names: await namesOf(origin.repo), actorUid: actor.uid });
  }
  return { version: next.version! };
}

/** Either linked person edits a shared expense. The editor says which version they saw; a stale save is refused. */
export const editShared = (d: LinkDeps, actor: LinkActor, input: SharedEdit) => applyEdit(d, actor, input);

/** Undoes the latest change on an expense (either person may). Same checks as an edit, and the undo is logged. */
export async function undoShared(d: LinkDeps, actor: LinkActor, key: string, eventId: string): Promise<{ version: number }> {
  const { space } = await open(d, actor, key);
  const events = await space.audit.list();
  const ev = events.find((e) => e.id === eventId);
  if (!ev || ev.entity !== "record" || !ev.change) throw new LinkError("not_found", "That change cannot be undone.");
  if (events.some((e) => e.undoes === ev.id)) throw new LinkError("conflict", "That change was already undone.");
  if (!undoableIds(events).has(ev.id)) throw new LinkError("conflict", "This expense has changed since. Undo the newer change first.");
  const cur = await space.sharedExpenses.get(ev.entityId);
  if (!cur) throw new LinkError("not_found", "That expense was not found.");
  const live = cur as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(ev.change.after)) if (!sameValue(live[k], v)) throw new LinkError("conflict", "This expense was changed another way since, so the undo would overwrite it.");
  const patch: Record<string, unknown> = {};
  for (const k of SHARED_FIELDS) if (k in ev.change.before) patch[k] = ev.change.before[k];
  return applyEdit(d, actor, { key, id: cur.id, ifVersion: cur.version ?? 0, patch: patch as SharedPatch }, { id: ev.id, summary: ev.summary });
}

// ---- payments between the two linked people ----

export interface PaymentInput { key: string; id: string; date: string; amountPaise: number; /** "paid": I paid them. "received": they paid me. */ direction: "paid" | "received"; note?: string }

/** Every active owner's ledger gets the payment (so every balance is right); it is also in the link space and the log. It never creates an expense. */
async function activeOwners(d: LinkDeps, pair: ContactLink): Promise<{ ctx: LinkContext; repo: Repository }[]> {
  const out = Object.keys(pair.sides).filter((u) => pair.sides[u].status === "active" && pair.sides[u].contactId).map((u) => originOf(d, pair, u));
  if (out.length === 0) throw new LinkError("conflict", "This link has ended, so payments cannot be recorded here any more.");
  return out;
}

export async function recordPayment(d: LinkDeps, actor: LinkActor, p: PaymentInput): Promise<void> {
  const { pair, space } = await open(d, actor, p.key);
  if (!Number.isSafeInteger(p.amountPaise) || p.amountPaise <= 0) throw new LinkError("invalid", "Enter a valid amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new LinkError("invalid", "Enter a valid date.");
  if (!p.id || p.id.length > 128) throw new LinkError("invalid", "Invalid payment.");
  const owners = await activeOwners(d, pair);
  if (await space.settlements.get(p.id)) throw new LinkError("conflict", "That payment is already recorded.");
  const me = linkParticipantId(actor.uid), them = linkParticipantId(otherUid(pair, actor.uid));
  const s: Settlement = { id: p.id, date: p.date, fromId: p.direction === "paid" ? me : them, toId: p.direction === "paid" ? them : me, amountPaise: p.amountPaise, ...(p.note?.trim() ? { note: p.note.trim().slice(0, 200) } : {}) };
  await space.settlements.put(s);
  for (const o of owners) {
    if (!(await o.repo.settlements.get(s.id))) await o.repo.settlements.put(settlementToOwner(s, o.ctx));
    await o.repo.audit.append({ actorId: actor.uid, action: "settle", entity: "settlement", entityId: s.id, summary: `Payment of ${money(s.amountPaise)} recorded in a linked account` });
  }
  await space.audit.append({ actorId: actor.uid, action: "settle", entity: "settlement", entityId: s.id, summary: `Payment of ${money(s.amountPaise)}` });
}

/** Either person may void a payment between them. A void is final and logged. */
export async function voidPayment(d: LinkDeps, actor: LinkActor, key: string, id: string): Promise<void> {
  const { pair, space } = await open(d, actor, key);
  const cur = await space.settlements.get(id);
  if (!cur) throw new LinkError("not_found", "That payment was not found.");
  if (cur.voided) return;
  const owners = await activeOwners(d, pair);
  await space.settlements.put({ ...cur, voided: true });
  for (const o of owners) {
    const mine = await o.repo.settlements.get(id);
    if (mine && !mine.voided) await o.repo.settlements.put({ ...mine, voided: true });
    await o.repo.audit.append({ actorId: actor.uid, action: "void_settlement", entity: "settlement", entityId: id, summary: `Voided payment of ${money(cur.amountPaise)} in a linked account` });
  }
  await space.audit.append({ actorId: actor.uid, action: "void_settlement", entity: "settlement", entityId: id, summary: `Voided payment of ${money(cur.amountPaise)}` });
}
