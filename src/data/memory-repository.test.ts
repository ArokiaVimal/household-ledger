import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import { ConflictError } from "./repository";
import { initialRecords, initialSettlements, participants } from "./mock";

const fresh = () => createMemoryRepository("h1", { records: initialRecords, settlements: initialSettlements, participants });

describe("memory repository", () => {
  it("round-trips records without sharing references", async () => {
    const repo = fresh();
    const [r] = await repo.records.list();
    r.merchant = "Mutated";
    expect((await repo.records.get(r.id))!.merchant).not.toBe("Mutated");
  });
  it("rejects invalid records at the boundary", async () => {
    const repo = fresh();
    const r = (await repo.records.list())[0];
    await expect(repo.records.put({ ...r, amountPaise: 12.5 })).rejects.toThrow();
    await expect(repo.records.put({ ...r, shared: true, split: { mode: "custom", participantIds: ["me", "wife"], values: { me: 1, wife: 1 } } })).rejects.toThrow();
  });
  it("lets categorisation change but protects raw imported fields", async () => {
    const repo = fresh();
    const r = (await repo.records.list()).find((x) => x.importSource !== "Manual entry")!;
    await expect(repo.records.put({ ...r, categoryId: "shopping", status: "reviewed" })).resolves.toBeTruthy();
    await expect(repo.records.put({ ...r, amountPaise: r.amountPaise + 1 })).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.records.put({ ...r, originalDescription: "edited" })).rejects.toBeInstanceOf(ConflictError);
  });
  it("settlements cannot be deleted, only voided", async () => {
    const repo = fresh();
    expect("remove" in repo.settlements).toBe(false);
    const s = (await repo.settlements.list())[0];
    await repo.settlements.put({ ...s, voided: true });
    expect((await repo.settlements.list()).find((x) => x.id === s.id)!.voided).toBe(true);
  });
  it("audit log is append-only and timestamped", async () => {
    const repo = fresh();
    const ev = await repo.audit.append({ actorId: "me", action: "approve", entity: "record", entityId: "t01", summary: "Approved" });
    expect(ev.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await repo.audit.list()).length).toBe(1);
    expect("remove" in repo.audit).toBe(false);
  });
  it("two households do not share data", async () => {
    const a = createMemoryRepository("a", { records: initialRecords });
    const b = createMemoryRepository("b");
    expect((await a.records.list()).length).toBeGreaterThan(0);
    expect(await b.records.list()).toEqual([]);
  });
});
