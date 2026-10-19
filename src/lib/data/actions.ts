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
import { suggestedWithParents } from "@/domain/accounts";
import { SUGGESTED_ACCOUNTS } from "@/domain/defaults";
import { learnFromUser, memoryDocId, memoryKey } from "@/domain/memory";
import { buildShared, planShare, SharingError } from "@/domain/sharing";
import type { AuditEvent, ExpenseRecord } from "@/domain/types";

const id = z.string().min(1).max(128);
const money = z.number().int().safe();

/** Fields a person may change on an existing record. Bank-sourced fields are never in this list. */
const editable = z.object({
  merchant: z.string().min(1).max(120), categoryId: id, kind: z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]),
  payerId: id, shared: z.boolean(), split: SplitConfigSchema, excluded: z.boolean(), notes: z.string().max(1000).nullable(),
  recurringId: id.nullable(), fundedBy: id.nullable(), paidCardId: id.nullable(), recurringHint: z.boolean().nullable(), voucherBrandId: id.nullable(), paidWithVoucherId: id.nullable(), voucherPending: z.boolean().nullable(), receiptId: id.nullable(), shareNote: z.boolean(),
}).partial();

const manualRecord = z.object({
  id, date: z.string(), merchant: z.string().min(1).max(120), amountPaise: money, accountId: id, categoryId: id, kind: z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]),
  payerId: id, shared: z.boolean(), split: SplitConfigSchema, excluded: z.boolean(), notes: z.string().max(1000).optional(), recurringId: id.optional(), fundedBy: id.optional(), paidCardId: id.optional(), voucherBrandId: id.optional(), paidWithVoucherId: id.optional(),
});

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("record.create"), record: manualRecord }),
  z.object({ type: z.literal("record.update"), id, patch: editable }),
  z.object({ type: z.literal("record.approve"), id, patch: editable.optional() }),
  z.object({ type: z.literal("record.reject"), id }),
  z.object({ type: z.literal("record.delete"), id }),
  z.object({ type: z.literal("settlement.create"), settlement: z.object({ id, date: z.string(), fromId: id, toId: id, amountPaise: money, note: z.string().max(500).optional(), recordIds: z.array(id).max(500).optional() }) }),
  z.object({ type: z.literal("settlement.void"), id }),
  z.object({ type: z.literal("category.add"), id, name: z.string().max(100) }),
  z.object({ type: z.literal("category.rename"), id, name: z.string().max(100) }),
  z.object({ type: z.literal("category.delete"), id, moveTo: id.optional() }),
  z.object({ type: z.literal("rule.put"), merchant: z.string().max(100), categoryId: id }),
  z.object({ type: z.literal("rule.remove"), merchant: z.string().max(100) }),
  z.object({ type: z.literal("account.add"), id, name: z.string().min(1).max(60), accountType: z.enum(["credit_card", "bank", "upi", "cash", "wallet"]), parentId: id.optional(), theme: z.enum(["indigo", "navy", "teal", "plum", "graphite", "platinum", "ruby", "gold"]).optional() }),
  z.object({ type: z.literal("account.update"), id, name: z.string().min(1).max(60).optional(), accountType: z.enum(["credit_card", "bank", "upi", "cash", "wallet"]).optional(), parentId: id.nullable().optional(), theme: z.enum(["indigo", "navy", "teal", "plum", "graphite", "platinum", "ruby", "gold"]).nullable().optional(), archived: z.boolean().optional() }),
  z.object({ type: z.literal("account.delete"), id }),
  z.object({ type: z.literal("accounts.reorder"), ids: z.array(id).min(1).max(200) }),
  z.object({ type: z.literal("accounts.addSuggested") }),
  z.object({ type: z.literal("participant.add"), id, name: z.string().min(1).max(60) }),
  z.object({ type: z.literal("participant.delete"), id }),
  z.object({ type: z.literal("recurring.put"), item: z.object({ id, name: z.string().min(1).max(80), categoryId: id, dueDay: z.number().int().min(1).max(28), expectedPaise: z.number().int().safe().positive(), payerId: id, split: SplitConfigSchema, place: z.string().max(120).optional() }) }),
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

const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const applyPatch = (r: ExpenseRecord, patch: z.infer<typeof editable>): ExpenseRecord => {
  const next: Record<string, unknown> = { ...r };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]; // null clears an optional field
    else if (v !== undefined) next[k] = v;
  }
  return next as unknown as ExpenseRecord;
};

async function run(repo: Repository, actor: ActionActor, raw: unknown, couple?: CoupleContext | null): Promise<void> {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) throw new ActionError("invalid", "Invalid request.");
  const a = parsed.data;
  const log = (action: AuditEvent["action"], entity: AuditEvent["entity"], entityId: string, summary: string) =>
    repo.audit.append({ actorId: actor.uid, action, entity, entityId, summary: summary.slice(0, 480) });
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
      await repo.records.put(await syncShare(rec as ExpenseRecord));
      await log("create", "record", a.record.id, `Added ${a.record.merchant} ${money(a.record.amountPaise)} on ${a.record.date}`);
      return;
    }
    case "record.update":
    case "record.approve": {
      const cur = await repo.records.get(a.id);
      if (!cur) throw new ActionError("not_found", "Record not found.");
      if (a.type === "record.approve" && cur.status !== "unreviewed") throw new ActionError("conflict", "That record is already reviewed.");
      const next = applyPatch(cur, a.patch ?? {});
      if (a.type === "record.approve") { next.status = "reviewed"; delete next.suggested; }
      await checkVoucherRefs(next);
      await repo.records.put(await syncShare(next));
      // What you decide here is what the import will suggest next month.
      const decided = a.type === "record.approve" || !!(a.patch && ("categoryId" in a.patch || "merchant" in a.patch || "kind" in a.patch));
      if (decided && next.status === "reviewed") {
        const key = memoryKey(next.importSource === "Manual entry" ? next.merchant : next.originalDescription);
        if (key) await repo.merchantMemory.put(learnFromUser(await repo.merchantMemory.get(memoryDocId(key)), { key, name: next.merchant.slice(0, 60), categoryId: next.categoryId, kind: next.kind, date: next.date, voucherSeller: !!next.voucherBrandId || !!next.voucherPending }));
      }
      const brandNote = next.voucherBrandId ? ` (voucher: ${(await repo.voucherBrands.get(next.voucherBrandId))?.name ?? next.voucherBrandId})` : next.paidWithVoucherId ? ` (paid with ${(await repo.voucherBrands.get(next.paidWithVoucherId))?.name ?? next.paidWithVoucherId} voucher)` : "";
      await log(a.type === "record.approve" ? "approve" : "edit", "record", a.id, `${a.type === "record.approve" ? "Approved" : "Edited"} ${next.merchant} ${money(next.amountPaise)}${a.patch?.categoryId ? ` (category ${next.categoryId})` : ""}${brandNote}`);
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
      await repo.records.remove(a.id);
      await log("delete", "record", a.id, `Deleted ${cur.merchant} ${money(cur.amountPaise)} on ${cur.date} (${cur.status}) from ${cur.importSource}`);
      return;
    }
    case "settlement.create": {
      const target = settlementRepoFor(a.settlement.fromId, a.settlement.toId);
      if (a.settlement.fromId === a.settlement.toId) throw new ActionError("invalid", "Pick two different people.");
      if (couple !== undefined && !(await repo.participants.get(a.settlement.fromId === meParticipant ? a.settlement.toId : a.settlement.fromId)) && !(couple && [couple.partnerId].includes(a.settlement.fromId === meParticipant ? a.settlement.toId : a.settlement.fromId))) throw new ActionError("invalid", "Unknown person.");
      if (await target.settlements.get(a.settlement.id)) throw new ActionError("conflict", "That settlement already exists.");
      await target.settlements.put(a.settlement);
      await target.audit.append({ actorId: actor.uid, action: "settle", entity: "settlement", entityId: a.settlement.id, summary: `${a.settlement.fromId} paid ${a.settlement.toId} ${money(a.settlement.amountPaise)}` });
      return;
    }
    case "settlement.void": {
      const found = await findSettlement(a.id);
      if (!found) throw new ActionError("not_found", "Settlement not found.");
      const { repo: target, cur } = found;
      if (cur.voided) return;
      await target.settlements.put({ ...cur, voided: true });
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
      await repo.accounts.put(next);
      await log("edit", "household", a.id, `Changed payment method ${next.name}${a.parentId ? ` (now under ${(await repo.accounts.get(a.parentId))?.name})` : a.parentId === null ? " (now a primary payment method)" : ""}${a.archived === true ? " (hidden)" : a.archived === false ? " (shown again)" : ""}`);
      return;
    }
    case "account.delete": {
      const cur = await repo.accounts.get(a.id);
      if (!cur) throw new ActionError("not_found", "Payment method not found.");
      const [records, bills, batches, all] = await Promise.all([repo.records.list(), repo.cardBills.list(), repo.importBatches.list(), repo.accounts.list()]);
      const used = records.filter((r) => r.accountId === a.id || r.fundedBy === a.id || r.paidCardId === a.id).length + bills.filter((b) => b.accountId === a.id).length + batches.filter((b) => b.accountId === a.id).length;
      if (used > 0) throw new ActionError("conflict", `${cur.name} is used by ${used} transaction${used === 1 ? "" : "s"}, bills or imports, so it cannot be deleted. Hide it instead.`);
      if (all.some((x) => x.parentId === a.id)) throw new ActionError("conflict", `Other payment methods are under ${cur.name}. Move or delete them first.`);
      await repo.accounts.remove(a.id);
      await log("delete", "household", a.id, `Deleted payment method ${cur.name}`);
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
      const before = await repo.recurring.get(it.id);
      const place = it.place?.trim();
      await repo.recurring.put({ id: it.id, name, categoryId: it.categoryId, dueDay: it.dueDay, expectedPaise: it.expectedPaise, payerId: it.payerId, split: it.split, ...(place ? { place } : {}) });
      await log(before ? "edit" : "create", "recurring", it.id, `${before ? "Changed" : "Added"} recurring ${name} ${money(it.expectedPaise)} due on ${it.dueDay}`);
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
      await repo.participants.remove(a.id);
      await log("delete", "household", a.id, `Removed friend ${p.name}`);
      return;
    }
    case "participant.add": {
      if (await repo.participants.get(a.id)) throw new ActionError("conflict", "That person already exists.");
      await repo.participants.put({ id: a.id, name: a.name.trim(), userId: null });
      await log("create", "household", a.id, `Added participant ${a.name.trim()}`);
      return;
    }
  }
}

/** Entry point. Maps validation and invariant failures from the repository to ActionError so callers show a clean message. */
export async function applyAction(repo: Repository, actor: ActionActor, raw: unknown, couple?: CoupleContext | null): Promise<void> {
  try {
    await run(repo, actor, raw, couple);
  } catch (e) {
    if (e instanceof ActionError) throw e;
    if (e instanceof z.ZodError) throw new ActionError("invalid", e.issues[0]?.message ?? "Invalid data.");
    if (e instanceof ConflictError) throw new ActionError("conflict", e.message);
    throw e;
  }
}
