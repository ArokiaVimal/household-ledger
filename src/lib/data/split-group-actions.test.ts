import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import { undoableIds } from "@/domain/audit";
import { groupBalances } from "@/domain/split-groups";
import type { ExpenseRecord } from "@/domain/types";
import { ActionError, applyAction } from "./actions";

const actor = { uid: "u1" };
const ME = "u_u1";
const group = { id: "g1", name: "Goa trip", kind: "trip" as const, participantIds: [ME, "asha", "ben"] };
const rec = (o: Record<string, unknown> = {}) => ({
  id: "e1", date: "2026-10-02", merchant: "Beach shack", amountPaise: 90000, accountId: "cash", categoryId: "food", kind: "purchase" as const, payerId: ME, shared: true,
  split: { mode: "equal" as const, participantIds: [ME, "asha", "ben"] }, excluded: false, splitGroupId: "g1", ...o,
});
const imported = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "imp1", date: "2026-10-03", merchant: "Zomato", originalDescription: "ZOMATO", amountPaise: 60000, currency: "INR", accountId: "cash", categoryId: "food", kind: "purchase",
  payerId: ME, shared: false, split: { mode: "personal", participantIds: [ME] }, excluded: false, status: "unreviewed", importSource: "HDFC.csv", referenceId: "R1", ...o,
});

async function setup(): Promise<Repository> {
  const repo = createMemoryRepository("h1");
  await repo.categories.put({ id: "food", name: "Food" });
  await repo.accounts.put({ id: "cash", name: "Cash", type: "cash" });
  for (const [id, name] of [[ME, "Vimal"], ["asha", "Asha"], ["ben", "Ben"], ["cy", "Cy"]]) await repo.participants.put({ id, name, userId: id === ME ? "u1" : null });
  return repo;
}
const fails = async (p: Promise<unknown>, code: ActionError["code"]) => { await expect(p).rejects.toBeInstanceOf(ActionError); await p.catch((e) => expect(e.code).toBe(code)); };
const make = async () => { const repo = await setup(); await applyAction(repo, actor, { type: "splitGroup.put", group }); return repo; };
const balances = async (repo: Repository) => Object.fromEntries(groupBalances((await repo.splitGroups.get("g1"))!, await repo.records.list(), await repo.splitSettlements.list()).people.map((p) => [p.id, p.balancePaise]));

describe("split groups: create and edit", () => {
  it("creates a group from existing contacts and audits it", async () => {
    const repo = await make();
    expect(await repo.splitGroups.get("g1")).toMatchObject({ name: "Goa trip", kind: "trip", participantIds: [ME, "asha", "ben"] });
    expect((await repo.audit.list()).map((e) => [e.action, e.entity, e.entityId])).toEqual([["create", "split_group", "g1"]]);
  });
  it("refuses a duplicate name, a one-person group, a stranger and bad input", async () => {
    const repo = await make();
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, id: "g2", name: "goa TRIP" } }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, id: "g2", name: "Solo", participantIds: [ME] } }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, id: "g2", name: "Odd", participantIds: [ME, "nobody"] } }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, id: "g2", name: "Odd", kind: "rave" as never } }), "invalid");
    expect((await repo.splitGroups.list()).length).toBe(1);
  });
  it("edits name and people, and the edit can be undone one step at a time", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, name: "Goa 2026", participantIds: [ME, "asha", "ben", "cy"] } });
    expect(await repo.splitGroups.get("g1")).toMatchObject({ name: "Goa 2026", participantIds: [ME, "asha", "ben", "cy"], createdAt: expect.any(String) });
    let events = await repo.audit.list();
    const edit = events.at(-1)!;
    expect(edit.change?.before).toMatchObject({ name: "Goa trip" });
    expect(undoableIds(events).has(edit.id)).toBe(true);
    await applyAction(repo, actor, { type: "audit.undo", eventId: edit.id });
    expect(await repo.splitGroups.get("g1")).toMatchObject({ name: "Goa trip", participantIds: [ME, "asha", "ben"] });
    events = await repo.audit.list();
    expect(events.at(-1)).toMatchObject({ undoes: edit.id });
    await fails(applyAction(repo, actor, { type: "audit.undo", eventId: edit.id }), "conflict");
  });
  it("an older edit cannot be undone over a newer one", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, name: "A" } });
    await applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, name: "B" } });
    const [, first] = await repo.audit.list();
    await fails(applyAction(repo, actor, { type: "audit.undo", eventId: first.id }), "conflict");
  });
  it("cannot remove someone who has an expense or payment in the group", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, participantIds: [ME, "asha"] } }), "conflict");
    await applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, participantIds: [ME, "asha", "ben", "cy"] } }); // adding is fine
  });
  it("a contact in a group cannot be deleted", async () => {
    const repo = await make();
    await fails(applyAction(repo, actor, { type: "participant.delete", id: "asha" }), "conflict");
    await repo.participants.put({ id: "dan", name: "Dan", userId: null });
    await applyAction(repo, actor, { type: "participant.delete", id: "dan" });
  });
});

describe("split groups: expenses are tagged ledger records", () => {
  it("a group expense is one record with a tag; balances come from it", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    expect(await repo.records.list()).toHaveLength(1);
    expect((await repo.records.get("e1"))!.splitGroupId).toBe("g1");
    expect(await balances(repo)).toEqual({ [ME]: 60000, asha: -30000, ben: -30000 });
  });
  it("only the group's people, and only purchases, refunds and fees, can be in it", async () => {
    const repo = await make();
    await fails(applyAction(repo, actor, { type: "record.create", record: rec({ split: { mode: "equal", participantIds: [ME, "cy"] } }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "record.create", record: rec({ payerId: "cy" }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "record.create", record: rec({ kind: "income" }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "record.create", record: rec({ splitGroupId: "ghost" }) }), "invalid");
    expect(await repo.records.list()).toHaveLength(0);
  });
  it("every split method works in a group and balances stay at zero", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec({ id: "e2", amountPaise: 100001, split: { mode: "shares", participantIds: [ME, "asha", "ben"], values: { [ME]: 1, asha: 2, ben: 3 } } }) });
    await applyAction(repo, actor, { type: "record.create", record: rec({ id: "e3", payerId: "asha", amountPaise: 50000, split: { mode: "percent", participantIds: [ME, "asha"], values: { [ME]: 2500, asha: 7500 } } }) });
    expect(Object.values(await balances(repo)).reduce((s, v) => s + v, 0)).toBe(0);
  });
  it("an imported row tagged to a group counts only once it is approved", async () => {
    const repo = await make();
    await repo.records.put(imported());
    await applyAction(repo, actor, { type: "record.update", id: "imp1", patch: { splitGroupId: "g1", shared: true, split: { mode: "equal", participantIds: [ME, "asha"] } } });
    expect(await balances(repo)).toEqual({ [ME]: 0, asha: 0, ben: 0 });
    await applyAction(repo, actor, { type: "record.approve", id: "imp1" });
    expect(await balances(repo)).toEqual({ [ME]: 30000, asha: -30000, ben: 0 });
  });
  it("untagging removes it from the group, and the tag change can be undone", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await applyAction(repo, actor, { type: "record.update", id: "e1", patch: { splitGroupId: null } });
    expect((await repo.records.get("e1"))!.splitGroupId).toBeUndefined();
    expect(await balances(repo)).toEqual({ [ME]: 0, asha: 0, ben: 0 });
    const ev = (await repo.audit.list()).at(-1)!;
    expect(ev.change).toEqual({ before: { splitGroupId: "g1" }, after: { splitGroupId: null } });
    await applyAction(repo, actor, { type: "audit.undo", eventId: ev.id });
    expect((await repo.records.get("e1"))!.splitGroupId).toBe("g1");
  });
  it("deleting the expense changes the balance; the group itself is unharmed", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await applyAction(repo, actor, { type: "record.delete", id: "e1" });
    expect(await balances(repo)).toEqual({ [ME]: 0, asha: 0, ben: 0 });
    expect(await repo.splitGroups.get("g1")).toBeTruthy();
  });
  it("an archived group takes no new expenses, but an old one can still have its note edited", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await applyAction(repo, actor, { type: "splitGroup.archive", id: "g1", archived: true });
    await fails(applyAction(repo, actor, { type: "record.create", record: rec({ id: "e2" }) }), "conflict");
    await applyAction(repo, actor, { type: "record.update", id: "e1", patch: { notes: "great trip" } });
    await fails(applyAction(repo, actor, { type: "record.update", id: "e1", patch: { split: { mode: "equal", participantIds: [ME, "asha"] } } }), "conflict");
    await applyAction(repo, actor, { type: "splitGroup.archive", id: "g1", archived: false });
    await applyAction(repo, actor, { type: "record.create", record: rec({ id: "e2" }) });
  });
});

describe("split groups: settlements", () => {
  const pay = (o: Record<string, unknown> = {}) => ({ id: "p1", groupId: "g1", date: "2026-10-05", fromId: "asha", toId: ME, amountPaise: 30000, ...o });
  it("a payment moves balances and never creates an expense", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay() });
    expect(await balances(repo)).toEqual({ [ME]: 30000, asha: 0, ben: -30000 });
    expect(await repo.records.list()).toHaveLength(1); // still just the one expense
    expect((await repo.audit.list()).at(-1)).toMatchObject({ action: "settle", entity: "split_group" });
  });
  it("a payment that involves you also moves your People balance, as a plain settlement", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay() });
    expect(await repo.settlements.get("p1-l")).toMatchObject({ fromId: "asha", toId: ME, amountPaise: 30000 });
    expect((await repo.splitSettlements.get("p1"))!.ledgerSettlementId).toBe("p1-l");
    await applyAction(repo, actor, { type: "splitGroup.voidSettlement", id: "p1" });
    expect((await repo.splitSettlements.get("p1"))!.voided).toBe(true);
    expect((await repo.settlements.get("p1-l"))!.voided).toBe(true);
    expect((await repo.audit.list()).map((e) => e.action)).toContain("void_settlement");
  });
  it("a payment between two other people stays inside the group", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ id: "p2", fromId: "ben", toId: "asha" }) });
    expect(await repo.settlements.list()).toEqual([]);
    expect((await repo.splitSettlements.get("p2"))!.ledgerSettlementId).toBeUndefined();
  });
  it("refuses outsiders, the same person twice, bad amounts, repeats, and archived groups", async () => {
    const repo = await make();
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ fromId: "cy" }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ toId: "asha" }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ amountPaise: 0 }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ amountPaise: 10.5 }) }), "invalid");
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ groupId: "ghost" }) }), "not_found");
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay() });
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay() }), "conflict");
    await applyAction(repo, actor, { type: "splitGroup.archive", id: "g1", archived: true });
    await fails(applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay({ id: "p9" }) }), "conflict");
  });
  it("voiding twice is harmless and an unknown payment is not found", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: pay() });
    await applyAction(repo, actor, { type: "splitGroup.voidSettlement", id: "p1" });
    await applyAction(repo, actor, { type: "splitGroup.voidSettlement", id: "p1" });
    await fails(applyAction(repo, actor, { type: "splitGroup.voidSettlement", id: "nope" }), "not_found");
  });
});

describe("split groups: archive and delete", () => {
  it("archives and reopens, audited and undoable", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.archive", id: "g1", archived: true });
    expect((await repo.splitGroups.get("g1"))!.archived).toBe(true);
    const ev = (await repo.audit.list()).at(-1)!;
    await applyAction(repo, actor, { type: "audit.undo", eventId: ev.id });
    expect((await repo.splitGroups.get("g1"))!.archived).toBeUndefined();
    await fails(applyAction(repo, actor, { type: "splitGroup.archive", id: "ghost", archived: true }), "not_found");
  });
  it("an archived group cannot be edited until reopened", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "splitGroup.archive", id: "g1", archived: true });
    await fails(applyAction(repo, actor, { type: "splitGroup.put", group: { ...group, name: "New" } }), "conflict");
  });
  it("only an empty group can be deleted", async () => {
    const repo = await make();
    await applyAction(repo, actor, { type: "record.create", record: rec() });
    await fails(applyAction(repo, actor, { type: "splitGroup.delete", id: "g1" }), "conflict");
    await applyAction(repo, actor, { type: "record.delete", id: "e1" });
    await applyAction(repo, actor, { type: "splitGroup.settle", settlement: { id: "p1", groupId: "g1", date: "2026-10-05", fromId: "asha", toId: "ben", amountPaise: 100 } });
    await fails(applyAction(repo, actor, { type: "splitGroup.delete", id: "g1" }), "conflict");
    const other = await make();
    await applyAction(other, actor, { type: "splitGroup.delete", id: "g1" });
    expect(await other.splitGroups.get("g1")).toBeNull();
    expect((await other.audit.list()).at(-1)).toMatchObject({ action: "delete", entity: "split_group" });
  });
});
