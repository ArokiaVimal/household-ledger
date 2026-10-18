// Opt-in: runs the shared repository contract against the REAL Firestore (dev project only).
// RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration
import { afterAll, describe, vi } from "vitest";
import { describeRepositoryContract } from "@/data/repository.contract";

vi.mock("server-only", () => ({}));
const enabled = process.env.RUN_FIRESTORE_TESTS === "1" && !!process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.APP_ENV !== "production";
const created: string[] = [];

describe.skipIf(!enabled)("Firestore repository (real database)", () => {
  afterAll(async () => {
    const { deleteHouseholdData } = await import("@/data/firestore-repository");
    for (const id of created) await deleteHouseholdData(id);
  }, 60_000);

  describeRepositoryContract(
    "firestore",
    async (householdId, seed) => {
      const { createFirestoreRepository } = await import("@/data/firestore-repository");
      const id = `itest-${householdId}`;
      created.push(id);
      const repo = createFirestoreRepository(id);
      for (const r of seed?.records ?? []) await repo.records.put(r);
      for (const s of seed?.settlements ?? []) await repo.settlements.put(s);
      for (const p of seed?.participants ?? []) await repo.participants.put(p);
      return repo;
    },
    { timeout: 120_000 },
  );
});
