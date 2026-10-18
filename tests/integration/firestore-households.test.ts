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
});
