import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryHouseholdStore } from "./memory-store";
import { createHousehold, createInvite, getMembership, joinHousehold, removeMember, revokeInvite, type Deps } from "./service";
import type { Actor } from "./types";

const me: Actor = { uid: "u-me", email: "me@example.com", name: "Me" };
const wife: Actor = { uid: "u-wife", email: "wife@example.com", name: "Wife" };
const stranger: Actor = { uid: "u-x", email: "x@example.com", name: "X" };
let n = 0;
const deps = (nowMs = Date.parse("2026-10-02T00:00:00Z")): Deps => ({ now: () => nowMs, randomBytes: (k) => new Uint8Array(randomBytes(k)), hash: (c) => createHash("sha256").update(c).digest("hex"), newId: () => `hh${++n}` });

async function setup() {
  const store = createMemoryHouseholdStore();
  await createHousehold(store, me, "Home", deps());
  return store;
}

describe("household lifecycle", () => {
  it("creator becomes owner; second household refused", async () => {
    const store = await setup();
    const m = await getMembership(store, me.uid);
    expect(m?.role).toBe("owner");
    expect(m?.members).toHaveLength(1);
    await expect(createHousehold(store, me, "Again", deps())).rejects.toMatchObject({ code: "conflict" });
  });
  it("invite then join gives the spouse the same household as a member", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "Wife@Example.com", deps());
    await joinHousehold(store, wife, c.toLowerCase(), deps());
    const a = await getMembership(store, me.uid);
    const b = await getMembership(store, wife.uid);
    expect(b?.household.id).toBe(a?.household.id);
    expect(b?.role).toBe("member");
    expect(a?.members.map((x) => x.email).sort()).toEqual(["me@example.com", "wife@example.com"]);
    expect(b?.invites).toEqual([]); // members never see invites
  });
  it("stores only the hash, never the code", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "wife@example.com", deps());
    const raw = JSON.stringify(store.dump());
    expect(raw).not.toContain(c.replace("-", ""));
    expect(raw).not.toContain(c);
  });
});

describe("invite safety", () => {
  it("a code works once, only for the invited email, and not after expiry", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "wife@example.com", deps());
    await expect(joinHousehold(store, stranger, c, deps())).rejects.toMatchObject({ code: "invalid" });
    await expect(joinHousehold(store, wife, c, deps(Date.parse("2026-10-20T00:00:00Z")))).rejects.toMatchObject({ code: "invalid" });
    await joinHousehold(store, wife, c, deps());
    await expect(joinHousehold(store, stranger, c, deps())).rejects.toMatchObject({ code: "invalid" });
  });
  it("all join failures share one message", async () => {
    const store = await setup();
    const msgs = new Set<string>();
    for (const bad of ["garbage", "ABCDE-FGHJK", ""]) { try { await joinHousehold(store, wife, bad, deps()); } catch (e) { msgs.add((e as Error).message); } }
    expect(msgs.size).toBe(1);
  });
  it("only the owner can invite, revoke or remove", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "wife@example.com", deps());
    await joinHousehold(store, wife, c, deps());
    await expect(createInvite(store, wife, "friend@example.com", deps())).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(store, wife, me.uid)).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(store, me, me.uid)).rejects.toMatchObject({ code: "conflict" });
    await removeMember(store, me, wife.uid);
    expect(await getMembership(store, wife.uid)).toBeNull();
  });
  it("a revoked invite stops working; cross-household revoke is refused", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "wife@example.com", deps());
    const pending = (await getMembership(store, me.uid))!.invites;
    expect(pending).toHaveLength(1);
    await revokeInvite(store, me, pending[0].hash);
    await expect(joinHousehold(store, wife, c, deps())).rejects.toMatchObject({ code: "invalid" });
    await createHousehold(store, stranger, "Other", deps());
    const { code: c2 } = await createInvite(store, me, "w2@example.com", deps());
    expect(c2).toBeTruthy();
    const h = (await getMembership(store, me.uid))!.invites[0].hash;
    await expect(revokeInvite(store, stranger, h)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("rejects bad emails, existing members and the member cap", async () => {
    const store = await setup();
    await expect(createInvite(store, me, "nope", deps())).rejects.toMatchObject({ code: "invalid" });
    await expect(createInvite(store, me, "ME@example.com", deps())).rejects.toMatchObject({ code: "conflict" });
    for (const e of ["a@x.com", "b@x.com", "c@x.com"]) await createInvite(store, me, e, deps());
    await expect(createInvite(store, me, "d@x.com", deps())).rejects.toMatchObject({ code: "limit" });
  });
});
