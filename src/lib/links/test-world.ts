// Shared fixtures for the linking tests: three accounts with their own spaces, in memory.
import { createHash, randomBytes } from "node:crypto";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import type { ExpenseRecord } from "@/domain/types";
import { createMemoryHouseholdStore } from "@/lib/households/memory-store";
import { createHousehold, type Deps } from "@/lib/households/service";
import type { Household, Member } from "@/lib/households/types";
import { createMemoryAccountDirectory, createMemoryContactIndex, createMemoryLinkStore, withLinkSpaces } from "./memory";
import type { LinkDeps } from "./service";

let n = 0;
export const hd: Deps = { now: () => Date.parse("2026-10-02T00:00:00Z"), randomBytes: (k) => new Uint8Array(randomBytes(k)), hash: (c) => createHash("sha256").update(c).digest("hex"), newId: () => `id${++n}` };
export const A = { uid: "uA", email: "a@x.com", name: "Asha" };
export const B = { uid: "uB", email: "b@x.com", name: "Bala" };
export const C = { uid: "uC", email: "c@x.com", name: "Chitra" };
export const KEY = "uA__uB";
export const NOW = "2026-10-01T00:00:00.000Z";

export interface World { deps: LinkDeps; repos: Map<string, Repository>; spaces: Map<string, { household: Household; members: Member[] }>; verified: { uid: string; email: string; displayName: string; verified: boolean }[]; spaceOf: (uid: string) => string; own: (uid: string) => Repository }

export async function world(): Promise<World> {
  const hStore = createMemoryHouseholdStore();
  const repos = new Map<string, Repository>();
  const spaces = new Map<string, { household: Household; members: Member[] }>();
  const repoFor = (id: string) => repos.get(id) ?? (repos.set(id, createMemoryRepository(id)), repos.get(id)!);
  const people = [A, B, C];
  for (const p of people) await createHousehold(hStore, p, `${p.name}'s finances`, hd);
  const spaceOf = async (uid: string) => (await hStore.getUserHouseholdId(uid))!;
  const personal = await Promise.all(people.map(async (p) => ({ ownerUid: p.uid, householdId: await spaceOf(p.uid), repo: repoFor(await spaceOf(p.uid)) })));
  for (const p of personal) await p.repo.participants.put({ id: `u_${p.ownerUid}`, name: p.ownerUid, userId: p.ownerUid });
  const verified = people.map((p) => ({ uid: p.uid, email: p.email, displayName: p.name, verified: true }));
  const deps: LinkDeps = {
    store: createMemoryLinkStore(repos, spaces), index: createMemoryContactIndex(() => personal), accounts: createMemoryAccountDirectory(verified as never),
    households: withLinkSpaces(hStore, spaces), repoFor, now: () => Date.parse("2026-10-19T00:00:00Z"), newId: () => `space${++n}`,
  };
  // The directory reads `verified` live so tests can flip it.
  deps.accounts = { findVerifiedByEmail: async (e) => { const a = verified.find((x) => x.email === e.toLowerCase() && x.verified); return a ? { uid: a.uid, email: a.email, displayName: a.displayName } : null; } };
  const ids = Object.fromEntries(personal.map((p) => [p.ownerUid, p.householdId]));
  return { deps, repos, spaces, verified, spaceOf: (uid) => ids[uid], own: (uid) => repoFor(ids[uid]) };
}

export const rec = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "r1", date: "2026-10-01", merchant: "Dinner", originalDescription: "BANK TEXT 4455", amountPaise: 100000, currency: "INR", accountId: "acc1", categoryId: "food", kind: "purchase",
  payerId: "u_uA", shared: true, split: { mode: "equal", participantIds: ["u_uA", "p_b"] }, excluded: false, status: "reviewed", importSource: "Manual entry", notes: "private note", ...o,
});
export const verifiedAcct = (email: string, uid: string) => ({ uid, email, emailVerified: true });

export async function seedA(w: World) {
  const r = w.own("uA");
  await r.categories.put({ id: "food", name: "Food" });
  await r.participants.put({ id: "p_b", name: "Bala (friend)", userId: null, email: "b@x.com", relationship: "friend" });
  await r.participants.put({ id: "p_d", name: "Divya", userId: null });
  await r.records.put(rec());
  await r.records.put(rec({ id: "r_private", merchant: "Pharmacy", split: { mode: "personal", participantIds: ["u_uA"] }, shared: false }));
  await r.records.put(rec({ id: "r_other", merchant: "With Divya", split: { mode: "equal", participantIds: ["u_uA", "p_d"] } }));
  await r.settlements.put({ id: "s1", date: "2026-10-05", fromId: "p_b", toId: "u_uA", amountPaise: 20000, note: "cash" });
  await r.settlements.put({ id: "s_other", date: "2026-10-05", fromId: "p_d", toId: "u_uA", amountPaise: 1000 });
}

