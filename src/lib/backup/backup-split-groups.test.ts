import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { buildBackup, restoreBackup, sha256Hex, verifyBackup } from "./backup";

async function withGroup() {
  const repo = createMemoryRepository("h1");
  await repo.splitGroups.put({ id: "g1", name: "Goa trip", kind: "trip", participantIds: ["me", "a"], createdAt: "2026-10-01" });
  await repo.splitSettlements.put({ id: "p1", groupId: "g1", date: "2026-10-05", fromId: "a", toId: "me", amountPaise: 5000, ledgerSettlementId: "p1-l" });
  return repo;
}

describe("backup of split groups", () => {
  it("includes groups and their payments and restores them", async () => {
    const a = await withGroup();
    const backup = JSON.parse(JSON.stringify(await buildBackup(a)));
    expect(backup.counts).toMatchObject({ splitGroups: 1, splitSettlements: 1 });
    const v = await verifyBackup(backup);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const b = createMemoryRepository("h2");
    await restoreBackup(b, v.backup, async () => {});
    expect(await b.splitGroups.get("g1")).toMatchObject({ name: "Goa trip" });
    expect(await b.splitSettlements.get("p1")).toMatchObject({ amountPaise: 5000, ledgerSettlementId: "p1-l" });
    expect((await buildBackup(b)).checksum).toBe(backup.checksum);
  });
  it("a backup made before split groups existed still verifies and restores (as no groups)", async () => {
    const backup = JSON.parse(JSON.stringify(await buildBackup(createMemoryRepository("old"))));
    delete backup.collections.splitGroups; delete backup.collections.splitSettlements; delete backup.counts.splitGroups; delete backup.counts.splitSettlements;
    // The old checksum covered only the sections that existed then.
    const canonical = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
    backup.checksum = await sha256Hex(canonical(backup.collections));
    const v = await verifyBackup(backup);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const b = createMemoryRepository("restored");
    await restoreBackup(b, v.backup, async () => {});
    expect(await b.splitGroups.list()).toEqual([]);
  });
  it("rejects a damaged group", async () => {
    const backup = JSON.parse(JSON.stringify(await buildBackup(await withGroup())));
    backup.collections.splitGroups[0].participantIds = ["me"];
    expect((await verifyBackup(backup) as { errors: string[] }).errors[0]).toMatch(/^splitGroups #1/);
  });
});
