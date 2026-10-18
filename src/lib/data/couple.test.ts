import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { acceptPartnerInvite, getCouple, invitePartner, setSplitRatio, unlinkPartner } from "@/lib/households/couple";
import { createMemoryHouseholdStore } from "@/lib/households/memory-store";
import { createHousehold, type Deps } from "@/lib/households/service";
import { coupleContextFor, loadCoupleData } from "./couple";
import { participantIdFor } from "./load";

let n = 0;
const d: Deps = { now: () => Date.parse("2026-10-02T00:00:00Z"), randomBytes: (k) => new Uint8Array(randomBytes(k)), hash: (c) => createHash("sha256").update(c).digest("hex"), newId: () => `id${++n}` };
const me = { uid: "u-me", email: "me@x.com", name: "Vimal" };
const wife = { uid: "u-wife", email: "wife@x.com", name: "Varru" };

async function linked() {
  const store = createMemoryHouseholdStore();
  await createHousehold(store, me, "A", d); await createHousehold(store, wife, "B", d);
  await invitePartner(store, me, wife.email, d);
  await acceptPartnerInvite(store, wife, (await store.findInvitesByEmail(wife.email))[0].hash, d);
  const repos = new Map<string, ReturnType<typeof createMemoryRepository>>();
  const repoFor = (id: string) => repos.get(id) ?? (repos.set(id, createMemoryRepository(id)), repos.get(id)!);
  return { store, repoFor };
}

describe("couple context and data", () => {
  it("has no context before linking", async () => {
    const store = createMemoryHouseholdStore();
    await createHousehold(store, me, "A", d);
    expect(await coupleContextFor(store, me.uid, (id) => createMemoryRepository(id))).toBeNull();
  });
  it("names both partners by stable participant ids", async () => {
    const { store, repoFor } = await linked();
    const ctx = await coupleContextFor(store, wife.uid, repoFor);
    expect(ctx).toMatchObject({ meId: participantIdFor(wife.uid), partnerId: participantIdFor(me.uid), active: true });
  });
  it("loads participants, the ratio, and only expenses that still count", async () => {
    const { store, repoFor } = await linked();
    await setSplitRatio(store, me, { leaderUid: me.uid, leaderBps: 6400 });
    const c = (await getCouple(store, wife.uid))!;
    const repo = repoFor(c.household.id);
    const x = { id: "e1", ownerUid: me.uid, payerId: participantIdFor(me.uid), date: "2026-10-01", merchant: "Zepto", amountPaise: 10000, kind: "purchase" as const, categoryId: "groceries", categoryName: "Groceries", split: { mode: "equal" as const, participantIds: [participantIdFor(me.uid), participantIdFor(wife.uid)] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
    await repo.sharedExpenses.put(x);
    await repo.sharedExpenses.put({ ...x, id: "e2", voided: true });
    const data = (await loadCoupleData(repo, c))!;
    expect(data.shared.map((s) => s.id)).toEqual(["e1"]);
    expect(data.partner).toMatchObject({ name: "Vimal", participantId: participantIdFor(me.uid) });
    expect(data.ratio).toEqual({ leaderId: participantIdFor(me.uid), leaderBps: 6400 });
    expect(data.participants.map((p) => p.name).sort()).toEqual(["Varru", "Vimal"]);
    await unlinkPartner(store, me, d);
    expect((await loadCoupleData(repo, (await getCouple(store, wife.uid))!))!.active).toBe(false);
  });
});
