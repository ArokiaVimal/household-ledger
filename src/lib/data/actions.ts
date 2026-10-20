// Every change to household data goes through applyAction: validated input, domain rules,
// repository writes and an audit event. Pure over the Repository interface, so it is tested with
// the in-memory repository and runs unchanged against Firestore.
import { z } from "zod";
import { categoryUsage, checkDelete, cleanCategoryName, validateCategoryName } from "@/domain/categories";
import type { Repository } from "@/data/repository";
import { ConflictError } from "@/data/repository";
import { ExpenseRecordSchema, SplitConfigSchema, ruleId } from "@/data/schemas";
import { checkFriendDelete, friendUsage } from "@/domain/friends";
import { validateSplit } from "@/domain/splits";
import { checkContact, normalizeEmail } from "@/domain/contacts";
import { RELATIONSHIPS } from "@/domain/types";
import { validateAvatarDataUrl } from "@/lib/profile/profile";
import { ICON_KEYS } from "@/domain/icons";
import { LOGO_KEYS } from "@/lib/logos";
import { impliedVoucherId, planUpiSetup, suggestedWithParents } from "@/domain/accounts";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { learnFromUser, memoryDocId, memoryKey } from "@/domain/memory";
import { buildShared, planShare, SharingError } from "@/domain/sharing";
import type { AuditEvent, ExpenseRecord } from "@/domain/types";
import { namesOf, syncRecordToLinks, syncSettlement, type ActionLink } from "@/lib/links/sync";

const id = z.string().min(1).max(128);
const money = z.number().int().safe();

/** Fields a person may change on an existing record. Bank-sourced fields are never in this list. */
const editable = z.object({
  merchant: z.string().min(1).max(120), categoryId: id, kind: z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]),
  payerId: id, shared: z.boolean(), split: SplitConfigSchema, excluded: z.boolean(), notes: z.string().max(1000).nullable(),
  recurringId: id.nullable(), fundedBy: id.nullable(), paidCardId: id.nullable(), recurringHint: z.boolean().nullable(), voucherBrandId: id.nullable(), paidWithVoucherId: id.nullable(), voucherPending: z.boolean().nullable(), receiptId: id.nullable(), countsInGroupId: id.nullable(), duplicateOf: id.nullable(), shareNote: z.boolean(), accountId: id, needsCard: z.boolean().nullable(),
}).partial();

const manualRecord = z.object({
  id, date: z.string(), merchant: z.string().min(1).max(120), amountPaise: money, accountId: id, categoryId: id, kind: z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]),
  payerId: id, shared: z.boolean(), split: SplitConfigSchema, excluded: z.boolean(), notes: z.string().max(1000).optional(), recurringId: id.optional(), fundedBy: id.optional(), paidCardId: id.optional(), voucherBrandId: id.optional(), paidWithVoucherId: id.optional(),
});

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("record.create"), record: manualRecord }),
  z.object({ type: z.literal("record.update"), id, patch: editable, ifRev: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("record.approve"), id, patch: editable.optional(), ifRev: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("audit.undo"), eventId: id }),
  z.object({ type: z.literal("batch.rollback"), id }),
  z.object({ type: z.literal("record.reject"), id }),
  z.object({ type: z.literal("records.fixWallets") }),
  z.object({ type: z.literal("record.delete"), id }),
  z.object({ type: z.literal("settlement.create"), settlement: z.object({ id, date: z.string(), fromId: id, toId: id, amountPaise: money, note: z.string().max(500).optional(), recordIds: z.array(id).max(500).optional() }) }),
  z.object({ type: z.literal("settlement.void"), id }),
  z.object({ type: z.literal("category.add"), id, name: z.string().max(100) }),
  z.object({ type: z.literal("category.rename"), id, name: z.string().max(100) }),
  z.object({ type: z.literal("category.delete"), id, moveTo: id.optional() }),
  z.object({ type: z.literal("rule.put"), merchant: z.string().max(100), categoryId: id }),
  z.object({ type: z.literal("rule.remove"), merchant: z.string().max(100) }),
  z.object({ type: z.literal("account.add"), id, name: z.string().min(1).max(60), accountType: z.enum(["credit_card", "bank", "upi", "cash", "wallet"]), parentId: id.optional(), theme: z.enum(["indigo", "navy", "teal", "plum", "graphite", "platinum", "ruby", "gold"]).optional() }),
  z.object({ type: z.literal("account.update"), id, name: z.string().min(1).max(60).optional(), accountType: z.enum(["credit_card", "bank", "upi", "cash", "wallet"]).optional(), parentId: id.nullable().optional(), theme: z.enum(["indigo", "navy", "teal", "plum", "graphite", "platinum", "ruby", "gold"]).nullable().optional(), archived: z.boolean().optional(), balance: z.object({ amountPaise: z.number().int().safe(), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable().optional() }),
  z.object({ type: z.literal("account.delete"), id }),
  z.object({ type: z.literal("accounts.setupUpi") }),
  z.object({ type: z.literal("group.put"), group: z.object({ id, name: z.string().min(1).max(40), kind: z.enum(["mine", "people"]), memberIds: z.array(id).max(30), coverMembers: z.boolean(), includeMe: z.boolean() }) }),
  z.object({ type: z.literal("group.delete"), id }),
  z.object({ type: z.literal("groups.reorder"), ids: z.array(id).min(1).max(50) }),
  z.object({ type: z.literal("icons.apply"), categories: z.array(z.object({ id, icon: z.enum(ICON_KEYS) })).max(200), accounts: z.array(z.object({ id, icon: z.enum(ICON_KEYS) })).max(200), merchants: z.array(z.object({ name: z.string().min(1).max(60), icon: z.enum(ICON_KEYS).optional(), logo: z.enum(LOGO_KEYS).optional() }).refine((m) => !!m.icon || !!m.logo, "Pick an icon or a logo")).max(300) }),
  z.object({ type: z.literal("accounts.reorder"), ids: z.array(id).min(1).max(200) }),
  z.object({ type: z.literal("accounts.addSuggested") }),
  z.object({ type: z.literal("participant.add"), id, name: z.string().min(1).max(60), email: z.string().max(200).nullable().optional(), nickname: z.string().max(30).nullable().optional(), relationship: z.enum(RELATIONSHIPS).optional(), relationshipLabel: z.string().max(30).nullable().optional() }),
  z.object({ type: z.literal("participant.update"), id, name: z.string().min(1).max(60).optional(), email: z.string().max(200).nullable().optional(), nickname: z.string().max(30).nullable().optional(), relationship: z.enum(RELATIONSHIPS).optional(), relationshipLabel: z.string().max(30).nullable().optional() }),
  z.object({ type: z.literal("participant.delete"), id }),
  z.object({ type: z.literal("participant.photo"), id, photo: z.string().max(140_000).nullable() }),
  z.object({ type: z.literal("recurring.put"), item: z.object({ id, name: z.string().min(1).max(80), categoryId: id, dueDay: z.number().int().min(1).max(28), expectedPaise: z.number().int().safe().positive(), payerId: id, split: SplitConfigSchema, place: z.string().max(120).optional(), direction: z.literal("in").optional(), accountId: id.optional(), until: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), everyMonths: z.number().int().min(1).max(12).optional(), startMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(), amountVaries: z.boolean().optional(), changes: z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}$/), paise: z.number().int().safe().positive() })).max(60).optional() }) }),
  z.object({ type: z.literal("recurring.markPaid"), id, month: z.string().regex(/^\d{4}-\d{2}$/), paid: z.boolean() }),
  z.object({ type: z.literal("recurring.delete"), id }),
  z.object({ type: z.literal("cardbill.put"), bill: z.object({ id, accountId: id, statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), totalDuePaise: z.number().int().safe().positive(), source: z.enum(["statement", "manual", "message"]), batchId: id.optional(), paid: z.boolean().optional() }) }),
  z.object({ type: z.literal("cardbill.delete"), id }),
  z.object({ type: z.literal("voucherBrand.add"), id, name: z.string().max(60) }),
  z.object({ type: z.literal("voucherBrand.update"), id, name: z.string().max(60).optional(), balance: z.object({ amountPaise: z.number().int().safe().min(0), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable().optional(), tracksAllUse: z.boolean().optional() }),
  z.object({ type: z.literal("voucherBrand.delete"), id }),
]);
export type Action = z.infer<typeof ActionSchema>;

export class ActionError extends Error {
  constructor(public code: "invalid" | "not_found" | "conflict", message: string) { super(message); }
}

export interface ActionActor { uid: string }

/** The signed-in person's couple space, when they are linked. Sharing and settlements go there; everything else stays private. */
export interface CoupleContext {
  /** Repository of the couple space. */
  repo: Repository;
  meId: string;
  partnerId: string;
  /** False once either partner unlinked: the space is history only. */
  active: boolean;
}

/** The classification, split and status fields an undo can restore. Raw bank fields are never in this list. */
const UNDO_FIELDS = ["categoryId", "merchant", "kind", "excluded", "status", "split", "shared", "payerId", "notes", "recurringId", "fundedBy", "paidCardId", "voucherBrandId", "paidWithVoucherId", "voucherPending", "recurringHint", "suggested", "receiptId", "countsInGroupId", "duplicateOf"] as const;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** What changed between two versions of a record, in the undoable fields only. Absent values are stored as null. */
function changeOf(before: ExpenseRecord, after: ExpenseRecord): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {}, n: Record<string, unknown> = {};
  for (const k of UNDO_FIELDS) {
    const x = (before as unknown as Record<string, unknown>)[k], y = (after as unknown as Record<string, unknown>)[k];
    if (!sameValue(x, y)) { b[k] = x ?? null; n[k] = y ?? null; }
  }
  return Object.keys(b).length ? { before: b, after: n } : null;
}

const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const applyPatch = (r: ExpenseRecord, patch: z.infer<typeof editable>): ExpenseRecord => {
  const next: Record<string, unknown> = { ...r };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]; // null clears an optional field
    else if (v !== undefined) next[k] = v;
  }
  return next as unknown as ExpenseRecord;
};

async function run(repo: Repository, actor: ActionActor, raw: unknown, couple?: CoupleContext | null, links: ActionLink[] = []): Promise<void> {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) throw new ActionError("invalid", "Invalid request.");
  const a = parsed.data;
  const log = (action: AuditEvent["action"], entity: AuditEvent["entity"], entityId: string, summary: string, extra: Pick<AuditEvent, "change" | "undoes"> = {}) =>
    repo.audit.append({ actorId: actor.uid, action, entity, entityId, summary: summary.slice(0, 480), ...extra });
  const money = (p: number) => `₹${(p / 100).toFixed(2)}`;

  /**
   * Keeps the partner's copy in step with a private record (sharing = a split that includes the partner). The copy is
   * written first and has the record's id, so if the private write fails the same action can simply be retried.
   * Returns the record with its `sharedWithPartner` flag set to match.
   */
  const syncShare = async (rec: ExpenseRecord): Promise<ExpenseRecord> => {
    if (!couple || !couple.active) return rec;
    let plan;
    try { plan = planShare(rec, { meId: couple.meId, partnerId: couple.partnerId, coupleActive: couple.active }); }
    catch (e) { if (e instanceof SharingError) throw new ActionError("invalid", e.message); throw e; }
    const existing = await couple.repo.sharedExpenses.get(rec.id);
    const now = new Date().toISOString();
    if (plan.action === "share") {
      const categoryName = (await repo.categories.get(rec.categoryId))?.name ?? rec.categoryId;
      await couple.repo.sharedExpenses.put(buildShared(rec, { ownerUid: actor.uid, categoryName, now, createdAt: existing?.createdAt }));
      if (!existing || existing.voided) await couple.repo.audit.append({ actorId: actor.uid, action: "create", entity: "record", entityId: rec.id, summary: `Shared ${rec.merchant} ${money(rec.amountPaise)}` });
      return { ...rec, sharedWithPartner: true };
    }
    if (plan.action === "withdraw") {
      if (existing && !existing.voided) {
        await couple.repo.sharedExpenses.put({ ...existing, voided: true, updatedAt: now });
        await couple.repo.audit.append({ actorId: actor.uid, action: "delete", entity: "record", entityId: rec.id, summary: `Withdrew ${rec.merchant} ${money(rec.amountPaise)}` });
      }
      const { sharedWithPartner: _s, ...rest } = rec; void _s;
      return rest;
    }
    return rec;
  };
  /**
   * Keeps every active Friends & Family link in step with a record: its pair-scoped copy is created, updated or withdrawn.
   * Only the link space is written; the record itself is never touched here. Copies carry the record id, so a retry is safe.
   */
  const syncLinks = async (rec: ExpenseRecord): Promise<void> => {
    if (links.length === 0) return;
    await syncRecordToLinks(links, rec, { categoryName: (await repo.categories.get(rec.categoryId))?.name ?? rec.categoryId, names: await namesOf(repo), actorUid: actor.uid });
  };
  /**
   * Where a settlement lives. Between you and your linked partner it is in the couple space (both see it); with anyone else
   * (friends, an invited partner) it is in your own space. `undefined` couple (tests) keeps everything in the given repository.
   */
  const meParticipant = couple?.meId ?? `u_${actor.uid}`;
  const settlementRepoFor = (fromId: string, toId: string): Repository => {
    if (couple === undefined) return repo;
    if (![fromId, toId].includes(meParticipant)) throw new ActionError("invalid", "A settlement has to involve you.");
    const withPartner = !!couple && [fromId, toId].every((p) => p === couple.meId || p === couple.partnerId);
    if (withPartner) {
      if (!couple!.active) throw new ActionError("invalid", "You unlinked from your partner, so nothing new can be settled with them.");
      return couple!.repo;
    }
    return repo;
  };
  const findSettlement = async (id: string): Promise<{ repo: Repository; cur: NonNullable<Awaited<ReturnType<Repository["settlements"]["get"]>>> } | null> => {
    for (const r of couple === undefined ? [repo] : [...(couple ? [couple.repo] : []), repo]) { const cur = await r.settlements.get(id); if (cur) return { repo: r, cur }; }
    return null;
  };

  /** A payment method can sit under one other (not itself, not one that is already under another), and only under a card or bank account. */
  const checkParent = async (id: string, parentId: string) => {
    const parent = await repo.accounts.get(parentId);
    if (!parent || parent.id === id) throw new ActionError("invalid", "Pick a different payment method to put it under.");
    if (parent.parentId) throw new ActionError("invalid", `${parent.name} is itself under another payment method.`);
    if (parent.type !== "credit_card" && parent.type !== "bank") throw new ActionError("invalid", "Only a card or a bank account can have payment methods under it.");
    if ((await repo.accounts.list()).some((x) => x.parentId === id)) throw new ActionError("invalid", "Other payment methods are under this one, so it cannot go under another.");
  };

  /** A voucher brand named on a record must exist. (Exclusivity and "purchase only" are enforced by the record schema.) */
  const checkVoucherRefs = async (r: ExpenseRecord) => {
    for (const id of [r.voucherBrandId, r.paidWithVoucherId]) if (id && !(await repo.voucherBrands.get(id))) throw new ActionError("invalid", "Unknown voucher brand.");
  };

  switch (a.type) {
    case "voucherBrand.add": {
      const name = a.name.replace(/\s+/g, " ").trim();
      if (!name || name.length > 40) throw new ActionError("invalid", "Enter a voucher name (up to 40 characters).");
      const all = await repo.voucherBrands.list();
      if (all.some((b) => b.id === a.id)) throw new ActionError("conflict", "That voucher already exists.");
      if (all.some((b) => b.name.toLowerCase() === name.toLowerCase())) throw new ActionError("conflict", "You already have a voucher with that name.");
      await repo.voucherBrands.put({ id: a.id, name });
      await log("create", "household", a.id, `Added voucher brand ${name}`);
      return;
    }
    case "voucherBrand.update": {
      const cur = await repo.voucherBrands.get(a.id);
      if (!cur) throw new ActionError("not_found", "Voucher not found.");
      const next = { ...cur };
      if (a.name !== undefined) {
        const name = a.name.replace(/\s+/g, " ").trim();
        if (!name || name.length > 40) throw new ActionError("invalid", "Enter a voucher name (up to 40 characters).");
        if ((await repo.voucherBrands.list()).some((b) => b.id !== a.id && b.name.toLowerCase() === name.toLowerCase())) throw new ActionError("conflict", "You already have a voucher with that name.");
        next.name = name;
      }
      if (a.balance === null) delete next.balance; else if (a.balance) next.balance = a.balance;
      if (a.tracksAllUse !== undefined) { if (a.tracksAllUse) next.tracksAllUse = true; else delete next.tracksAllUse; }
      await repo.voucherBrands.put(next);
      await log("edit", "household", a.id, `Changed voucher ${next.name}${a.balance ? ` balance ${money(a.balance.amountPaise)} as of ${a.balance.asOf}` : ""}`);
      return;
    }
    case "voucherBrand.delete": {
      const cur = await repo.voucherBrands.get(a.id);
      if (!cur) throw new ActionError("not_found", "Voucher not found.");
      const used = (await repo.records.list()).filter((r) => r.voucherBrandId === a.id || r.paidWithVoucherId === a.id).length;
      if (used > 0) throw new ActionError("conflict", `${used} transaction${used === 1 ? " is" : "s are"} attributed to ${cur.name}, so it cannot be removed. Rename it instead.`);
      await repo.voucherBrands.remove(a.id);
      await log("delete", "household", a.id, `Removed voucher brand ${cur.name}`);
      return;
    }
    case "record.create": {
      if (await repo.records.get(a.record.id)) throw new ActionError("conflict", "That record already exists.");
      const rec = ExpenseRecordSchema.parse({
        ...strip(a.record), currency: "INR", status: "reviewed", importSource: "Manual entry", originalDescription: "Entered manually",
      });
      await checkVoucherRefs(rec as ExpenseRecord);
      const shared = await syncShare(rec as ExpenseRecord);
      await syncLinks(shared);
      await repo.records.put(shared);
      await log("create", "record", a.record.id, `Added ${a.record.merchant} ${money(a.record.amountPaise)} on ${a.record.date}`);
      return;
    }
    case "record.update":
    case "record.approve": {
      const cur = await repo.records.get(a.id);
      if (!cur) throw new ActionError("not_found", "Record not found.");
      if (a.type === "record.approve" && cur.status !== "unreviewed") throw new ActionError("conflict", "That record is already reviewed.");
      // A linked person changed the shared terms since this screen loaded: refuse rather than silently overwrite their edit.
      if (a.ifRev !== undefined && a.ifRev !== (cur.sharedRev ?? 0)) throw new ActionError("conflict", "Someone you share this expense with changed it while you were editing. Your screen has been refreshed; nothing was overwritten.");
      if (a.patch?.accountId && a.patch.accountId !== cur.accountId) {
        // Fixing a wrong payment method: it must be one of your own, still in use.
        const acc = await repo.accounts.get(a.patch.accountId);
        if (!acc || acc.archived) throw new ActionError("invalid", "Unknown payment method.");
      }
      const next = applyPatch(cur, a.patch ?? {});
      // Leaving a voucher wallet takes the wallet's "paid with voucher" mark along, unless the patch says otherwise.
      if (a.patch?.accountId && a.patch.accountId !== cur.accountId && !("paidWithVoucherId" in a.patch)) {
        const [oldAcc, brands] = await Promise.all([repo.accounts.get(cur.accountId), repo.voucherBrands.list()]);
        const was = impliedVoucherId(oldAcc ?? undefined, cur.kind, brands);
        if (was && cur.paidWithVoucherId === was) delete next.paidWithVoucherId;
      }
      if (a.type === "record.approve") { next.status = "reviewed"; delete next.suggested; }
      // Money spent from a voucher wallet (Amazon Pay) is paid with that voucher: the voucher purchase was the outflow.
      if (!next.paidWithVoucherId) {
        const w = impliedVoucherId((await repo.accounts.get(next.accountId)) ?? undefined, next.kind, await repo.voucherBrands.list());
        if (w) next.paidWithVoucherId = w;
      }
      await checkVoucherRefs(next);
      const shared = await syncShare(next);
      await syncLinks(shared);
      await repo.records.put(shared);
      // What you decide here is what the import will suggest next month.
      const decided = a.type === "record.approve" || !!(a.patch && ("categoryId" in a.patch || "merchant" in a.patch || "kind" in a.patch));
      if (decided && next.status === "reviewed") {
        const key = memoryKey(next.importSource === "Manual entry" ? next.merchant : next.originalDescription);
        if (key) await repo.merchantMemory.put(learnFromUser(await repo.merchantMemory.get(memoryDocId(key)), { key, name: next.merchant.slice(0, 60), categoryId: next.categoryId, kind: next.kind, date: next.date, voucherSeller: !!next.voucherBrandId || !!next.voucherPending }));
      }
      const brandNote = next.voucherBrandId ? ` (voucher: ${(await repo.voucherBrands.get(next.voucherBrandId))?.name ?? next.voucherBrandId})` : next.paidWithVoucherId ? ` (paid with ${(await repo.voucherBrands.get(next.paidWithVoucherId))?.name ?? next.paidWithVoucherId} voucher)` : "";
      const change = changeOf(cur, shared);
      await log(a.type === "record.approve" ? "approve" : "edit", "record", a.id, `${a.type === "record.approve" ? "Approved" : "Edited"} ${next.merchant} ${money(next.amountPaise)}${a.patch?.categoryId ? ` (category ${next.categoryId})` : ""}${brandNote}`, change ? { change } : {});
      return;
    }
    case "audit.undo": {
      const events = await repo.audit.list();
      const ix = events.findIndex((e) => e.id === a.eventId);
      const ev = events[ix];
      if (!ev || ev.entity !== "record" || !ev.change) throw new ActionError("not_found", "That change cannot be undone.");
      if (events.some((e) => e.undoes === ev.id)) throw new ActionError("conflict", "That change was already undone.");
      if (events.slice(ix + 1).some((e) => e.entity === "record" && e.entityId === ev.entityId && e.change)) throw new ActionError("conflict", "This transaction has changed since. Undo the newer change first.");
      const cur = await repo.records.get(ev.entityId);
      if (!cur) throw new ActionError("conflict", "That transaction no longer exists.");
      const live = cur as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(ev.change.after)) if (!sameValue(live[k], v)) throw new ActionError("conflict", "This transaction was changed another way since, so the undo would overwrite it.");
      const next = { ...live } as Record<string, unknown>;
      for (const [k, v] of Object.entries(ev.change.before)) { if (v === null || v === undefined) delete next[k]; else next[k] = v; }
      const rec = next as unknown as ExpenseRecord;
      await checkVoucherRefs(rec);
      const shared = await syncShare(rec);
      await syncLinks(shared);
      await repo.records.put(shared);
      await log("edit", "record", ev.entityId, `Undid: ${ev.summary}`.slice(0, 480), { undoes: ev.id, change: { before: ev.change.after, after: ev.change.before } });
      return;
    }
    case "batch.rollback": {
      const batch = await repo.importBatches.get(a.id);
      if (!batch) throw new ActionError("not_found", "That import was not found.");
      if (batch.rolledBackAt) throw new ActionError("conflict", "That import was already rolled back.");
      const tag = `(import ${batch.id.slice(0, 8)})`;
      const rows = (await repo.records.list()).filter((r) => r.batchId === batch.id || r.importSource.endsWith(tag));
      const settled = new Set((await repo.settlements.list()).filter((s) => !s.voided).flatMap((s) => s.recordIds ?? []));
      const blocked = rows.filter((r) => settled.has(r.id));
      if (blocked.length > 0) throw new ActionError("conflict", `${blocked.length} of this import's transactions are part of settlements. Void those settlements first, so nobody's balance changes by accident.`);
      for (const r of rows) {
        if (r.sharedWithPartner) await syncShare({ ...r, excluded: true });
        await syncLinks({ ...r, excluded: true });
        await repo.records.remove(r.id);
      }
      for (const b of (await repo.cardBills.list()).filter((x) => x.batchId === batch.id)) await repo.cardBills.remove(b.id);
      await repo.importBatches.put({ ...batch, rolledBackAt: new Date().toISOString(), rolledBackBy: actor.uid });
      await log("delete", "household", batch.id, `Rolled back import ${batch.filename}: removed ${rows.length} transaction${rows.length === 1 ? "" : "s"} (${rows.filter((r) => r.status === "reviewed").length} approved). The source rows are kept.`);
      return;
    }
    case "records.fixWallets": {
      // One-time repair: purchases already filed under a voucher wallet get the "paid with voucher" mark.
      const [accounts, brands] = await Promise.all([repo.accounts.list(), repo.voucherBrands.list()]);
      let fixed = 0;
      for (const r of await repo.records.list()) {
        if (r.paidWithVoucherId) continue;
        const w = impliedVoucherId(accounts.find((x) => x.id === r.accountId), r.kind, brands);
        if (!w) continue;
        await repo.records.put({ ...r, paidWithVoucherId: w });
        fixed++;
      }
      if (fixed > 0) await log("edit", "record", "wallets", `Marked ${fixed} wallet payment${fixed === 1 ? "" : "s"} as paid with the wallet's voucher`);
      return;
    }
    case "record.reject": {
      const cur = await repo.records.get(a.id);
      if (!cur) throw new ActionError("not_found", "Record not found.");
      if (cur.status !== "unreviewed") throw new ActionError("conflict", "Only rows waiting for review can be rejected.");
      await repo.records.remove(a.id);
      await log("reject", "record", a.id, `Rejected ${cur.merchant} ${money(cur.amountPaise)} on ${cur.date} from ${cur.importSource}`);
      return;
    }
    case "record.delete": {
      const cur = await repo.records.get(a.id);
      if (!cur) throw new ActionError("not_found", "Record not found.");
      if (cur.sharedWithPartner) await syncShare({ ...cur, excluded: true }); // deleting withdraws the partner's copy first
      await syncLinks({ ...cur, excluded: true }); // and any linked friend's or family member's copy
      await repo.records.remove(a.id);
      // Anything that was flagged as a possible duplicate of this one is no longer one.
      for (const o of (await repo.records.list()).filter((x) => x.duplicateOf === a.id)) { const { duplicateOf: _d, ...rest } = o; void _d; await repo.records.put(rest as ExpenseRecord); }
      await log("delete", "record", a.id, `Deleted ${cur.merchant} ${money(cur.amountPaise)} on ${cur.date} (${cur.status}) from ${cur.importSource}`);
      return;
    }
    case "settlement.create": {
      const target = settlementRepoFor(a.settlement.fromId, a.settlement.toId);
      if (a.settlement.fromId === a.settlement.toId) throw new ActionError("invalid", "Pick two different people.");
      if (couple !== undefined && !(await repo.participants.get(a.settlement.fromId === meParticipant ? a.settlement.toId : a.settlement.fromId)) && !(couple && [couple.partnerId].includes(a.settlement.fromId === meParticipant ? a.settlement.toId : a.settlement.fromId))) throw new ActionError("invalid", "Unknown person.");
      if (await target.settlements.get(a.settlement.id)) throw new ActionError("conflict", "That settlement already exists.");
      await target.settlements.put(a.settlement);
      if (target === repo) for (const l of links) await syncSettlement(l, a.settlement, actor.uid); // a payment between you and a linked contact is mirrored
      await target.audit.append({ actorId: actor.uid, action: "settle", entity: "settlement", entityId: a.settlement.id, summary: `${a.settlement.fromId} paid ${a.settlement.toId} ${money(a.settlement.amountPaise)}` });
      return;
    }
    case "settlement.void": {
      const found = await findSettlement(a.id);
      if (!found) throw new ActionError("not_found", "Settlement not found.");
      const { repo: target, cur } = found;
      if (cur.voided) return;
      await target.settlements.put({ ...cur, voided: true });
      if (target === repo) for (const l of links) await syncSettlement(l, { ...cur, voided: true }, actor.uid);
      await target.audit.append({ actorId: actor.uid, action: "void_settlement", entity: "settlement", entityId: a.id, summary: `Voided settlement of ${money(cur.amountPaise)}` });
      return;
    }
    case "category.add": {
      const existing = await repo.categories.list();
      const err = validateCategoryName(a.name, existing);
      if (err) throw new ActionError("invalid", err);
      if (existing.some((c) => c.id === a.id)) throw new ActionError("conflict", "That category already exists.");
      await repo.categories.put({ id: a.id, name: cleanCategoryName(a.name) });
      await log("create", "household", a.id, `Added category ${cleanCategoryName(a.name)}`);
      return;
    }
    case "category.rename": {
      const existing = await repo.categories.list();
      if (!existing.some((c) => c.id === a.id)) throw new ActionError("not_found", "Category not found.");
      const err = validateCategoryName(a.name, existing, a.id);
      if (err) throw new ActionError("invalid", err);
      await repo.categories.put({ id: a.id, name: cleanCategoryName(a.name) });
      await log("edit", "household", a.id, `Renamed category to ${cleanCategoryName(a.name)}`);
      return;
    }
    case "category.delete": {
      const [cats, records, recurring, rules] = await Promise.all([repo.categories.list(), repo.records.list(), repo.recurring.list(), repo.rules.list()]);
      const cat = cats.find((c) => c.id === a.id);
      if (!cat) throw new ActionError("not_found", "Category not found.");
      const used = categoryUsage(records, a.id);
      const check = checkDelete(a.id, { records: used, recurringItems: recurring.filter((r) => r.categoryId === a.id).map((r) => r.name) });
      if (!check.ok) throw new ActionError("conflict", check.reason);
      if (check.needsMove && (!a.moveTo || a.moveTo === a.id || !cats.some((c) => c.id === a.moveTo))) throw new ActionError("invalid", "Choose a category to move them to.");
      if (a.moveTo) {
        for (const r of records.filter((x) => x.categoryId === a.id)) await repo.records.put({ ...r, categoryId: a.moveTo });
        for (const r of rules.filter((x) => x.categoryId === a.id)) await repo.rules.put({ ...r, categoryId: a.moveTo });
      } else {
        for (const r of rules.filter((x) => x.categoryId === a.id)) await repo.rules.remove(r.id);
      }
      await repo.categories.remove(a.id);
      await log("delete", "household", a.id, `Deleted category ${cat.name}${a.moveTo ? `, moved ${used} transactions` : ""}`);
      return;
    }
    case "rule.put": {
      const merchant = a.merchant.trim();
      if (!merchant) throw new ActionError("invalid", "Enter a merchant.");
      if (!(await repo.categories.get(a.categoryId))) throw new ActionError("invalid", "Unknown category.");
      await repo.rules.put({ id: ruleId(merchant), merchant, categoryId: a.categoryId });
      await log("edit", "household", ruleId(merchant), `Rule: ${merchant} -> ${a.categoryId}`);
      return;
    }
    case "rule.remove": {
      await repo.rules.remove(ruleId(a.merchant));
      await log("delete", "household", ruleId(a.merchant), `Removed rule for ${a.merchant.trim()}`);
      return;
    }
    case "account.add": {
      if (await repo.accounts.get(a.id)) throw new ActionError("conflict", "That account already exists.");
      if (a.parentId) await checkParent(a.id, a.parentId);
      await repo.accounts.put({ id: a.id, name: a.name.trim(), type: a.accountType, ...(a.parentId ? { parentId: a.parentId } : {}), ...(a.theme ? { theme: a.theme } : {}) });
      await log("create", "household", a.id, `Added payment method ${a.name.trim()}${a.parentId ? ` under ${(await repo.accounts.get(a.parentId))?.name}` : ""}`);
      return;
    }
    case "account.update": {
      const cur = await repo.accounts.get(a.id);
      if (!cur) throw new ActionError("not_found", "Payment method not found.");
      const next = { ...cur };
      const all = await repo.accounts.list();
      if (a.name !== undefined) {
        const name = a.name.trim();
        if (!name) throw new ActionError("invalid", "Enter a name.");
        if (all.some((x) => x.id !== a.id && x.name.toLowerCase() === name.toLowerCase())) throw new ActionError("conflict", "You already have a payment method with that name.");
        next.name = name;
      }
      if (a.accountType !== undefined && a.accountType !== cur.type) {
        // A card or bank can have others under it, and a card can have bills; changing the type must not strand either.
        if (a.accountType !== "credit_card" && a.accountType !== "bank" && all.some((x) => x.parentId === a.id)) throw new ActionError("invalid", "Other payment methods are under this one, so it has to stay a card or a bank account.");
        if (a.accountType !== "credit_card" && (await repo.cardBills.list()).some((b) => b.accountId === a.id)) throw new ActionError("invalid", "This card has bills, so it has to stay a credit card.");
        next.type = a.accountType;
      }
      if (a.parentId === null) delete next.parentId;
      else if (a.parentId) { await checkParent(a.id, a.parentId); next.parentId = a.parentId; }
      if (a.parentId !== undefined && !next.parentId) { /* now a primary payment method */ }
      if (a.theme === null) delete next.theme; else if (a.theme) next.theme = a.theme;
      if (a.archived !== undefined) {
        if (a.archived && all.some((x) => x.parentId === a.id && !x.archived)) throw new ActionError("invalid", "Hide the payment methods under it first.");
        if (a.archived) next.archived = true; else delete next.archived;
      }
      if (a.balance === null) delete next.balance;
      else if (a.balance) {
        if (next.type !== "bank" && next.type !== "cash") throw new ActionError("invalid", "Only a bank account or cash can have a recorded balance.");
        next.balance = a.balance;
      }
      await repo.accounts.put(next);
      await log("edit", "household", a.id, `Changed payment method ${next.name}${a.parentId ? ` (now under ${(await repo.accounts.get(a.parentId))?.name})` : a.parentId === null ? " (now a primary payment method)" : ""}${a.archived === true ? " (hidden)" : a.archived === false ? " (shown again)" : ""}`);
      return;
    }
    case "account.delete": {
      const cur = await repo.accounts.get(a.id);
      if (!cur) throw new ActionError("not_found", "Payment method not found.");
      const [records, bills, batches, all, recurringAll] = await Promise.all([repo.records.list(), repo.cardBills.list(), repo.importBatches.list(), repo.accounts.list(), repo.recurring.list()]);
      const used = records.filter((r) => r.accountId === a.id || r.fundedBy === a.id || r.paidCardId === a.id).length + bills.filter((b) => b.accountId === a.id).length + batches.filter((b) => b.accountId === a.id).length + recurringAll.filter((x) => x.accountId === a.id).length;
      if (used > 0) throw new ActionError("conflict", `${cur.name} is used by ${used} transaction${used === 1 ? "" : "s"}, bills or imports, so it cannot be deleted. Hide it instead.`);
      if (all.some((x) => x.parentId === a.id)) throw new ActionError("conflict", `Other payment methods are under ${cur.name}. Move or delete them first.`);
      await repo.accounts.remove(a.id);
      await log("delete", "household", a.id, `Deleted payment method ${cur.name}`);
      return;
    }
    case "group.put": {
      const g = a.group;
      const name = g.name.trim();
      if (!name) throw new ActionError("invalid", "Give the group a name.");
      const all = await repo.paymentGroups.list();
      if (all.some((x) => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase())) throw new ActionError("conflict", "You already have a group with that name.");
      if (g.kind === "mine" && all.some((x) => x.id !== g.id && x.kind === "mine")) throw new ActionError("conflict", "There can only be one Mine group.");
      const before = all.find((x) => x.id === g.id);
      const memberIds = [...new Set(g.memberIds)];
      const order = before?.order ?? (g.kind === "mine" ? 0 : all.length);
      await repo.paymentGroups.put({ id: g.id, name, kind: g.kind, memberIds: g.kind === "mine" ? [] : memberIds, coverMembers: g.kind === "mine" ? false : g.coverMembers, includeMe: g.kind === "mine" ? true : g.includeMe, order });
      await log(before ? "edit" : "create", "household", g.id, `${before ? "Changed" : "Added"} payment group ${name}`);
      return;
    }
    case "group.delete": {
      const cur = await repo.paymentGroups.get(a.id);
      if (!cur) throw new ActionError("not_found", "That group was not found.");
      if (cur.kind === "mine") throw new ActionError("invalid", "Mine cannot be deleted. You can rename it.");
      await repo.paymentGroups.remove(a.id);
      await log("delete", "household", a.id, `Removed payment group ${cur.name}`);
      return;
    }
    case "groups.reorder": {
      const all = await repo.paymentGroups.list();
      const byId = new Map(all.map((x) => [x.id, x]));
      if (new Set(a.ids).size !== a.ids.length || a.ids.some((i) => !byId.has(i))) throw new ActionError("invalid", "That order includes a group that does not exist.");
      for (const [i, gid] of a.ids.entries()) await repo.paymentGroups.put({ ...byId.get(gid)!, order: i });
      await log("edit", "household", "groups", "Reordered payment groups");
      return;
    }
    case "icons.apply": {
      const [cats, accts, memories] = await Promise.all([repo.categories.list(), repo.accounts.list(), repo.merchantMemory.list()]);
      let n = 0;
      for (const x of a.categories) { const c = cats.find((y) => y.id === x.id); if (c) { await repo.categories.put({ ...c, icon: x.icon }); n++; } }
      for (const x of a.accounts) { const c = accts.find((y) => y.id === x.id); if (c) { await repo.accounts.put({ ...c, icon: x.icon }); n++; } }
      // A merchant shows either a logo or an icon: choosing one replaces the other.
      for (const x of a.merchants) for (const m of memories.filter((y) => y.name.toLowerCase() === x.name.toLowerCase())) {
        const { icon: _i, logo: _l, ...rest } = m; void _i; void _l;
        await repo.merchantMemory.put({ ...rest, ...(x.logo ? { logo: x.logo } : { icon: x.icon }) }); n++;
      }
      await log("edit", "household", "icons", `Set ${n} icons`);
      return;
    }
    case "accounts.setupUpi": {
      const plan = planUpiSetup(await repo.accounts.list());
      for (const acc of plan.add) await repo.accounts.put(acc);
      for (const id of plan.hide) { const cur = await repo.accounts.get(id); if (cur) await repo.accounts.put({ ...cur, archived: true }); }
      await log("create", "household", "accounts", `Set up UPI apps under banks: ${plan.add.length} added, ${plan.hide.length} old ones hidden`);
      return;
    }
    case "accounts.reorder": {
      const all = await repo.accounts.list();
      const byId = new Map(all.map((x) => [x.id, x]));
      if (new Set(a.ids).size !== a.ids.length || a.ids.some((i) => !byId.has(i))) throw new ActionError("invalid", "That order includes a payment method that does not exist.");
      for (const [i, accId] of a.ids.entries()) await repo.accounts.put({ ...byId.get(accId)!, order: i });
      await log("edit", "household", "accounts", "Reordered payment methods");
      return;
    }
    case "accounts.addSuggested": {
      const existing = await repo.accounts.list();
      const have = new Set(existing.map((x) => x.id));
      const add = suggestedWithParents(SUGGESTED_ACCOUNTS.filter((x) => !have.has(x.id)), existing);
      for (const acc of add) await repo.accounts.put(acc);
      await log("create", "household", "accounts", `Added ${add.length} suggested payment methods`);
      return;
    }
    case "recurring.put": {
      const it = a.item;
      const name = it.name.trim();
      if (!name) throw new ActionError("invalid", "Give it a name.");
      if (!(await repo.categories.get(it.categoryId))) throw new ActionError("invalid", "Unknown category.");
      if (!(await repo.participants.get(it.payerId))) throw new ActionError("invalid", "Unknown payer.");
      const splitError = validateSplit(it.expectedPaise, it.split);
      if (splitError) throw new ActionError("invalid", splitError);
      if (it.everyMonths && it.everyMonths > 1 && !it.startMonth) throw new ActionError("invalid", "Say which month the first bill is due.");
      if (it.accountId && !(await repo.accounts.get(it.accountId))) throw new ActionError("invalid", "Unknown payment method.");
      const before = await repo.recurring.get(it.id);
      const place = it.place?.trim();
      await repo.recurring.put({ id: it.id, name, categoryId: it.categoryId, dueDay: it.dueDay, expectedPaise: it.expectedPaise, payerId: it.payerId, split: it.split, ...(place ? { place } : {}), ...(it.direction ? { direction: it.direction } : {}), ...(it.accountId ? { accountId: it.accountId } : {}), ...(it.until ? { until: it.until.slice(0, 7) } : {}), ...(it.everyMonths && it.everyMonths > 1 ? { everyMonths: it.everyMonths, startMonth: it.startMonth } : {}), ...(it.amountVaries ? { amountVaries: true } : {}), ...(it.changes?.length ? { changes: it.changes } : {}), ...(before?.paidMonths?.length ? { paidMonths: before.paidMonths } : {}) });
      await log(before ? "edit" : "create", "recurring", it.id, `${before ? "Changed" : "Added"} recurring ${name} ${money(it.expectedPaise)} due on ${it.dueDay}`);
      return;
    }
    case "recurring.markPaid": {
      const item = await repo.recurring.get(a.id);
      if (!item) throw new ActionError("not_found", "That recurring item was not found.");
      const months = new Set(item.paidMonths ?? []);
      if (a.paid) months.add(a.month); else months.delete(a.month);
      const { paidMonths: _old, ...rest } = item; void _old;
      await repo.recurring.put({ ...rest, ...(months.size ? { paidMonths: [...months].sort() } : {}) });
      await log("edit", "recurring", a.id, `${a.paid ? "Marked" : "Unmarked"} ${item.name} paid for ${a.month}`);
      return;
    }
    case "cardbill.put": {
      const b = a.bill;
      const card = await repo.accounts.get(b.accountId);
      if (!card || card.type !== "credit_card") throw new ActionError("invalid", "Pick one of your credit cards.");
      if (b.dueDate < b.statementDate) throw new ActionError("invalid", "The due date cannot be before the statement date.");
      const before = await repo.cardBills.get(b.id);
      await repo.cardBills.put({ id: b.id, accountId: b.accountId, statementDate: b.statementDate, dueDate: b.dueDate, totalDuePaise: b.totalDuePaise, source: b.source, ...(b.batchId ? { batchId: b.batchId } : {}), ...(b.paid ? { paid: true } : {}) });
      await log(before ? "edit" : "create", "household", b.id, `${before ? "Changed" : "Added"} ${card.name} bill ${money(b.totalDuePaise)} due ${b.dueDate}`);
      return;
    }
    case "cardbill.delete": {
      const cur = await repo.cardBills.get(a.id);
      if (!cur) throw new ActionError("not_found", "That bill was not found.");
      await repo.cardBills.remove(a.id);
      await log("delete", "household", a.id, `Removed card bill due ${cur.dueDate}`);
      return;
    }
    case "recurring.delete": {
      const item = await repo.recurring.get(a.id);
      if (!item) throw new ActionError("not_found", "That recurring item was not found.");
      // Payments stay exactly as they are; they just stop being tied to a commitment that no longer exists.
      for (const r of (await repo.records.list()).filter((x) => x.recurringId === a.id)) { const { recurringId: _gone, ...rest } = r; void _gone; await repo.records.put(rest); }
      await repo.recurring.remove(a.id);
      await log("delete", "recurring", a.id, `Removed recurring ${item.name}`);
      return;
    }
    case "participant.delete": {
      const [p, records, settlements, recurring] = await Promise.all([repo.participants.get(a.id), repo.records.list(), repo.settlements.list(), repo.recurring.list()]);
      const check = checkFriendDelete(p ?? undefined, `u_${actor.uid}`, friendUsage(a.id, { records, settlements, recurring }));
      if (!p) throw new ActionError("not_found", "That person was not found.");
      if (!check.ok) throw new ActionError("conflict", check.reason);
      if (p.linkId) throw new ActionError("conflict", `${p.name} is linked to an account. Unlink first (Settings, Friends & Family), then you can remove them.`);
      await repo.participants.remove(a.id);
      await log("delete", "household", a.id, `Removed friend ${p.name}`);
      return;
    }
    case "participant.photo": {
      const p = await repo.participants.get(a.id);
      if (!p) throw new ActionError("not_found", "That person was not found.");
      if (a.photo) { const bad = validateAvatarDataUrl(a.photo); if (bad) throw new ActionError("invalid", bad); }
      const { photo: _old, ...rest } = p; void _old;
      await repo.participants.put({ ...rest, ...(a.photo ? { photo: a.photo } : {}) });
      await log("edit", "household", a.id, `${a.photo ? "Set" : "Removed"} the photo of ${p.name}`);
      return;
    }
    case "participant.add": {
      if (await repo.participants.get(a.id)) throw new ActionError("conflict", "That person already exists.");
      const rel = a.relationship ?? "friend";
      const bad = checkContact({ name: a.name, email: a.email, nickname: a.nickname, relationship: rel, relationshipLabel: a.relationshipLabel }, await repo.participants.list());
      if (bad) throw new ActionError("invalid", bad);
      await repo.participants.put({ id: a.id, name: a.name.trim(), userId: null, ...(a.nickname?.trim() ? { nickname: a.nickname.trim() } : {}), relationship: rel, ...(rel === "custom" && a.relationshipLabel?.trim() ? { relationshipLabel: a.relationshipLabel.trim() } : {}), ...(a.email?.trim() ? { email: normalizeEmail(a.email) } : {}) });
      await log("create", "household", a.id, `Added contact ${a.name.trim()}`);
      return;
    }
    case "participant.update": {
      const cur = await repo.participants.get(a.id);
      if (!cur) throw new ActionError("not_found", "That person was not found.");
      if (cur.id === `u_${actor.uid}`) throw new ActionError("invalid", "Change your own details in your profile.");
      if (cur.pendingEmail) throw new ActionError("conflict", `${cur.name} is an invited partner. Manage the invitation under Partner.`);
      const linked = !!cur.userId; // someone with an account owns their name and email; only the relationship is yours to set
      const next = { name: linked ? cur.name : (a.name ?? cur.name), nickname: a.nickname === undefined ? cur.nickname : a.nickname, email: linked ? cur.email : a.email === undefined ? cur.email : a.email, relationship: a.relationship ?? cur.relationship ?? "friend", relationshipLabel: a.relationshipLabel === undefined ? cur.relationshipLabel : a.relationshipLabel };
      const others = (await repo.participants.list()).filter((p) => p.id !== a.id);
      const bad = checkContact(next, others);
      if (bad) throw new ActionError("invalid", bad);
      const { email: _e, relationshipLabel: _l, relationship: _r, nickname: _n, ...rest } = cur; void _e; void _l; void _r; void _n;
      await repo.participants.put({ ...rest, name: next.name.trim(), ...(next.nickname?.trim() ? { nickname: next.nickname.trim() } : {}), relationship: next.relationship, ...(next.relationship === "custom" && next.relationshipLabel?.trim() ? { relationshipLabel: next.relationshipLabel.trim() } : {}), ...(next.email?.trim() ? { email: normalizeEmail(next.email) } : {}) });
      await log("edit", "household", a.id, `Changed contact ${next.name.trim()}`);
      return;
    }
  }
}

/** Entry point. Maps validation and invariant failures from the repository to ActionError so callers show a clean message. */
export async function applyAction(repo: Repository, actor: ActionActor, raw: unknown, couple?: CoupleContext | null, links: ActionLink[] = []): Promise<void> {
  try {
    await run(repo, actor, raw, couple, links);
  } catch (e) {
    if (e instanceof ActionError) throw e;
    if (e instanceof z.ZodError) throw new ActionError("invalid", e.issues[0]?.message ?? "Invalid data.");
    if (e instanceof ConflictError) throw new ActionError("conflict", e.message);
    throw e;
  }
}
