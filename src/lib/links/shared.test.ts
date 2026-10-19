import { beforeEach, describe, expect, it } from "vitest";
import { undoableIds } from "@/domain/audit";
import { pairBalances } from "@/domain/balances";
import { sharedToRecord } from "@/domain/sharing";
import { applyAction } from "@/lib/data/actions";
import { activeLinksFor, confirmLink, loadLinkData, refreshForAccount, unlink, upgradeLinks } from "./service";
import { editShared, recordPayment, undoShared, voidPayment } from "./shared";
import { A, B, C, KEY, rec, seedA, verifiedAcct, world, type World } from "./test-world";

describe("two-way editing of a shared expense", () => {
  let w: World;
  const space = () => w.repos.get([...w.spaces.keys()][0])!;
  const ownerAct = async (raw: unknown) => applyAction(w.own("uA"), { uid: "uA" }, raw, undefined, await activeLinksFor(w.deps, "uA"));
  const v = async () => (await space().sharedExpenses.get("r1"))!;
  beforeEach(async () => {
    w = await world(); await seedA(w);
    await w.own("uA").records.put(rec({ id: "r1", importSource: "Manual entry" })); // manual: amount and date editable
    await w.own("uA").categories.put({ id: "eat", name: "Eating out" });
    await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB")); await confirmLink(w.deps, A, KEY);
  });

  it("the linked person sees the full expense: total, category, payer, full split with others by name, no bank data", async () => {
    await w.own("uA").participants.put({ id: "p_d", name: "Divya", userId: null });
    await w.own("uA").records.put(rec({ id: "r3", amountPaise: 90000, split: { mode: "equal", participantIds: ["u_uA", "p_b", "p_d"] }, shareNote: true }));
    await ownerAct({ type: "record.update", id: "r3", patch: { merchant: "Trip dinner" } });
    const view = (await loadLinkData(w.deps, "uB")).links[0];
    const x = view.shared.find((s) => s.id === "r3")!;
    expect(x).toMatchObject({ amountPaise: 90000, categoryName: "Food", payerId: "u_uA", merchant: "Trip dinner", people: { p_d: "Divya" }, note: "private note", split: { participantIds: ["u_uA", "u_uB", "p_d"] } });
    const text = JSON.stringify(view);
    for (const secret of ["BANK TEXT", "acc1", "HDFC", "Pharmacy"]) expect(text).not.toContain(secret);
  });

  it("the linked person's edit changes the one transaction: the owner's ledger reflects it, with a log on both sides", async () => {
    const before = await v();
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: before.version!, patch: { merchant: "Dinner out", categoryName: "eating out", payerId: "u_uB", split: { mode: "custom", participantIds: ["u_uA", "u_uB"], values: { u_uA: 70000, u_uB: 30000 } } } });
    const own = await w.own("uA").records.get("r1");
    expect(own).toMatchObject({ merchant: "Dinner out", categoryId: "eat", payerId: "p_b", split: { values: { u_uA: 70000, p_b: 30000 } }, sharedRev: 1, originalDescription: "BANK TEXT 4455", accountId: "acc1" });
    expect((await w.own("uA").records.list()).filter((r) => r.id === "r1")).toHaveLength(1); // still ONE transaction
    expect(await v()).toMatchObject({ version: before.version! + 1, merchant: "Dinner out", categoryId: "eat" });
    const log = (await loadLinkData(w.deps, "uA")).links[0].audit.filter((e) => e.actorId === "uB");
    expect(log).toHaveLength(1);
    expect(log[0].change?.before).toMatchObject({ merchant: "Dinner" });
    expect(log[0].change?.after).toMatchObject({ merchant: "Dinner out", categoryName: "Eating out" });
    expect((await w.own("uA").audit.list()).some((e) => e.actorId === "uB" && e.change)).toBe(true); // the owner's own history too
  });

  it("edits amount and date of a manual expense, and keeps balances exact for both", async () => {
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { amountPaise: 80001, date: "2026-10-03", split: { mode: "equal", participantIds: ["u_uA", "u_uB"] } } });
    expect(await w.own("uA").records.get("r1")).toMatchObject({ amountPaise: 80001, date: "2026-10-03" });
    const view = (await loadLinkData(w.deps, "uB")).links[0];
    const mine = pairBalances((await w.own("uA").records.list()).filter((r) => r.id === "r1"), []).find((b) => [b.from, b.to].includes("p_b"))!;
    expect(pairBalances(view.shared.map(sharedToRecord), [])[0].outstanding).toBe(mine.outstanding);
  });

  it("does not let anyone change the bank's amount or date of an imported row", async () => {
    await w.own("uA").records.put(rec({ id: "imp", importSource: "HDFC.csv" }));
    await ownerAct({ type: "record.update", id: "imp", patch: { merchant: "Dinner 2" } });
    const x = (await space().sharedExpenses.get("imp"))!;
    await expect(editShared(w.deps, B, { key: KEY, id: "imp", ifVersion: x.version!, patch: { amountPaise: 5 } })).rejects.toMatchObject({ code: "invalid", message: expect.stringMatching(/bank/) });
    await editShared(w.deps, B, { key: KEY, id: "imp", ifVersion: x.version!, patch: { merchant: "Dinner 3" } });
    expect(await w.own("uA").records.get("imp")).toMatchObject({ merchant: "Dinner 3", amountPaise: 100000 });
  });

  it("a stale save is refused with a clear message and nothing is overwritten", async () => {
    const seen = (await v()).version!;
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: seen, patch: { merchant: "By Bala" } });
    await expect(editShared(w.deps, A, { key: KEY, id: "r1", ifVersion: seen, patch: { merchant: "By Asha" } })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("Bala changed this expense") });
    expect((await w.own("uA").records.get("r1"))?.merchant).toBe("By Bala");
    // the repository itself refuses a same-moment write
    await expect(space().sharedExpenses.put({ ...(await v()), merchant: "x", version: seen + 1 })).rejects.toThrow(/someone else/);
  });

  it("the owner's stale screen is refused too, but their own successive edits never conflict with themselves", async () => {
    await ownerAct({ type: "record.update", id: "r1", patch: { merchant: "One" }, ifRev: 0 });
    await ownerAct({ type: "record.update", id: "r1", patch: { merchant: "Two" }, ifRev: 0 });
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { merchant: "Bala's" } });
    await expect(ownerAct({ type: "record.update", id: "r1", patch: { merchant: "Stale" }, ifRev: 0 })).rejects.toMatchObject({ code: "conflict" });
    expect((await w.own("uA").records.get("r1"))?.merchant).toBe("Bala's");
    await ownerAct({ type: "record.update", id: "r1", patch: { merchant: "Fresh" }, ifRev: 1 });
    expect((await v()).merchant).toBe("Fresh");
  });

  it("both must stay in it, no strangers, categories only by name the owner has, note only when shared", async () => {
    const x = await v();
    const at = (patch: object) => editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: x.version!, patch });
    await expect(at({ split: { mode: "equal", participantIds: ["u_uA", "u_uC"] } })).rejects.toMatchObject({ code: "invalid" });
    await expect(at({ categoryName: "Secret category" })).rejects.toMatchObject({ code: "invalid", message: expect.stringContaining("no category called") });
    await expect(at({ note: "hi" })).rejects.toMatchObject({ code: "invalid" });
    expect((await space().sharedExpenses.get("r1"))?.version).toBe(x.version);
  });

  it("a stranger cannot read or edit; only the two linked people can", async () => {
    await expect(editShared(w.deps, C, { key: KEY, id: "r1", ifVersion: 1, patch: { merchant: "x" } })).rejects.toMatchObject({ code: "not_found" });
    await expect(recordPayment(w.deps, C, { key: KEY, id: "p9", date: "2026-10-01", amountPaise: 100, direction: "paid" })).rejects.toMatchObject({ code: "not_found" });
    await expect(undoShared(w.deps, C, KEY, "e")).rejects.toMatchObject({ code: "not_found" });
  });

  it("undo walks back one step, is logged, and refuses when something newer changed", async () => {
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { merchant: "First" } });
    await editShared(w.deps, A, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { merchant: "Second" } });
    const events = (await loadLinkData(w.deps, "uA")).links[0].audit;
    const [first, second] = events.filter((e) => e.change);
    await expect(undoShared(w.deps, A, KEY, first.id)).rejects.toMatchObject({ code: "conflict" }); // newer change first
    expect(undoableIds(events).has(second.id)).toBe(true);
    await undoShared(w.deps, B, KEY, second.id);
    expect((await w.own("uA").records.get("r1"))?.merchant).toBe("First");
    const after = (await loadLinkData(w.deps, "uA")).links[0].audit;
    expect(after.at(-1)).toMatchObject({ actorId: "uB", undoes: second.id });
    await expect(undoShared(w.deps, A, KEY, second.id)).rejects.toMatchObject({ code: "conflict" }); // already undone
    await expect(undoShared(w.deps, A, KEY, first.id)).rejects.toMatchObject({ code: "conflict" }); // the undo is now the newest step (same rule as the private audit trail)
    await undoShared(w.deps, A, KEY, after.at(-1)!.id); // undoing the undo puts "Second" back, and is logged too
    expect((await w.own("uA").records.get("r1"))?.merchant).toBe("Second");
  });

  it("only the owner can remove it: withdrawal is a logged void both can see, and it stops counting", async () => {
    await ownerAct({ type: "record.update", id: "r1", patch: { excluded: true } });
    const view = (await loadLinkData(w.deps, "uB")).links[0];
    expect(view.shared.find((s) => s.id === "r1")).toBeUndefined();
    expect(view.withdrawn.map((s) => s.id)).toEqual(["r1"]);
    expect(view.audit.at(-1)).toMatchObject({ action: "delete", actorId: "uA" });
    await expect(editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: view.withdrawn[0].version!, patch: { merchant: "x" } })).rejects.toMatchObject({ code: "invalid" });
    await ownerAct({ type: "record.update", id: "r1", patch: { excluded: false } }); // back: shared again, logged
    expect((await loadLinkData(w.deps, "uB")).links[0].audit.at(-1)?.summary).toMatch(/Shared again/);
  });

  it("either person records or voids a payment: in every ledger, logged, never an expense", async () => {
    const expensesBefore = (await w.own("uA").records.list()).length;
    await recordPayment(w.deps, B, { key: KEY, id: "pay1", date: "2026-10-09", amountPaise: 12345, direction: "paid", note: "UPI" });
    expect(await w.own("uA").settlements.get("pay1")).toMatchObject({ fromId: "p_b", toId: "u_uA", amountPaise: 12345, note: "UPI" });
    expect((await w.own("uA").records.list()).length).toBe(expensesBefore);
    await recordPayment(w.deps, A, { key: KEY, id: "pay2", date: "2026-10-10", amountPaise: 500, direction: "paid" }); // Asha paid Bala
    expect(await space().settlements.get("pay2")).toMatchObject({ fromId: "u_uA", toId: "u_uB" });
    await expect(recordPayment(w.deps, B, { key: KEY, id: "pay1", date: "2026-10-09", amountPaise: 1, direction: "paid" })).rejects.toMatchObject({ code: "conflict" });
    await expect(recordPayment(w.deps, B, { key: KEY, id: "pay3", date: "2026-10-09", amountPaise: 0, direction: "paid" })).rejects.toMatchObject({ code: "invalid" });
    await voidPayment(w.deps, A, KEY, "pay1");
    expect((await w.own("uA").settlements.get("pay1"))?.voided).toBe(true);
    expect((await space().settlements.get("pay1"))?.voided).toBe(true);
    const actions = (await loadLinkData(w.deps, "uB")).links[0].audit.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["settle", "void_settlement"]));
  });

  it("when both people keep a contact for each other, a payment lands in both ledgers", async () => {
    await w.own("uB").participants.put({ id: "p_a", name: "Asha", userId: null, email: "a@x.com" });
    await refreshForAccount(w.deps, verifiedAcct("a@x.com", "uA"));
    await confirmLink(w.deps, B, KEY);
    await recordPayment(w.deps, A, { key: KEY, id: "pay9", date: "2026-10-09", amountPaise: 700, direction: "received" });
    expect(await w.own("uB").settlements.get("pay9")).toMatchObject({ fromId: "u_uB", toId: "p_a", amountPaise: 700 });
    expect(await w.own("uA").settlements.get("pay9")).toMatchObject({ fromId: "p_b", toId: "u_uA", amountPaise: 700 });
    // an owner's own payment reaches the other person's ledger too
    await applyAction(w.own("uA"), { uid: "uA" }, { type: "settlement.create", settlement: { id: "pay10", date: "2026-10-11", fromId: "u_uA", toId: "p_b", amountPaise: 300 } }, undefined, await activeLinksFor(w.deps, "uA"));
    expect(await w.own("uB").settlements.get("pay10")).toMatchObject({ fromId: "p_a", toId: "u_uB", amountPaise: 300 });
  });

  it("after unlinking nothing can be edited or paid; each ledger keeps the expense exactly as it was; history stays", async () => {
    await editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { merchant: "Before unlink" } });
    await unlink(w.deps, B, KEY);
    const ledger = await w.own("uA").records.get("r1");
    await expect(editShared(w.deps, B, { key: KEY, id: "r1", ifVersion: (await v()).version!, patch: { merchant: "After" } })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("ended") });
    await expect(recordPayment(w.deps, B, { key: KEY, id: "px", date: "2026-10-09", amountPaise: 1, direction: "paid" })).rejects.toMatchObject({ code: "conflict" });
    expect(await w.own("uA").records.get("r1")).toEqual(ledger);
    expect(ledger?.merchant).toBe("Before unlink"); // B's edit made while linked stays in the owner's ledger
    const view = (await loadLinkData(w.deps, "uB")).links[0];
    expect(view.live).toBe(false);
    expect(view.audit.some((e) => e.actorId === "uB" && e.change)).toBe(true);
  });

  it("an expense shared with two linked people stays in step for both when one edits", async () => {
    await w.own("uA").participants.put({ id: "p_c", name: "Chitra", userId: null, email: "c@x.com" });
    await refreshForAccount(w.deps, verifiedAcct("c@x.com", "uC")); await confirmLink(w.deps, A, "uA__uC");
    await w.own("uA").records.put(rec({ id: "g1", importSource: "Manual entry", split: { mode: "equal", participantIds: ["u_uA", "p_b", "p_c"] } }));
    await ownerAct({ type: "record.update", id: "g1", patch: { merchant: "Group" } });
    const sp = (key: string) => w.repos.get((w.deps.store as never as { _: never }) ? [...w.spaces.keys()][key === "uA__uC" ? 1 : 0] : "")!;
    const gB = await sp("uA__uB").sharedExpenses.get("g1");
    await editShared(w.deps, B, { key: KEY, id: "g1", ifVersion: gB!.version!, patch: { merchant: "Group dinner" } });
    expect((await sp("uA__uC").sharedExpenses.get("g1"))?.merchant).toBe("Group dinner");
  });

  it("upgrades a pre-revision copy once, without a second log line on later runs", async () => {
    // an old two-share copy, as written before revision 2
    await space().sharedExpenses.put({ id: "r1", ownerUid: "uA", payerId: "u_uA", date: "2026-10-01", merchant: "Dinner", amountPaise: 100000, kind: "purchase", categoryId: "food", categoryName: "Food", split: { mode: "custom", participantIds: ["u_uB", "u_uA"], values: { u_uB: 50000, u_uA: 50000 } }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });
    const pair = (await w.deps.store.getPair(KEY))!;
    await w.deps.store.putPair({ ...pair, sides: { ...pair.sides, uA: { ...pair.sides.uA, schema: undefined } } });
    expect(await upgradeLinks(w.deps, "uA")).toBe(1);
    expect(await upgradeLinks(w.deps, "uA")).toBe(0);
    expect((await v()).split).toMatchObject({ mode: "equal" });
    expect((await space().audit.list()).filter((e) => /full expense/.test(e.summary))).toHaveLength(1);
  });
});
