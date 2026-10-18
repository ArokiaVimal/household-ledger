// Opt-in integration test against a REAL Firestore project (dev only!).
// Run: RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration
// Uses throwaway ids prefixed "itest-" and deletes everything it creates.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enabled = process.env.RUN_FIRESTORE_TESTS === "1" && !!process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.APP_ENV !== "production";

describe.skipIf(!enabled)("Firestore household store (real database)", () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const owner = { uid: `itest-owner-${tag}`, email: `owner-${tag}@example.com`, name: "Owner" };
  const spouse = { uid: `itest-spouse-${tag}`, email: `spouse-${tag}@example.com`, name: "Spouse" };
  const outsider = { uid: `itest-out-${tag}`, email: `out-${tag}@example.com`, name: "Outsider" };
  const created = { households: new Set<string>(), invites: new Set<string>() };

  afterAll(async () => {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const db = getAdminDb();
    for (const h of created.households) {
      for (const m of (await db.collection("households").doc(h).collection("members").get()).docs) await m.ref.delete();
      await db.collection("households").doc(h).delete();
    }
    for (const hash of created.invites) await db.collection("invites").doc(hash).delete();
    for (const u of [owner, spouse, outsider]) await db.collection("users").doc(u.uid).delete();
  });

  it("create, invite, join, wrong-email refusal, one-time use, remove", async () => {
    const { createFirestoreHouseholdStore, serverDeps } = await import("@/lib/households/firestore-store");
    const svc = await import("@/lib/households/service");
    const store = createFirestoreHouseholdStore();

    await svc.createHousehold(store, owner, `itest ${tag}`, serverDeps);
    const m1 = await svc.getMembership(store, owner.uid);
    expect(m1?.role).toBe("owner");
    created.households.add(m1!.household.id);

    const { code } = await svc.createInvite(store, owner, spouse.email, serverDeps);
    for (const i of (await svc.getMembership(store, owner.uid))!.invites) created.invites.add(i.hash);

    await expect(svc.joinHousehold(store, outsider, code, serverDeps)).rejects.toMatchObject({ code: "invalid" });
    await svc.joinHousehold(store, spouse, code, serverDeps);
    const m2 = await svc.getMembership(store, spouse.uid);
    expect(m2?.household.id).toBe(m1!.household.id);
    expect(m2?.role).toBe("member");
    expect(m2?.invites).toEqual([]);
    await expect(svc.joinHousehold(store, outsider, code, serverDeps)).rejects.toMatchObject({ code: "invalid" });
    expect(await svc.getMembership(store, outsider.uid)).toBeNull();

    await svc.removeMember(store, owner, spouse.uid);
    expect(await svc.getMembership(store, spouse.uid)).toBeNull();
  }, 60_000);

  it("personal first: parallel first loads make exactly one space; an invited person is asked, then joins; data is never discarded", async () => {
    const { createFirestoreHouseholdStore, serverDeps } = await import("@/lib/households/firestore-store");
    const svc = await import("@/lib/households/service");
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const store = createFirestoreHouseholdStore();
    const a = { uid: `itest-fa-${tag}`, email: `fa-${tag}@example.com`, name: "Vimal Test" };
    const b = { uid: `itest-fb-${tag}`, email: `fb-${tag}@example.com`, name: "Varru Test" };
    const spaces = new Set<string>();
    try {
      // two loads at the same instant -> one space (the Firestore transaction is what guarantees this)
      await Promise.all([svc.firstRun(store, a, serverDeps), svc.firstRun(store, a, serverDeps), svc.startPersonalSpace(store, a, serverDeps)]);
      const mine = await svc.getMembership(store, a.uid);
      expect(mine?.household.name).toBe("Vimal's finances");
      spaces.add(mine!.household.id);
      const owned = (await getAdminDb().collection("households").where("ownerUid", "==", a.uid).get()).size;
      expect(owned).toBe(1);

      // invite b by email; b is offered the invitation instead of getting a new space
      await svc.createInvite(store, a, b.email, serverDeps);
      const first = await svc.firstRun(store, b, serverDeps);
      expect(first.kind).toBe("invited");
      expect(await svc.getMembership(store, b.uid)).toBeNull();
      if (first.kind !== "invited") return;
      const offer = first.offers[0];
      expect(offer.inviterName).toBe("Vimal Test");

      // b first starts alone, then accepts: an empty own space is dropped, a space with data is not
      await svc.startPersonalSpace(store, b, serverDeps);
      const own = (await svc.getMembership(store, b.uid))!.household.id;
      spaces.add(own);
      await expect(svc.acceptInviteByEmail(store, b, offer.hash, serverDeps, { householdId: own, isEmpty: false })).rejects.toMatchObject({ code: "conflict" });
      expect((await svc.getMembership(store, b.uid))!.household.id).toBe(own);
      await svc.acceptInviteByEmail(store, b, offer.hash, serverDeps, { householdId: own, isEmpty: true });
      const joined = await svc.getMembership(store, b.uid);
      expect(joined?.household.id).toBe(mine!.household.id);
      expect(joined?.role).toBe("member");
      expect((await getAdminDb().collection("households").doc(own).get()).exists).toBe(false);
      expect((await svc.getMembership(store, a.uid))!.members.map((m) => m.email).sort()).toEqual([a.email, b.email].sort());
    } finally {
      const db = getAdminDb();
      for (const h of spaces) {
        for (const m of (await db.collection("households").doc(h).collection("members").get()).docs) await m.ref.delete();
        await db.collection("households").doc(h).delete();
      }
      for (const i of (await db.collection("invites").where("email", "in", [a.email, b.email]).get()).docs) await i.ref.delete();
      for (const u of [a, b]) await db.collection("users").doc(u.uid).delete();
    }
  }, 90_000);
});
