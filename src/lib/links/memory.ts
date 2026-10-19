import type { Repository } from "@/data/repository";
import type { ContactLink, OwnerContacts } from "@/domain/links";
import type { Household, HouseholdStore, Member } from "@/lib/households/types";
import type { AccountDirectory, ContactIndex, LinkStore } from "./types";

/** In-memory link store for tests. `spaces` is the registry of repositories the test's `repoFor` hands out, so deleting a space really removes its data. */
export function createMemoryLinkStore(spaces: Map<string, Repository>, households: Map<string, { household: Household; members: Member[] }>): LinkStore {
  const pairs = new Map<string, ContactLink>();
  return {
    async getPair(key) { const p = pairs.get(key); return p ? structuredClone(p) : null; },
    async listForUser(uid) { return [...pairs.values()].filter((p) => p.uids.includes(uid)).map((p) => structuredClone(p)); },
    async putPair(link) { pairs.set(link.id, structuredClone(link)); },
    async deletePair(key) { pairs.delete(key); },
    async createLinkSpace(space, members) { if (!households.has(space.id)) households.set(space.id, { household: space, members }); },
    async deleteLinkSpace(id) { households.delete(id); spaces.delete(id); },
  };
}

/** Test index: scans the personal-space repositories it is given. */
export function createMemoryContactIndex(personal: () => { ownerUid: string; householdId: string; repo: Repository }[]): ContactIndex {
  return {
    async findContactsByEmail(email) {
      const out: OwnerContacts[] = [];
      for (const p of personal()) {
        const contacts = (await p.repo.participants.list()).filter((c) => c.email?.trim().toLowerCase() === email);
        if (contacts.length) out.push({ ownerUid: p.ownerUid, householdId: p.householdId, contacts });
      }
      return out;
    },
  };
}

export function createMemoryAccountDirectory(accounts: { uid: string; email: string; displayName: string; verified: boolean }[]): AccountDirectory {
  return { async findVerifiedByEmail(email) { const a = accounts.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.verified); return a ? { uid: a.uid, email: a.email, displayName: a.displayName } : null; } };
}

/** A household store view over the link spaces, so `listMembers` works for them in tests. */
export function withLinkSpaces(base: HouseholdStore, households: Map<string, { household: Household; members: Member[] }>): HouseholdStore {
  return {
    ...base,
    async getHousehold(id) { return households.get(id)?.household ?? base.getHousehold(id); },
    async listMembers(id) { return households.get(id)?.members ?? base.listMembers(id); },
  };
}
