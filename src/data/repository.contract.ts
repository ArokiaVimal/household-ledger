// One behavioural contract that EVERY Repository implementation must satisfy.
// memory-repository.test.ts runs it always; the opt-in Firestore integration test runs it against the real database.
import { describe, expect, it } from "vitest";
import { ConflictError, type Repository } from "./repository";
import { initialRecords, initialSettlements, participants } from "./mock";
import type { Seed } from "./memory-repository";

export type Factory = (householdId: string, seed?: Seed) => Promise<Repository> | Repository;

export function describeRepositoryContract(label: string, make: Factory, opts: { timeout?: number } = {}) {
  const timeout = opts.timeout ?? 5_000;
  const fresh = (id = `h-${Math.random().toString(36).slice(2, 8)}`) => make(id, { records: initialRecords, settlements: initialSettlements, participants });

  describe(`${label}: repository contract`, () => {
    it("round-trips records without sharing references", async () => {
      const repo = await fresh();
      const [r] = await repo.records.list();
      r.merchant = "Mutated";
      expect((await repo.records.get(r.id))!.merchant).not.toBe("Mutated");
    }, timeout);

    it("returns null for a missing id", async () => {
      expect(await (await fresh()).records.get("does-not-exist")).toBeNull();
    }, timeout);

    it("rejects invalid records at the boundary", async () => {
      const repo = await fresh();
      const r = (await repo.records.list())[0];
      await expect(repo.records.put({ ...r, amountPaise: 12.5 })).rejects.toThrow();
      await expect(repo.records.put({ ...r, shared: true, split: { mode: "custom", participantIds: ["me", "wife"], values: { me: 1, wife: 1 } } })).rejects.toThrow();
    }, timeout);

    it("lets categorisation change but protects raw imported fields", async () => {
      const repo = await fresh();
      const r = (await repo.records.list()).find((x) => x.importSource !== "Manual entry")!;
      await expect(repo.records.put({ ...r, categoryId: "shopping", status: "reviewed" })).resolves.toBeTruthy();
      expect((await repo.records.get(r.id))!.categoryId).toBe("shopping");
      await expect(repo.records.put({ ...r, amountPaise: r.amountPaise + 1 })).rejects.toBeInstanceOf(ConflictError);
      await expect(repo.records.put({ ...r, originalDescription: "edited" })).rejects.toBeInstanceOf(ConflictError);
    }, timeout);

    it("settlements cannot be deleted, only voided", async () => {
      const repo = await fresh();
      expect("remove" in repo.settlements).toBe(false);
      const s = (await repo.settlements.list())[0];
      await repo.settlements.put({ ...s, voided: true });
      expect((await repo.settlements.list()).find((x) => x.id === s.id)!.voided).toBe(true);
    }, timeout);

    it("audit log is append-only and timestamped", async () => {
      const repo = await fresh();
      const ev = await repo.audit.append({ actorId: "me", action: "approve", entity: "record", entityId: "t01", summary: "Approved" });
      expect(ev.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect((await repo.audit.list()).map((e) => e.id)).toContain(ev.id);
      expect("remove" in repo.audit).toBe(false);
    }, timeout);

    it("rules, categories: put, get, list, remove", async () => {
      const repo = await fresh();
      await repo.categories.put({ id: "c_pets", name: "Pets" });
      await repo.rules.put({ id: "r_petco", merchant: "PetCo", categoryId: "c_pets" });
      expect((await repo.rules.get("r_petco"))?.categoryId).toBe("c_pets");
      expect((await repo.categories.list()).some((c) => c.id === "c_pets")).toBe(true);
      await repo.rules.remove("r_petco");
      expect(await repo.rules.get("r_petco")).toBeNull();
      await expect(repo.rules.put({ id: "r_x", merchant: "", categoryId: "c_pets" })).rejects.toThrow();
    }, timeout);

    it("two households do not share data", async () => {
      const a = await make(`ha-${Math.random().toString(36).slice(2, 8)}`, { records: initialRecords });
      const b = await make(`hb-${Math.random().toString(36).slice(2, 8)}`);
      expect((await a.records.list()).length).toBeGreaterThan(0);
      expect(await b.records.list()).toEqual([]);
    }, timeout);
  });
}
