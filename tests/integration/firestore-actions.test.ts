// Opt-in end-to-end check of the real-data path against the REAL Firestore (dev project only):
// first-run setup -> changes through applyAction -> reload through loadHouseholdData -> audit trail -> cleanup.
// RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enabled = process.env.RUN_FIRESTORE_TESTS === "1" && !!process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.APP_ENV !== "production";
const hid = `itest-actions-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!enabled)("real-data path on Firestore", () => {
  afterAll(async () => {
    const { deleteHouseholdData } = await import("@/data/firestore-repository");
    await deleteHouseholdData(hid);
  }, 60_000);

  it("setup, changes, reload and audit", async () => {
    const { createFirestoreRepository } = await import("@/data/firestore-repository");
    const { ensureHouseholdReady, loadHouseholdData, participantIdFor } = await import("@/lib/data/load");
    const { applyAction } = await import("@/lib/data/actions");
    const repo = createFirestoreRepository(hid);
    const actor = { uid: "itest-u1" };
    const send = (a: object) => applyAction(repo, actor, a);

    await ensureHouseholdReady(repo, [{ uid: "itest-u1", displayName: "Vimal" }, { uid: "itest-u2", displayName: "Varru" }]);
    await send({ type: "accounts.addSuggested" });
    await send({ type: "category.add", id: "c_pets", name: "Pets" });
    await send({ type: "rule.put", merchant: "PetCo", categoryId: "c_pets" });
    const me = participantIdFor("itest-u1");
    const split = { mode: "equal" as const, participantIds: [me, participantIdFor("itest-u2")] };

    await send({ type: "record.create", record: { id: "rec1", date: "2026-10-05", merchant: "PetCo", amountPaise: 100001, accountId: "cc_hdfc", categoryId: "c_pets", kind: "purchase", payerId: me, shared: true, split, excluded: false } });
    await repo.records.put({ id: "q1", date: "2026-10-06", merchant: "Zepto", originalDescription: "ZEPTO", amountPaise: 64200, currency: "INR", accountId: "cc_hdfc", categoryId: "groceries", kind: "purchase", payerId: me, shared: false, split: { mode: "personal", participantIds: [me] }, excluded: false, status: "unreviewed", importSource: "test.csv", referenceId: "R1" });
    await send({ type: "record.approve", id: "q1", patch: { categoryId: "groceries", notes: "ok" } });
    await send({ type: "settlement.create", settlement: { id: "s1", date: "2026-10-07", fromId: participantIdFor("itest-u2"), toId: me, amountPaise: 50000 } });
    await send({ type: "settlement.void", id: "s1" });
    await send({ type: "category.delete", id: "c_pets", moveTo: "shopping" });
    await expect(send({ type: "record.create", record: { id: "bad", date: "2026-10-05", merchant: "X", amountPaise: 10.5, accountId: "cc_hdfc", categoryId: "groceries", kind: "purchase", payerId: me, shared: false, split: { mode: "personal", participantIds: [me] }, excluded: false } })).rejects.toThrow();

    const data = await loadHouseholdData(repo);
    expect(data.accounts).toHaveLength(10);
    expect(data.participants.map((p) => p.userId).sort()).toEqual(["itest-u1", "itest-u2"]);
    expect(data.categories.some((c) => c.id === "c_pets")).toBe(false);
    expect(data.rules[0].categoryId).toBe("shopping");
    expect(data.records.find((r) => r.id === "rec1")).toMatchObject({ categoryId: "shopping", importSource: "Manual entry", status: "reviewed" });
    expect(data.records.find((r) => r.id === "q1")).toMatchObject({ status: "reviewed", notes: "ok", amountPaise: 64200 });
    expect(data.settlements[0].voided).toBe(true);
    expect(data.records.some((r) => r.id === "bad")).toBe(false);
    const actions = (await repo.audit.list()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["create", "approve", "settle", "void_settlement", "delete"]));
  }, 120_000);
});
