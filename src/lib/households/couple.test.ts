import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { acceptPartnerInvite, getActiveCouple, getCouple, invitePartner, setSplitRatio, unlinkPartner } from "./couple";
import { createMemoryHouseholdStore } from "./memory-store";
import { createHousehold, type Deps } from "./service";
import type { Actor } from "./types";

const me: Actor = { uid: "u-me", email: "me@example.com", name: "Me" };
const wife: Actor = { uid: "u-wife", email: "wife@example.com", name: "Wife" };
const third: Actor = { uid: "u-third", email: "third@example.com", name: "Third" };
let n = 0;
const deps = (nowMs = Date.parse("2026-10-02T00:00:00Z")): Deps => ({ now: () => nowMs, randomBytes: (k) => new Uint8Array(randomBytes(k)), hash: (c) => createHash("sha256").update(c).digest("hex"), newId: () => `id${++n}` });

async function setup() {
  const store = createMemoryHouseholdStore();
  for (const a of [me, wife, third]) await createHousehold(store, a, `${a.name}'s finances`, deps());
  return store;
}
const invite = async (store: ReturnType<typeof createMemoryHouseholdStore>, from = me, to = wife) => {
  await invitePartner(store, from, to.email, deps());
  return store.findInvitesByEmail(to.email.toLowerCase()).then((l) => l.find((i) => !i.usedAt)!.hash);
};

describe("linking partners", () => {
  it("creates a separate couple space; both personal spaces stay private and single-member", async () => {
    const store = await setup();
    await acceptPartnerInvite(store, wife, await invite(store), deps());
    const a = await getActiveCouple(store, me.uid);
    const b = await getActiveCouple(store, wife.uid);
    expect(a?.household.id).toBe(b?.household.id);
    expect(a?.household.kind).toBe("couple");
    expect(a?.partner?.uid).toBe(wife.uid);
    expect(a?.household.splitRatio).toBeUndefined(); // not chosen yet: the app asks once
    for (const u of [me.uid, wife.uid]) {
      const own = await store.getUserHouseholdId(u);
      expect(own).not.toBe(a?.household.id);
      expect(await store.listMembers(own!)).toHaveLength(1);
    }
  });
  it("only the invited email can accept, once; expired and self invitations fail", async () => {
    const store = await setup();
    const hash = await invite(store);
    await expect(acceptPartnerInvite(store, third, hash, deps())).rejects.toMatchObject({ code: "invalid" });
    await expect(acceptPartnerInvite(store, me, hash, deps())).rejects.toMatchObject({ code: "invalid" });
    await expect(acceptPartnerInvite(store, wife, hash, deps(Date.parse("2026-12-01T00:00:00Z")))).rejects.toMatchObject({ code: "invalid" });
    await acceptPartnerInvite(store, wife, hash, deps());
    await expect(acceptPartnerInvite(store, wife, hash, deps())).rejects.toMatchObject({ code: "invalid" });
  });
  it("one active partner at a time; a new invitation replaces the waiting one", async () => {
    const store = await setup();
    await acceptPartnerInvite(store, wife, await invite(store), deps());
    await expect(invitePartner(store, me, third.email, deps())).rejects.toMatchObject({ code: "conflict" });
    const store2 = await setup();
    const first = await invite(store2, me, wife);
    const second = await invite(store2, me, third);
    expect(await store2.getInvite(first)).toBeNull();
    expect(await store2.getInvite(second)).not.toBeNull();
  });
});

describe("split ratio", () => {
  it("either partner can set it; it must give both a real share and name a partner", async () => {
    const store = await setup();
    await acceptPartnerInvite(store, wife, await invite(store), deps());
    await setSplitRatio(store, wife, { leaderUid: me.uid, leaderBps: 6400 });
    expect((await getActiveCouple(store, me.uid))?.household.splitRatio).toEqual({ leaderUid: me.uid, leaderBps: 6400 });
    await expect(setSplitRatio(store, me, { leaderUid: me.uid, leaderBps: 10000 })).rejects.toMatchObject({ code: "invalid" });
    await expect(setSplitRatio(store, me, { leaderUid: me.uid, leaderBps: 12.5 })).rejects.toMatchObject({ code: "invalid" });
    await expect(setSplitRatio(store, me, { leaderUid: third.uid, leaderBps: 5000 })).rejects.toMatchObject({ code: "invalid" });
    await expect(setSplitRatio(store, third, { leaderUid: third.uid, leaderBps: 5000 })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("unlinking", () => {
  it("ends the couple for both, keeps it readable, and lets either link again", async () => {
    const store = await setup();
    await acceptPartnerInvite(store, wife, await invite(store), deps());
    await unlinkPartner(store, me, deps());
    expect(await getActiveCouple(store, me.uid)).toBeNull();
    expect(await getActiveCouple(store, wife.uid)).toBeNull();
    const old = await getCouple(store, wife.uid);
    expect(old?.active).toBe(false);
    expect(old?.household.endedBy).toBe(me.uid);
    await expect(setSplitRatio(store, wife, { leaderUid: me.uid, leaderBps: 5000 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(unlinkPartner(store, me, deps())).rejects.toMatchObject({ code: "conflict" });
    await acceptPartnerInvite(store, third, await invite(store, me, third), deps());
    expect((await getActiveCouple(store, me.uid))?.partner?.uid).toBe(third.uid);
  });
});
