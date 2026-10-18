import type { Household, HouseholdStore, Invite, Member } from "./types";

/** In-memory store for tests. Mirrors the atomicity the Firestore implementation provides. */
export function createMemoryHouseholdStore(): HouseholdStore & { dump(): { households: Household[]; invites: Invite[] } } {
  const households = new Map<string, Household>();
  const members = new Map<string, Map<string, Member>>();
  const userHousehold = new Map<string, string>();
  const invites = new Map<string, Invite>();
  return {
    async getUserHouseholdId(uid) { return userHousehold.get(uid) ?? null; },
    async getHousehold(id) { return households.get(id) ?? null; },
    async listMembers(hid) { return [...(members.get(hid)?.values() ?? [])]; },
    async createHousehold(h, owner) { households.set(h.id, h); members.set(h.id, new Map([[owner.uid, owner]])); userHousehold.set(owner.uid, h.id); },
    async listInvites(hid) { return [...invites.values()].filter((i) => i.householdId === hid); },
    async getInvite(hash) { return invites.get(hash) ?? null; },
    async putInvite(i) { invites.set(i.hash, i); },
    async deleteInvite(hash) { invites.delete(hash); },
    async acceptInvite(hash, member, usedAt) {
      const inv = invites.get(hash);
      if (!inv || inv.usedAt) return false;
      invites.set(hash, { ...inv, usedAt });
      members.get(inv.householdId)!.set(member.uid, member);
      userHousehold.set(member.uid, inv.householdId);
      return true;
    },
    async removeMember(hid, uid) { members.get(hid)?.delete(uid); userHousehold.delete(uid); },
    dump: () => ({ households: [...households.values()], invites: [...invites.values()] }),
  };
}
