import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { ensureHouseholdReady, loadHouseholdData, participantIdFor } from "./load";

const members = [{ uid: "u1", displayName: "Vimal" }, { uid: "u2", displayName: "Varru" }];

describe("first-run setup", () => {
  it("seeds default categories and one linked participant per member", async () => {
    const repo = createMemoryRepository("h");
    await ensureHouseholdReady(repo, members);
    expect((await repo.categories.list()).length).toBe(DEFAULT_CATEGORIES.length);
    const people = await repo.participants.list();
    expect(people.map((p) => [p.id, p.userId]).sort()).toEqual([[participantIdFor("u1"), "u1"], [participantIdFor("u2"), "u2"]]);
  });
  it("is idempotent and never overwrites edits", async () => {
    const repo = createMemoryRepository("h");
    await ensureHouseholdReady(repo, members);
    await repo.categories.put({ id: "groceries", name: "Food at home" });
    await repo.categories.remove("fuel");
    await ensureHouseholdReady(repo, members);
    expect((await repo.categories.get("groceries"))!.name).toBe("Food at home");
    expect(await repo.categories.get("fuel")).toBeNull();
    expect((await repo.participants.list()).length).toBe(2);
  });
  it("a member who joins later gets a participant", async () => {
    const repo = createMemoryRepository("h");
    await ensureHouseholdReady(repo, members.slice(0, 1));
    await ensureHouseholdReady(repo, members);
    expect((await repo.participants.list()).length).toBe(2);
  });
});

describe("loadHouseholdData", () => {
  it("returns an empty household as empty arrays, defaults first, records newest first", async () => {
    const repo = createMemoryRepository("h");
    await ensureHouseholdReady(repo, members);
    await repo.categories.put({ id: "c_pets", name: "Pets" });
    const d = await loadHouseholdData(repo);
    expect(d.records).toEqual([]);
    expect(d.categories[0].id).toBe("groceries");
    expect(d.categories.at(-1)!.id).toBe("c_pets");
  });
});
