import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { checkFriendDelete } from "@/domain/friends";
import type { ExpenseRecord } from "@/domain/types";
import { adoptPendingPartner, dropPendingPartners, setPendingPartner } from "./pending-partner";

const rec = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "r1", date: "2026-10-01", merchant: "Rent", originalDescription: "RENT", amountPaise: 2500000, currency: "INR", accountId: "a", categoryId: "rent", kind: "purchase",
  payerId: "me", shared: true, split: { mode: "percent", participantIds: ["me", "p_inv_1"], values: { me: 6400, p_inv_1: 3600 } }, excluded: false, status: "reviewed", importSource: "manual", ...o,
});
const pending = { id: "p_inv_1", name: "Varru", email: "Varru@Example.com" };

describe("pending partner", () => {
  it("appears by name as soon as invited, and only one waits at a time", async () => {
    const repo = createMemoryRepository("h");
    await setPendingPartner(repo, pending);
    await setPendingPartner(repo, { id: "p_inv_2", name: "Someone Else", email: "x@y.com" });
    const people = await repo.participants.list();
    expect(people.map((p) => p.name)).toEqual(["Someone Else"]);
    expect(people[0]).toMatchObject({ userId: null, pendingEmail: "x@y.com" });
  });
  it("cancelling removes an unused pending person but keeps one that a split uses, as a plain friend", async () => {
    const repo = createMemoryRepository("h");
    await setPendingPartner(repo, pending);
    await dropPendingPartners(repo);
    expect(await repo.participants.list()).toEqual([]);
    await setPendingPartner(repo, pending);
    await repo.records.put(rec());
    await dropPendingPartners(repo);
    const [p] = await repo.participants.list();
    expect(p.name).toBe("Varru");
    expect(p.pendingEmail).toBeUndefined();
  });
  it("on acceptance every split moves to the real account, keeping the percentages", async () => {
    const repo = createMemoryRepository("h");
    await setPendingPartner(repo, pending);
    await repo.records.put(rec());
    await repo.records.put(rec({ id: "r2", payerId: "p_inv_1", split: { mode: "equal", participantIds: ["me", "p_inv_1"] } }));
    const { changed } = await adoptPendingPartner(repo, { email: "varru@example.com", id: "u_v", uid: "v", name: "Varalakshmi" });
    expect(changed).toBe(2);
    expect((await repo.records.get("r1"))!.split).toEqual({ mode: "percent", participantIds: ["me", "u_v"], values: { me: 6400, u_v: 3600 } });
    expect((await repo.records.get("r2"))!.payerId).toBe("u_v");
    const people = await repo.participants.list();
    expect(people.map((p) => p.id)).toEqual(["u_v"]);
    expect(people[0]).toMatchObject({ name: "Varru", userId: "v" });
  });
  it("accepting with a different email changes nothing", async () => {
    const repo = createMemoryRepository("h");
    await setPendingPartner(repo, pending);
    expect((await adoptPendingPartner(repo, { email: "other@example.com", id: "u_o", uid: "o", name: "O" })).changed).toBe(0);
    expect(await repo.participants.list()).toHaveLength(1);
  });
  it("remembers the usual split chosen at invite time and hands it over on acceptance", async () => {
    const repo = createMemoryRepository("h");
    await setPendingPartner(repo, { ...pending, inviterShareBps: 6400 });
    expect((await repo.participants.list())[0].inviterShareBps).toBe(6400);
    expect((await adoptPendingPartner(repo, { email: "varru@example.com", id: "u_v", uid: "v", name: "V" })).inviterShareBps).toBe(6400);
  });
  it("is not removable as a friend", () => {
    const p = { id: "p_inv_1", name: "Varru", userId: null, pendingEmail: "v@x.com" };
    expect(checkFriendDelete(p, "me", { transactions: 0, settlements: 0, recurring: [] }).ok).toBe(false);
  });
});
