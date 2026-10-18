import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryHouseholdStore } from "./memory-store";
import { acceptInviteByEmail, createHousehold, createInvite, firstRun, getMembership, joinHousehold, pendingInvitesFor, removeMember, revokeInvite, startPersonalSpace, type Deps } from "./service";
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
  it("someone with a pending invitation is asked, and no space is created for them", async () => {
    const store = await setup();
    await createInvite(store, me, "Wife@Example.com", deps());
    const r = await firstRun(store, wife, deps());
    expect(r.kind).toBe("invited");
    if (r.kind === "invited") expect(r.offers[0]).toMatchObject({ inviterName: "Me" });
    expect(await getMembership(store, wife.uid)).toBeNull();
  });
  it("an expired or used invitation is ignored", async () => {
    const store = await setup();
    const { code } = await createInvite(store, me, "wife@example.com", deps());
    expect(await pendingInvitesFor(store, wife.email, deps(Date.parse("2026-12-01T00:00:00Z")))).toEqual([]);
    await joinHousehold(store, wife, code, deps());
    expect(await pendingInvitesFor(store, wife.email, deps())).toEqual([]);
  });
});

describe("accepting an invitation by email (no code)", () => {
  it("joins the sender's space as a member", async () => {
    const store = await setup();
    await createInvite(store, me, "wife@example.com", deps());
    const [offer] = await pendingInvitesFor(store, wife.email, deps());
    await acceptInviteByEmail(store, wife, offer.hash, deps(), null);
    const w = await getMembership(store, wife.uid);
    expect(w?.role).toBe("member");
    expect(w?.household.id).toBe((await getMembership(store, me.uid))!.household.id);
  });
  it("only the invited email can accept, and only once", async () => {
    const store = await setup();
    await createInvite(store, me, "wife@example.com", deps());
    const [offer] = await pendingInvitesFor(store, wife.email, deps());
    await expect(acceptInviteByEmail(store, stranger, offer.hash, deps(), null)).rejects.toMatchObject({ code: "invalid" });
    await acceptInviteByEmail(store, wife, offer.hash, deps(), null);
    await expect(acceptInviteByEmail(store, wife, offer.hash, deps(), null)).rejects.toMatchObject({ code: "invalid" });
  });
  it("an empty private space is dropped to make room; one holding data is never discarded", async () => {
    const store = await setup();
    await createInvite(store, me, "wife@example.com", deps());
    const [offer] = await pendingInvitesFor(store, wife.email, deps());
    await startPersonalSpace(store, wife, deps());
    const own = (await getMembership(store, wife.uid))!.household.id;
    await expect(acceptInviteByEmail(store, wife, offer.hash, deps(), { householdId: own, isEmpty: false })).rejects.toMatchObject({ code: "conflict" });
    expect((await getMembership(store, wife.uid))!.household.id).toBe(own); // untouched
    await acceptInviteByEmail(store, wife, offer.hash, deps(), { householdId: own, isEmpty: true });
    const after = await getMembership(store, wife.uid);
    expect(after?.household.id).not.toBe(own);
    expect(store.dump().households.some((h) => h.id === own)).toBe(false);
  });
  it("refuses an invitation that is not addressed to the caller's email even with a known hash", async () => {
    const store = await setup();
    const { code } = await createInvite(store, me, "wife@example.com", deps());
    void code;
    const [offer] = await pendingInvitesFor(store, wife.email, deps());
    await expect(acceptInviteByEmail(store, { ...stranger, email: "wife2@example.com" }, offer.hash, deps(), null)).rejects.toMatchObject({ code: "invalid" });
  });
});
