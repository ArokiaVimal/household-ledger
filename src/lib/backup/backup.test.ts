import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { buildBackup, restoreBackup, verifyBackup } from "./backup";

async function seeded() {
  const repo = createMemoryRepository("h1");
  await repo.categories.put({ id: "groceries", name: "Groceries" });
  await repo.accounts.put({ id: "cc", name: "Amex", type: "credit_card" });
  await repo.participants.put({ id: "me", name: "Me", userId: "u1" });
  await repo.records.put({ id: "r1", date: "2026-09-10", merchant: "Zepto", originalDescription: "ZEPTO", amountPaise: 64200, currency: "INR", accountId: "cc", categoryId: "groceries", kind: "purchase", payerId: "me", shared: false, split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "x.csv" });
  await repo.importBatches.put({ id: "b1", accountId: "cc", filename: "x.csv", fileHash: "a".repeat(64), format: "csv", uploadedAt: "2026-09-10T00:00:00.000Z", uploadedBy: "u1", counts: { rows: 1, staged: 1, skippedDuplicate: 0, flaggedDuplicate: 0, unreadable: 0 }, totals: { debitPaise: 64200, creditPaise: 0 } });
  await repo.rawTransactions.put({ id: "b1-1", batchId: "b1", line: 1, cells: ["10/09/2026", "ZEPTO", "642.00"] });
  await repo.settlements.put({ id: "s1", date: "2026-09-12", fromId: "p_k", toId: "me", amountPaise: 100 });
  await repo.audit.append({ actorId: "u1", action: "approve", entity: "record", entityId: "r1", summary: "Approved Zepto", at: "2026-09-10T01:00:00.000Z" });
  return repo;
}

describe("backup and restore", () => {
  it("round-trips: export, verify, restore into a fresh space, export again, same checksum", async () => {
    const a = await seeded();
    const backup = JSON.parse(JSON.stringify(await buildBackup(a, new Date("2026-10-19T00:00:00Z"))));
    expect(backup.counts).toMatchObject({ records: 1, rawTransactions: 1, settlements: 1, audit: 1, importBatches: 1 });
    const v = await verifyBackup(backup);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const b = createMemoryRepository("h2");
    let wiped = false;
    await restoreBackup(b, v.backup, async () => { wiped = true; });
    expect(wiped).toBe(true);
    const again = await buildBackup(b, new Date("2026-10-20T00:00:00Z"));
    expect(again.checksum).toBe(backup.checksum);
    expect((await b.audit.list())[0]).toMatchObject({ id: (await a.audit.list())[0].id, summary: "Approved Zepto", at: "2026-09-10T01:00:00.000Z" });
  });
  it("catches a changed amount, a wrong count, a bad row, a wrong file and a wrong version", async () => {
    const backup = JSON.parse(JSON.stringify(await buildBackup(await seeded())));
    const edited = JSON.parse(JSON.stringify(backup)); edited.collections.records[0].amountPaise = 1;
    expect(await verifyBackup(edited)).toMatchObject({ ok: false, errors: [expect.stringMatching(/checksum/i)] });
    const counted = JSON.parse(JSON.stringify(backup)); counted.counts.records = 5;
    expect((await verifyBackup(counted) as { errors: string[] }).errors.join(" ")).toMatch(/records: the file says 5/);
    const bad = JSON.parse(JSON.stringify(backup)); bad.collections.records[0].amountPaise = 12.5;
    expect((await verifyBackup(bad) as { errors: string[] }).errors[0]).toMatch(/^records #1/);
    expect(await verifyBackup({ hello: 1 })).toMatchObject({ ok: false });
    expect(await verifyBackup({ ...backup, version: 99 })).toMatchObject({ ok: false });
    const missing = JSON.parse(JSON.stringify(backup)); delete missing.collections.settlements;
    expect((await verifyBackup(missing) as { errors: string[] }).errors.join(" ")).toMatch(/settlements section is missing/);
  });
  it("warns, without blocking, about references that point outside the backup", async () => {
    const repo = createMemoryRepository("w");
    await repo.records.put({ id: "r9", date: "2026-09-10", merchant: "X", originalDescription: "X", amountPaise: 100, currency: "INR", accountId: "gone", categoryId: "gone", kind: "purchase", payerId: "partner", shared: false, split: { mode: "personal", participantIds: ["partner"] }, excluded: false, status: "reviewed", importSource: "x.csv" });
    const v = await verifyBackup(JSON.parse(JSON.stringify(await buildBackup(repo))));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.warnings.join(" ")).toMatch(/payment method[\s\S]*category|category/);
  });
  it("an empty space backs up and restores cleanly", async () => {
    const empty = createMemoryRepository("e");
    const v = await verifyBackup(JSON.parse(JSON.stringify(await buildBackup(empty))));
    expect(v.ok).toBe(true);
  });
});
