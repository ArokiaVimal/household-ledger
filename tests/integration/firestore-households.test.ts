// Opt-in integration test against a REAL Firestore project (dev only!).
// Run: RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration
// Uses throwaway ids prefixed "itest-" and deletes everything it creates.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enabled = process.env.RUN_FIRESTORE_TESTS === "1" && !!process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.APP_ENV !== "production";

describe.skipIf(!enabled)("Firestore household store (real database)", () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const a = { uid: `itest-fa-${tag}`, email: `fa-${tag}@example.com`, name: "Vimal Test" };
  const b = { uid: `itest-fb-${tag}`, email: `fb-${tag}@example.com`, name: "Varru Test" };
  const c = { uid: `itest-fc-${tag}`, email: `fc-${tag}@example.com`, name: "Third Test" };
  const spaces = new Set<string>();

  afterAll(async () => {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const db = getAdminDb();
    for (const h of spaces) {
      for (const m of (await db.collection("households").doc(h).collection("members").get()).docs) await m.ref.delete();
      await db.collection("households").doc(h).delete();
    }
    for (const i of (await db.collection("invites").where("email", "in", [a.email, b.email, c.email]).get()).docs) await i.ref.delete();
    for (const u of [a, b, c]) await db.collection("users").doc(u.uid).delete();
  });

  it("personal first, then link as a couple: separate spaces, one-time invites, ratio, unlink, relink", async () => {
    const { createFirestoreHouseholdStore, serverDeps } = await import("@/lib/households/firestore-store");
    const svc = await import("@/lib/households/service");
    const couple = await import("@/lib/households/couple");
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const store = createFirestoreHouseholdStore();

    // two loads at the same instant -> one personal space (the Firestore transaction guarantees this)
    await Promise.all([svc.firstRun(store, a, serverDeps), svc.firstRun(store, a, serverDeps), svc.startPersonalSpace(store, a, serverDeps)]);
    for (const u of [b, c]) await svc.firstRun(store, u, serverDeps);
    const mine = (await svc.getMembership(store, a.uid))!;
    expect(mine.household.name).toBe("Vimal's finances");
    expect((await getAdminDb().collection("households").where("ownerUid", "==", a.uid).get()).size).toBe(1);
    for (const u of [a, b, c]) spaces.add((await svc.getMembership(store, u.uid))!.household.id);

    await couple.invitePartner(store, a, b.email, serverDeps);
    const [offer] = await svc.pendingInvitesFor(store, b.email, serverDeps);
    expect(offer.inviterName).toBe("Vimal Test");
    await expect(couple.acceptPartnerInvite(store, c, offer.hash, serverDeps)).rejects.toMatchObject({ code: "invalid" });
    await couple.acceptPartnerInvite(store, b, offer.hash, serverDeps);
    await expect(couple.acceptPartnerInvite(store, b, offer.hash, serverDeps)).rejects.toMatchObject({ code: "invalid" });

    const ca = (await couple.getActiveCouple(store, a.uid))!;
    spaces.add(ca.household.id);
    expect((await couple.getActiveCouple(store, b.uid))!.household.id).toBe(ca.household.id);
    // personal spaces stay single-member and private
    expect((await svc.getMembership(store, a.uid))!.members).toHaveLength(1);
    expect((await svc.getMembership(store, b.uid))!.members).toHaveLength(1);

    await couple.setSplitRatio(store, b, { leaderUid: a.uid, leaderBps: 6400 });
    expect((await couple.getActiveCouple(store, a.uid))!.household.splitRatio).toEqual({ leaderUid: a.uid, leaderBps: 6400 });

    await couple.unlinkPartner(store, a, serverDeps);
    expect(await couple.getActiveCouple(store, b.uid)).toBeNull();
    expect((await couple.getCouple(store, b.uid))!.active).toBe(false);

    await couple.invitePartner(store, a, c.email, serverDeps);
    const [offer2] = await svc.pendingInvitesFor(store, c.email, serverDeps);
    await couple.acceptPartnerInvite(store, c, offer2.hash, serverDeps);
    const relinked = (await couple.getActiveCouple(store, a.uid))!;
    spaces.add(relinked.household.id);
    expect(relinked.partner?.uid).toBe(c.uid);
  }, 120_000);
});
