import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryHouseholdStore } from "./memory-store";
import { createHousehold, createInvite, firstRun, getMembership, pendingInvitesFor, revokeInvite, startPersonalSpace, type Deps } from "./service";
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

describe("personal space lifecycle", () => {
  it("creator becomes owner; second space refused", async () => {
    const store = await setup();
    const m = await getMembership(store, me.uid);
    expect(m?.role).toBe("owner");
    expect(m?.members).toHaveLength(1);
    await expect(createHousehold(store, me, "Again", deps())).rejects.toMatchObject({ code: "conflict" });
  });
  it("stores only the invite hash, never the code", async () => {
    const store = await setup();
    const { code: c } = await createInvite(store, me, "wife@example.com", deps());
    const raw = JSON.stringify(store.dump());
    expect(raw).not.toContain(c.replace("-", ""));
    expect(raw).not.toContain(c);
  });
});

describe("invite safety", () => {
  it("only the owner can invite or revoke; a revoked invite disappears; cross-space revoke is refused", async () => {
    const store = await setup();
    await createInvite(store, me, "wife@example.com", deps());
    const pending = (await getMembership(store, me.uid))!.invites;
    expect(pending).toHaveLength(1);
    await createHousehold(store, stranger, "Other", deps());
    await expect(revokeInvite(store, stranger, pending[0].hash)).rejects.toMatchObject({ code: "forbidden" });
    await revokeInvite(store, me, pending[0].hash);
    expect((await getMembership(store, me.uid))!.invites).toEqual([]);
  });
  it("rejects bad emails, existing members and the member cap", async () => {
    const store = await setup();
    await expect(createInvite(store, me, "nope", deps())).rejects.toMatchObject({ code: "invalid" });
    await expect(createInvite(store, me, "ME@example.com", deps())).rejects.toMatchObject({ code: "conflict" });
    for (const e of ["a@x.com", "b@x.com", "c@x.com"]) await createInvite(store, me, e, deps());
    await expect(createInvite(store, me, "d@x.com", deps())).rejects.toMatchObject({ code: "limit" });
  });
});

describe("first run is personal first", () => {
  const vimal: Actor = { uid: "u-v", email: "vimal@example.com", name: "Vimal Arokia" };
  it("creates a private space automatically, named after the person, and is idempotent", async () => {
    const store = createMemoryHouseholdStore();
    expect(await firstRun(store, vimal, deps())).toEqual({ kind: "ready" });
    const m = await getMembership(store, vimal.uid);
    expect(m?.household.name).toBe("Vimal's finances");
    expect(m?.role).toBe("owner");
    expect(m?.members).toHaveLength(1);
    await firstRun(store, vimal, deps());
    expect(store.dump().households).toHaveLength(1);
  });
  it("two loads at the same moment still make exactly one space", async () => {
    const store = createMemoryHouseholdStore();
    await Promise.all([firstRun(store, vimal, deps()), firstRun(store, vimal, deps()), startPersonalSpace(store, vimal, deps())]);
    expect(store.dump().households).toHaveLength(1);
  });
  it("someone with a pending invitation still gets their own private space; the invitation waits in Settings", async () => {
    const store = await setup();
    await createInvite(store, me, "Wife@Example.com", deps());
    expect(await firstRun(store, wife, deps())).toEqual({ kind: "ready" });
    expect((await getMembership(store, wife.uid))?.members).toHaveLength(1);
    expect((await pendingInvitesFor(store, wife.email, deps()))[0]).toMatchObject({ inviterName: "Me" });
  });
  it("an expired invitation is not offered", async () => {
    const store = await setup();
    await createInvite(store, me, "wife@example.com", deps());
    expect(await pendingInvitesFor(store, wife.email, deps(Date.parse("2026-12-01T00:00:00Z")))).toEqual([]);
  });
});
