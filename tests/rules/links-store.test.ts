// The Firestore adapters for account linking, run against the local emulator (no real data): the collection-group contact lookup,
// the link records and the link space lifecycle.
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

let app: App; let db: Firestore;
beforeAll(() => { app = initializeApp({ projectId: "demo-ledger-test" }, "links-store-test"); db = getFirestore(app); });
afterAll(async () => { await deleteApp(app); });
beforeEach(async () => { for (const c of ["households", "contactLinks"]) await db.recursiveDelete(db.collection(c)); });

describe("Firestore link store and contact index (emulator)", () => {
  it("finds contacts by email only in personal spaces, grouped by owner", async () => {
    const { createFirestoreContactIndex } = await import("@/lib/links/firestore");
    await db.doc("households/p1").set({ name: "A", ownerUid: "uA" });                  // legacy personal space: no kind
    await db.doc("households/p2").set({ name: "C", ownerUid: "uC", kind: "personal" });
    await db.doc("households/c1").set({ name: "Couple", ownerUid: "uA", kind: "couple" });
    await db.doc("households/l1").set({ name: "Link", ownerUid: "uA", kind: "link" });
    await db.doc("households/p1/participants/x").set({ name: "Bala", userId: null, email: "b@x.com" });
    await db.doc("households/p1/participants/y").set({ name: "Other", userId: null, email: "o@x.com" });
    await db.doc("households/p2/participants/z").set({ name: "Bala C", userId: null, email: "b@x.com" });
    await db.doc("households/c1/participants/w").set({ name: "Ignored", userId: null, email: "b@x.com" });
    await db.doc("households/l1/participants/v").set({ name: "Ignored", userId: null, email: "b@x.com" });
    const found = await createFirestoreContactIndex(db).findContactsByEmail("b@x.com");
    expect(found.map((f) => [f.ownerUid, f.householdId, f.contacts.map((c) => c.id)]).sort()).toEqual([["uA", "p1", ["x"]], ["uC", "p2", ["z"]]]);
    expect(await createFirestoreContactIndex(db).findContactsByEmail("none@x.com")).toEqual([]);
  });

  it("stores links per pair, lists them for either person, and deletes a link space with everything in it", async () => {
    const { createFirestoreLinkStore } = await import("@/lib/links/firestore");
    const store = createFirestoreLinkStore(db);
    const link = { id: "uA__uB", uids: ["uA", "uB"] as [string, string], sides: { uA: { householdId: "p1", contactIds: ["x"], email: "b@x.com", status: "proposed" as const, proposedAt: "2026-10-19T00:00:00.000Z" } }, createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z" };
    await store.putPair(link);
    expect(await store.getPair("uA__uB")).toEqual(link);
    expect((await store.listForUser("uB")).map((l) => l.id)).toEqual(["uA__uB"]);
    expect(await store.listForUser("uC")).toEqual([]);

    const m = (uid: string, role: "owner" | "member") => ({ uid, email: `${uid}@x.com`, displayName: uid, role, joinedAt: "2026-10-19T00:00:00.000Z" });
    await store.createLinkSpace({ id: "ls1", name: "L", ownerUid: "uA", createdAt: "2026-10-19T00:00:00.000Z", kind: "link" }, [m("uA", "owner"), m("uB", "member")]);
    await db.doc("households/ls1/sharedExpenses/r1").set({ merchant: "x" });
    await db.doc("households/ls1/settlements/s1").set({ amountPaise: 1 });
    expect((await db.doc("households/ls1").get()).data()?.kind).toBe("link");
    expect((await db.collection("households/ls1/members").get()).size).toBe(2);
    await store.deleteLinkSpace("ls1");
    expect((await db.doc("households/ls1").get()).exists).toBe(false);
    for (const c of ["members", "sharedExpenses", "settlements"]) expect((await db.collection(`households/ls1/${c}`).get()).size).toBe(0);
    await store.deletePair("uA__uB");
    expect(await store.getPair("uA__uB")).toBeNull();
  });

  it("refuses a second save of the same version in a link space (compare-and-set inside a transaction)", async () => {
    const { createFirestoreRepository } = await import("@/data/firestore-repository");
    const repo = createFirestoreRepository("ls2", db);
    const base = { id: "r1", ownerUid: "uA", payerId: "u_uA", date: "2026-10-01", merchant: "Dinner", amountPaise: 100000, kind: "purchase" as const, categoryId: "food", categoryName: "Food", split: { mode: "equal" as const, participantIds: ["u_uA", "u_uB"] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
    await repo.sharedExpenses.put({ ...base, version: 1 });
    await repo.sharedExpenses.put({ ...base, merchant: "By B", version: 2 });
    await expect(repo.sharedExpenses.put({ ...base, merchant: "By A", version: 2 })).rejects.toThrow(/someone else/);
    const racers = await Promise.allSettled([3, 3].map((v, i) => repo.sharedExpenses.put({ ...base, merchant: `racer${i}`, version: v })));
    expect(racers.filter((r) => r.status === "fulfilled")).toHaveLength(1); // exactly one of two simultaneous saves wins
    expect((await repo.sharedExpenses.get("r1"))?.version).toBe(3);
  });
});
