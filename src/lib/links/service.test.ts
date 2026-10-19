import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import type { ExpenseRecord } from "@/domain/types";
import { ActionError, applyAction } from "@/lib/data/actions";
import { acceptPartnerInvite, invitePartner } from "@/lib/households/couple";
import { createMemoryHouseholdStore } from "@/lib/households/memory-store";
import { createHousehold, type Deps } from "@/lib/households/service";
import type { Household, Member } from "@/lib/households/types";
import { createMemoryAccountDirectory, createMemoryContactIndex, createMemoryLinkStore, withLinkSpaces } from "./memory";
import { activeLinksFor, confirmLink, declineLink, loadLinkData, refreshForAccount, refreshForContact, removeAccountLinks, unlink, type LinkDeps } from "./service";
import { LinkError } from "./types";

let n = 0;
const hd: Deps = { now: () => Date.parse("2026-10-02T00:00:00Z"), randomBytes: (k) => new Uint8Array(randomBytes(k)), hash: (c) => createHash("sha256").update(c).digest("hex"), newId: () => `id${++n}` };
const A = { uid: "uA", email: "a@x.com", name: "Asha" };
const B = { uid: "uB", email: "b@x.com", name: "Bala" };
const C = { uid: "uC", email: "c@x.com", name: "Chitra" };
const KEY = "uA__uB";
const NOW = "2026-10-01T00:00:00.000Z";

interface World { deps: LinkDeps; repos: Map<string, Repository>; spaces: Map<string, { household: Household; members: Member[] }>; verified: { uid: string; email: string; displayName: string; verified: boolean }[]; spaceOf: (uid: string) => string; own: (uid: string) => Repository }

async function world(): Promise<World> {
  const hStore = createMemoryHouseholdStore();
  const repos = new Map<string, Repository>();
  const spaces = new Map<string, { household: Household; members: Member[] }>();
  const repoFor = (id: string) => repos.get(id) ?? (repos.set(id, createMemoryRepository(id)), repos.get(id)!);
  const people = [A, B, C];
  for (const p of people) await createHousehold(hStore, p, `${p.name}'s finances`, hd);
  const spaceOf = async (uid: string) => (await hStore.getUserHouseholdId(uid))!;
  const personal = await Promise.all(people.map(async (p) => ({ ownerUid: p.uid, householdId: await spaceOf(p.uid), repo: repoFor(await spaceOf(p.uid)) })));
  for (const p of personal) await p.repo.participants.put({ id: `u_${p.ownerUid}`, name: p.ownerUid, userId: p.ownerUid });
  const verified = people.map((p) => ({ uid: p.uid, email: p.email, displayName: p.name, verified: true }));
  const deps: LinkDeps = {
    store: createMemoryLinkStore(repos, spaces), index: createMemoryContactIndex(() => personal), accounts: createMemoryAccountDirectory(verified as never),
    households: withLinkSpaces(hStore, spaces), repoFor, now: () => Date.parse("2026-10-19T00:00:00Z"), newId: () => `space${++n}`,
  };
  // The directory reads `verified` live so tests can flip it.
  deps.accounts = { findVerifiedByEmail: async (e) => { const a = verified.find((x) => x.email === e.toLowerCase() && x.verified); return a ? { uid: a.uid, email: a.email, displayName: a.displayName } : null; } };
  const ids = Object.fromEntries(personal.map((p) => [p.ownerUid, p.householdId]));
  return { deps, repos, spaces, verified, spaceOf: (uid) => ids[uid], own: (uid) => repoFor(ids[uid]) };
}

const rec = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "r1", date: "2026-10-01", merchant: "Dinner", originalDescription: "BANK TEXT 4455", amountPaise: 100000, currency: "INR", accountId: "acc1", categoryId: "food", kind: "purchase",
  payerId: "u_uA", shared: true, split: { mode: "equal", participantIds: ["u_uA", "p_b"] }, excluded: false, status: "reviewed", importSource: "Manual entry", notes: "private note", ...o,
});
const verifiedAcct = (email: string, uid: string) => ({ uid, email, emailVerified: true });

async function seedA(w: World) {
  const r = w.own("uA");
  await r.categories.put({ id: "food", name: "Food" });
  await r.participants.put({ id: "p_b", name: "Bala (friend)", userId: null, email: "b@x.com", relationship: "friend" });
  await r.participants.put({ id: "p_d", name: "Divya", userId: null });
  await r.records.put(rec());
  await r.records.put(rec({ id: "r_private", merchant: "Pharmacy", split: { mode: "personal", participantIds: ["u_uA"] }, shared: false }));
  await r.records.put(rec({ id: "r_other", merchant: "With Divya", split: { mode: "equal", participantIds: ["u_uA", "p_d"] } }));
  await r.settlements.put({ id: "s1", date: "2026-10-05", fromId: "p_b", toId: "u_uA", amountPaise: 20000, note: "cash" });
  await r.settlements.put({ id: "s_other", date: "2026-10-05", fromId: "p_d", toId: "u_uA", amountPaise: 1000 });
}

describe("proposals: nothing is linked without a verified email and the owner's yes", () => {
  let w: World;
  beforeEach(async () => { w = await world(); await seedA(w); });

  it("stores a proposal on sign-in with a verified email, and links nothing", async () => {
    const before = await w.own("uA").records.list();
    expect(await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"))).toBe(1);
    const data = await loadLinkData(w.deps, "uA");
    expect(data.proposals).toHaveLength(1);
    expect(data.links).toEqual([]);
    expect((await w.own("uA").participants.get("p_b"))?.linkId).toBeUndefined();
    expect(await w.own("uA").records.list()).toEqual(before);
    expect([...w.spaces.keys()]).toEqual([]); // no link space yet
    // The signed-in person sees nothing of A until A confirms
    expect(await loadLinkData(w.deps, "uB")).toEqual({ proposals: [], links: [] });
  });
  it("never proposes from an unverified email, on either side", async () => {
    expect(await refreshForAccount(w.deps, { uid: "uB", email: "b@x.com", emailVerified: false })).toBe(0);
    w.verified.find((v) => v.uid === "uB")!.verified = false;
    expect(await refreshForContact(w.deps, { uid: "uA", householdId: w.spaceOf("uA") }, "p_b")).toBe(0);
    expect((await w.deps.store.listForUser("uA"))).toEqual([]);
  });
  it("does not match someone else's email, or the owner's own contact of themself", async () => {
    expect(await refreshForAccount(w.deps, verifiedAcct("c@x.com", "uC"))).toBe(0);
    await w.own("uB").participants.put({ id: "p_me", name: "Me", userId: null, email: "b@x.com" });
    expect(await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"))).toBe(1); // only A's contact, not B's own
    expect((await w.deps.store.getPair("uA__uB"))?.sides.uB).toBeUndefined();
  });
  it("picks up an email added after the person signed up (contact side)", async () => {
    await w.own("uA").participants.put({ id: "p_late", name: "Late", userId: null });
    expect(await refreshForContact(w.deps, { uid: "uA", householdId: w.spaceOf("uA") }, "p_late")).toBe(0);
    await w.own("uA").participants.put({ id: "p_late", name: "Late", userId: null, email: "C@x.com" });
    expect(await refreshForContact(w.deps, { uid: "uA", householdId: w.spaceOf("uA") }, "p_late")).toBe(1);
    expect((await loadLinkData(w.deps, "uA")).proposals[0].contacts[0].id).toBe("p_late");
  });
  it("is idempotent: checking twice stores one proposal", async () => {
    await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"));
    expect(await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"))).toBe(0);
    expect(await w.deps.store.listForUser("uB")).toHaveLength(1);
  });
  it("needs a human choice when two contacts share the email", async () => {
    await w.own("uA").participants.put({ id: "p_b2", name: "Bala again", userId: null, email: "B@X.com" });
    await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"));
    const view = (await loadLinkData(w.deps, "uA")).proposals[0];
    expect(view.conflict).toBe(true);
    await expect(confirmLink(w.deps, A, KEY)).rejects.toMatchObject({ code: "invalid" });
    await expect(confirmLink(w.deps, A, KEY, "p_d")).rejects.toMatchObject({ code: "invalid" }); // not a stored candidate
    await confirmLink(w.deps, A, KEY, "p_b2");
    expect((await w.own("uA").participants.get("p_b2"))?.linkId).toBe(KEY);
    expect((await w.own("uA").participants.get("p_b"))?.linkId).toBeUndefined();
  });
  it("skips people who are already linked as partners", async () => {
    const hs = w.deps.households;
    void hs; // partners use the couple flow: simulate by an active couple in the household store
    const store = createMemoryHouseholdStore();
    await createHousehold(store, A, "A", hd); await createHousehold(store, B, "B", hd);
    await invitePartner(store, A, B.email, hd);
    await acceptPartnerInvite(store, B, (await store.findInvitesByEmail(B.email))[0].hash, hd);
    const w2 = { ...w.deps, households: store };
    expect(await refreshForAccount(w2, verifiedAcct("b@x.com", "uB"))).toBe(0);
  });
});

describe("confirm: one transaction, nothing changed for the owner", () => {
  let w: World;
  beforeEach(async () => { w = await world(); await seedA(w); await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB")); });

  it("mirrors only what involves the contact, leaves the owner's ledger byte for byte alone, and marks the contact", async () => {
    const own = w.own("uA");
    const before = { records: await own.records.list(), settlements: await own.settlements.list(), accounts: await own.accounts.list() };
    const out = await confirmLink(w.deps, A, KEY);
    expect(out).toEqual({ expenses: 1, settlements: 1 });
    expect(await own.records.list()).toEqual(before.records);
    expect(await own.settlements.list()).toEqual(before.settlements);
    expect((await own.participants.get("p_b"))?.linkId).toBe(KEY);
    const space = w.repos.get([...w.spaces.keys()][0])!;
    const copies = await space.sharedExpenses.list();
    expect(copies.map((c) => c.id)).toEqual(["r1"]); // not the private one, not the one with Divya
    expect((await space.settlements.list()).map((s) => s.id)).toEqual(["s1"]);
    const text = JSON.stringify([copies, await space.settlements.list()]);
    for (const secret of ["BANK TEXT", "acc1", "private note", "Manual entry", "Pharmacy", "Divya", "cash", "p_d"]) expect(text).not.toContain(secret);
  });
  it("is safe to confirm twice: no duplicates", async () => {
    await confirmLink(w.deps, A, KEY);
    await confirmLink(w.deps, A, KEY);
    const space = w.repos.get([...w.spaces.keys()][0])!;
    expect(await space.sharedExpenses.list()).toHaveLength(1);
    expect(await space.settlements.list()).toHaveLength(1);
    expect(w.spaces.size).toBe(1);
  });
  it("only the owner of the side can confirm; a stranger or the linked person cannot", async () => {
    await expect(confirmLink(w.deps, C, KEY)).rejects.toBeInstanceOf(LinkError);
    await expect(confirmLink(w.deps, B, KEY)).rejects.toMatchObject({ code: "not_found" }); // B has no side of their own here
    expect(w.spaces.size).toBe(0);
  });
  it("refuses when the account's email is no longer verified, or the contact's email changed since", async () => {
    w.verified.find((v) => v.uid === "uB")!.verified = false;
    await expect(confirmLink(w.deps, A, KEY)).rejects.toMatchObject({ code: "conflict" });
    w.verified.find((v) => v.uid === "uB")!.verified = true;
    await w.own("uA").participants.put({ id: "p_b", name: "Bala", userId: null, email: "other@x.com" });
    await expect(confirmLink(w.deps, A, KEY)).rejects.toMatchObject({ code: "conflict" });
    expect(w.spaces.size).toBe(0);
    expect((await w.own("uA").participants.get("p_b"))?.linkId).toBeUndefined();
  });
  it("shows the linked person only their own part: shares, payer, settlements; nothing else", async () => {
    await confirmLink(w.deps, A, KEY);
    const view = (await loadLinkData(w.deps, "uB")).links[0];
    expect(view).toMatchObject({ key: KEY, other: { uid: "uA", name: "Asha" }, mine: null, theirs: { status: "active" }, live: true, me: "u_uB" });
    expect(view.shared).toHaveLength(1);
    expect(view.shared[0]).toMatchObject({ payerId: "u_uA", amountPaise: 100000, split: { values: { u_uA: 50000, u_uB: 50000 } } });
    expect(view.settlements).toEqual([{ id: "s1", date: "2026-10-05", fromId: "u_uB", toId: "u_uA", amountPaise: 20000 }]);
  });
  it("decline keeps the contact plain and does not ask again", async () => {
    await declineLink(w.deps, A, KEY);
    expect((await loadLinkData(w.deps, "uA")).proposals).toEqual([]);
    expect(await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"))).toBe(0);
    expect(w.spaces.size).toBe(0);
    await expect(confirmLink(w.deps, A, KEY)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("sync after linking, unlinking and deleting", () => {
  let w: World;
  const act = async (raw: unknown) => applyAction(w.own("uA"), { uid: "uA" }, raw, undefined, await activeLinksFor(w.deps, "uA"));
  const space = () => w.repos.get([...w.spaces.keys()][0])!;
  beforeEach(async () => { w = await world(); await seedA(w); await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB")); await confirmLink(w.deps, A, KEY); });

  const newRecord = (o: Record<string, unknown> = {}) => ({ type: "record.create", record: { id: "r2", date: "2026-10-10", merchant: "Movie", amountPaise: 60000, accountId: "acc1", categoryId: "food", kind: "purchase", payerId: "p_b", shared: true, split: { mode: "equal", participantIds: ["u_uA", "p_b"] }, excluded: false, ...o } });

  it("a new expense reaches the linked person automatically, once", async () => {
    await act(newRecord());
    const copy = await space().sharedExpenses.get("r2");
    expect(copy).toMatchObject({ payerId: "u_uB", amountPaise: 60000, merchant: "Movie", ownerUid: "uA" });
    expect(await w.own("uA").records.get("r2")).toMatchObject({ id: "r2", amountPaise: 60000 }); // the one real transaction
    expect((await space().sharedExpenses.list()).filter((c) => c.id === "r2")).toHaveLength(1);
  });
  it("editing updates the copy; removing the contact from the split, or deleting, withdraws it", async () => {
    await act({ type: "record.update", id: "r1", patch: { merchant: "Dinner out" } });
    expect((await space().sharedExpenses.get("r1"))?.merchant).toBe("Dinner out");
    await act({ type: "record.update", id: "r1", patch: { split: { mode: "personal", participantIds: ["u_uA"] }, shared: false } });
    expect((await space().sharedExpenses.get("r1"))?.voided).toBe(true);
    await act(newRecord());
    await act({ type: "record.delete", id: "r2" });
    expect((await space().sharedExpenses.get("r2"))?.voided).toBe(true);
    expect((await loadLinkData(w.deps, "uB")).links[0].shared).toEqual([]);
  });
  it("mirrors new settlements and voids, and only those between the two", async () => {
    await act({ type: "settlement.create", settlement: { id: "s2", date: "2026-10-12", fromId: "p_b", toId: "u_uA", amountPaise: 5000 } });
    expect(await space().settlements.get("s2")).toMatchObject({ fromId: "u_uB", toId: "u_uA", amountPaise: 5000 });
    await act({ type: "settlement.create", settlement: { id: "s3", date: "2026-10-12", fromId: "p_d", toId: "u_uA", amountPaise: 700 } });
    expect(await space().settlements.get("s3")).toBeNull();
    await act({ type: "settlement.void", id: "s2" });
    expect((await space().settlements.get("s2"))?.voided).toBe(true);
  });
  it("a linked contact cannot be deleted until unlinked", async () => {
    await expect(act({ type: "participant.delete", id: "p_b" })).rejects.toBeInstanceOf(ActionError);
  });
  it("unlinking keeps history for both, stops sync, and leaves the owner's ledger alone", async () => {
    await unlink(w.deps, B, KEY); // the linked person can stop it too
    expect(await activeLinksFor(w.deps, "uA")).toEqual([]);
    expect((await w.own("uA").participants.get("p_b"))?.linkId).toBeUndefined();
    await act(newRecord());
    expect(await space().sharedExpenses.get("r2")).toBeNull(); // sync stopped
    expect(await w.own("uA").records.get("r2")).not.toBeNull();   // the owner's ledger is unaffected
    for (const uid of ["uA", "uB"]) {
      const v = (await loadLinkData(w.deps, uid)).links[0];
      expect(v.live).toBe(false);
      expect(v.shared.map((s) => s.id)).toEqual(["r1"]); // history stays
    }
  });
  it("after unlinking, a fresh confirmation is needed, and then the missed expense catches up without duplicates", async () => {
    await unlink(w.deps, A, KEY);
    await act(newRecord());
    await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"));
    expect((await loadLinkData(w.deps, "uA")).proposals).toHaveLength(1);
    await confirmLink(w.deps, A, KEY);
    expect((await space().sharedExpenses.list()).map((s) => s.id).sort()).toEqual(["r1", "r2"]);
    expect(w.spaces.size).toBe(1); // the same space is reused
  });
  it("account deletion removes the link space and the other person's link, but no ledger data", async () => {
    const before = await w.own("uA").records.list();
    expect(await removeAccountLinks(w.deps, "uB")).toBe(1);
    expect(w.spaces.size).toBe(0);
    expect(await w.deps.store.listForUser("uA")).toEqual([]);
    expect((await w.own("uA").participants.get("p_b"))).toMatchObject({ name: "Bala (friend)", email: "b@x.com" });
    expect((await w.own("uA").participants.get("p_b"))?.linkId).toBeUndefined();
    expect(await w.own("uA").records.list()).toEqual(before);
    expect((await loadLinkData(w.deps, "uA")).links).toEqual([]);
  });
  it("two linked people each get the same amount owed", async () => {
    const { pairBalances } = await import("@/domain/balances");
    const { sharedToRecord } = await import("@/domain/sharing");
    await act(newRecord());
    const v = (await loadLinkData(w.deps, "uB")).links[0];
    const [b] = pairBalances(v.shared.map(sharedToRecord), v.settlements);
    // A paid 100000 (B owes 50000), B paid 60000 (A owes 30000), B settled 20000 => B owes 0 after: 50000 - 30000 - 20000
    expect(b?.outstanding ?? 0).toBe(0);
    expect(pairBalances(v.shared.map(sharedToRecord), [])[0]).toMatchObject({ from: "u_uB", to: "u_uA", outstanding: 20000 }); // before the settlement
  });
});

describe("a pair that holds contacts for each other", () => {
  it("is one link with two sides, each confirmed by its own owner; nothing flows until its owner confirms", async () => {
    const w = await world(); await seedA(w);
    await w.own("uB").participants.put({ id: "p_a", name: "Asha (friend)", userId: null, email: "a@x.com" });
    await w.own("uB").categories.put({ id: "food", name: "Food" });
    await w.own("uB").records.put(rec({ id: "rb", payerId: "u_uB", split: { mode: "equal", participantIds: ["u_uB", "p_a"] } }));
    await refreshForAccount(w.deps, verifiedAcct("b@x.com", "uB"));
    await refreshForAccount(w.deps, verifiedAcct("a@x.com", "uA"));
    expect(await w.deps.store.listForUser("uA")).toHaveLength(1); // one pair doc, not two
    await confirmLink(w.deps, A, KEY);
    const space = w.repos.get([...w.spaces.keys()][0])!;
    expect((await space.sharedExpenses.list()).map((s) => s.id)).toEqual(["r1"]); // B's expense is not shared until B confirms
    await confirmLink(w.deps, B, KEY);
    expect((await space.sharedExpenses.list()).map((s) => s.id).sort()).toEqual(["r1", "rb"]);
  });
});
