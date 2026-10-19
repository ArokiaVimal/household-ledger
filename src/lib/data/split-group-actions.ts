// Split Group actions: create, edit, archive, delete a group, and record or void payments inside it. Called from applyAction, which
// validates the request, writes the audit event and (for a payment involving you) the matching People-tab settlement.
// An expense joins a group by carrying `splitGroupId` through the normal record actions; `checkSplitGroupTag` guards that.
import { z } from "zod";
import type { Repository } from "@/data/repository";
import { checkGroupExpense, checkSplitGroup, peopleInUse } from "@/domain/split-groups";
import { SPLIT_GROUP_KINDS, type AuditEvent, type ExpenseRecord, type SplitGroup } from "@/domain/types";

const id = z.string().min(1).max(128);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const splitGroupActionSchemas = [
  z.object({ type: z.literal("splitGroup.put"), group: z.object({ id, name: z.string().min(1).max(60), kind: z.enum(SPLIT_GROUP_KINDS), participantIds: z.array(id).max(30), note: z.string().max(200).optional() }) }),
  z.object({ type: z.literal("splitGroup.archive"), id, archived: z.boolean() }),
  z.object({ type: z.literal("splitGroup.delete"), id }),
  z.object({ type: z.literal("splitGroup.settle"), settlement: z.object({ id, groupId: id, date: day, fromId: id, toId: id, amountPaise: z.number().int().safe().positive(), note: z.string().max(200).optional() }) }),
  z.object({ type: z.literal("splitGroup.voidSettlement"), id }),
] as const;
export type SplitGroupAction = z.infer<(typeof splitGroupActionSchemas)[number]>;

/** What the module needs from applyAction. */
export interface SplitGroupContext {
  repo: Repository;
  log: (action: AuditEvent["action"], entity: AuditEvent["entity"], entityId: string, summary: string, extra?: Pick<AuditEvent, "change" | "undoes">) => Promise<unknown>;
  /** Raised for anything the person did wrong; applyAction passes its own ActionError class in. */
  fail: (code: "invalid" | "not_found" | "conflict", message: string) => never;
  /** The signed-in person's participant id. */
  meId: string;
  /** Whether this id is someone you can put in a group (a contact of yours, you, or your linked partner). */
  isKnownPerson: (id: string) => Promise<boolean>;
  /** Runs another action (the People-tab settlement that mirrors a payment involving you). */
  ledger: (action: object) => Promise<void>;
}

const money = (p: number) => `₹${(p / 100).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const FIELDS = ["name", "kind", "participantIds", "note", "archived"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between two versions of a group (absent values are null), or null when nothing did. */
function changeOf(before: SplitGroup, after: SplitGroup): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {}, n: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const x = (before as unknown as Record<string, unknown>)[k], y = (after as unknown as Record<string, unknown>)[k];
    if (!same(x, y)) { b[k] = x ?? null; n[k] = y ?? null; }
  }
  return Object.keys(b).length ? { before: b, after: n } : null;
}

async function nameOf(repo: Repository, pid: string): Promise<string> { return (await repo.participants.get(pid))?.name ?? pid; }

/**
 * Guards a record that carries (or just lost) a group tag. Called wherever a record is written. The group must exist; a closed group takes
 * nothing new; the payer and everyone in the split must be in the group; only purchases, refunds and fees can join. Records that were
 * tagged before and are unchanged in the ways that matter are left alone, so an old trip can still be corrected after it closes.
 */
export async function checkSplitGroupTag(ctx: Pick<SplitGroupContext, "repo" | "fail">, next: ExpenseRecord, before?: ExpenseRecord | null): Promise<void> {
  if (!next.splitGroupId) return;
  const g = await ctx.repo.splitGroups.get(next.splitGroupId);
  if (!g) return ctx.fail("invalid", "That group no longer exists.");
  const unchanged = !!before && before.splitGroupId === next.splitGroupId && before.payerId === next.payerId && same(before.split, next.split) && before.kind === next.kind && before.amountPaise === next.amountPaise;
  if (unchanged) return;
  if (g.archived) return ctx.fail("conflict", `${g.name} is archived. Unarchive it to add or change its expenses.`);
  const names = new Map((await ctx.repo.participants.list()).map((p) => [p.id, p.name]));
  const bad = checkGroupExpense(g, next, (pid) => names.get(pid) ?? pid);
  if (bad) return ctx.fail("invalid", bad);
}

export async function runSplitGroupAction(ctx: SplitGroupContext, a: SplitGroupAction): Promise<void> {
  const { repo, fail } = ctx;
  const getGroup = async (gid: string) => (await repo.splitGroups.get(gid)) ?? fail("not_found", "That group was not found.");

  switch (a.type) {
    case "splitGroup.put": {
      const before = await repo.splitGroups.get(a.group.id);
      if (before?.archived) fail("conflict", `${before.name} is archived. Unarchive it to change it.`);
      const participantIds = [...new Set(a.group.participantIds)];
      const name = a.group.name.replace(/\s+/g, " ").trim();
      const bad = checkSplitGroup({ name, participantIds }, (await repo.splitGroups.list()).filter((g) => g.id !== a.group.id));
      if (bad) fail("invalid", bad);
      for (const pid of participantIds) if (!(await ctx.isKnownPerson(pid))) fail("invalid", "One of the people is not in your contacts.");
      if (before) {
        const inUse = await used(repo, before.id);
        const gone = before.participantIds.filter((pid) => !participantIds.includes(pid) && inUse.has(pid));
        if (gone.length) fail("conflict", `${await nameOf(repo, gone[0])} has expenses or payments in this group, so they cannot be removed.`);
      }
      const note = a.group.note?.trim();
      const next: SplitGroup = { id: a.group.id, name, kind: a.group.kind, participantIds, createdAt: before?.createdAt ?? today(), ...(note ? { note } : {}) };
      await repo.splitGroups.put(next);
      const change = before ? changeOf(before, next) : null;
      await ctx.log(before ? "edit" : "create", "split_group", next.id, `${before ? "Changed" : "Created"} split group ${name} with ${participantIds.length} people`, change ? { change } : {});
      return;
    }
    case "splitGroup.archive": {
      const cur = await getGroup(a.id);
      if (!!cur.archived === a.archived) return;
      const { archived: _old, ...rest } = cur; void _old;
      const next: SplitGroup = { ...rest, ...(a.archived ? { archived: true } : {}) };
      await repo.splitGroups.put(next);
      await ctx.log("edit", "split_group", a.id, `${a.archived ? "Archived" : "Reopened"} split group ${cur.name}`, { change: changeOf(cur, next)! });
      return;
    }
    case "splitGroup.delete": {
      const cur = await getGroup(a.id);
      const [records, settlements] = await Promise.all([repo.records.list(), repo.splitSettlements.list()]);
      const n = records.filter((r) => r.splitGroupId === a.id).length;
      if (n > 0) fail("conflict", `${cur.name} has ${n} expense${n === 1 ? "" : "s"}, so it cannot be deleted. Archive it instead.`);
      if (settlements.some((s) => s.groupId === a.id)) fail("conflict", `${cur.name} has payments recorded, so it cannot be deleted. Archive it instead.`);
      await repo.splitGroups.remove(a.id);
      await ctx.log("delete", "split_group", a.id, `Deleted split group ${cur.name}`);
      return;
    }
    case "splitGroup.settle": {
      const s = a.settlement;
      const g = await getGroup(s.groupId);
      if (g.archived) fail("conflict", `${g.name} is archived. Unarchive it to record a payment.`);
      if (s.fromId === s.toId) fail("invalid", "Pick two different people.");
      for (const pid of [s.fromId, s.toId]) if (!g.participantIds.includes(pid)) fail("invalid", `${await nameOf(repo, pid)} is not in ${g.name}.`);
      if (await repo.splitSettlements.get(s.id)) fail("conflict", "That payment already exists.");
      // A payment you make or receive is also a normal settlement, so your People balances move with it. It is a payment, never an expense.
      const mirrored = s.fromId === ctx.meId || s.toId === ctx.meId;
      const ledgerSettlementId = mirrored ? `${s.id}-l` : undefined;
      if (ledgerSettlementId) await ctx.ledger({ type: "settlement.create", settlement: { id: ledgerSettlementId, date: s.date, fromId: s.fromId, toId: s.toId, amountPaise: s.amountPaise, note: `${g.name}${s.note ? `: ${s.note}` : ""}`.slice(0, 500) } });
      await repo.splitSettlements.put({ id: s.id, groupId: s.groupId, date: s.date, fromId: s.fromId, toId: s.toId, amountPaise: s.amountPaise, ...(s.note?.trim() ? { note: s.note.trim() } : {}), ...(ledgerSettlementId ? { ledgerSettlementId } : {}) });
      await ctx.log("settle", "split_group", g.id, `${g.name}: ${await nameOf(repo, s.fromId)} paid ${await nameOf(repo, s.toId)} ${money(s.amountPaise)}`);
      return;
    }
    case "splitGroup.voidSettlement": {
      const cur = (await repo.splitSettlements.get(a.id)) ?? fail("not_found", "That payment was not found.");
      if (cur.voided) return;
      const g = await getGroup(cur.groupId);
      if (g.archived) fail("conflict", `${g.name} is archived. Unarchive it to void a payment.`);
      if (cur.ledgerSettlementId) await ctx.ledger({ type: "settlement.void", id: cur.ledgerSettlementId }).catch((e: { code?: string }) => { if (e?.code !== "not_found") throw e; });
      await repo.splitSettlements.put({ ...cur, voided: true });
      await ctx.log("void_settlement", "split_group", g.id, `${g.name}: voided ${await nameOf(repo, cur.fromId)} → ${await nameOf(repo, cur.toId)} ${money(cur.amountPaise)}`);
      return;
    }
  }
}

/** Undoes a group edit or archive (an audit event of entity split_group that recorded before and after). */
export async function undoSplitGroupChange(ctx: SplitGroupContext, events: AuditEvent[], ev: AuditEvent): Promise<void> {
  const { repo, fail } = ctx;
  if (!ev.change) fail("not_found", "That change cannot be undone.");
  const ix = events.findIndex((e) => e.id === ev.id);
  if (events.some((e) => e.undoes === ev.id)) fail("conflict", "That change was already undone.");
  if (events.slice(ix + 1).some((e) => e.entity === "split_group" && e.entityId === ev.entityId && e.change)) fail("conflict", "This group has changed since. Undo the newer change first.");
  const cur = (await repo.splitGroups.get(ev.entityId)) ?? fail("conflict", "That group no longer exists.");
  const live = cur as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(ev.change!.after)) if (!same(live[k], v)) fail("conflict", "This group was changed another way since, so the undo would overwrite it.");
  const next = { ...live } as Record<string, unknown>;
  for (const [k, v] of Object.entries(ev.change!.before)) { if (v === null || v === undefined) delete next[k]; else next[k] = v; }
  const group = next as unknown as SplitGroup;
  const inUse = await used(repo, group.id);
  const gone = cur.participantIds.filter((pid) => !group.participantIds.includes(pid) && inUse.has(pid));
  if (gone.length) fail("conflict", `${await nameOf(repo, gone[0])} has expenses or payments in this group, so they cannot be removed.`);
  const bad = checkSplitGroup(group, (await repo.splitGroups.list()).filter((g) => g.id !== group.id));
  if (bad) fail("conflict", bad);
  await repo.splitGroups.put(group);
  await ctx.log("edit", "split_group", group.id, `Undid: ${ev.summary}`.slice(0, 480), { undoes: ev.id, change: { before: ev.change!.after, after: ev.change!.before } });
}

async function used(repo: Repository, gid: string) { return peopleInUse(gid, await repo.records.list(), await repo.splitSettlements.list()); }
