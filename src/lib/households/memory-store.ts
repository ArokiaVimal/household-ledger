import { HouseholdError, type Household, type HouseholdStore, type Invite, type Member } from "./types";

/** In-memory store for tests. Mirrors the atomicity the Firestore implementation provides. */
export function createMemoryHouseholdStore(): HouseholdStore & { dump(): { households: Household[]; invites: Invite[] } } {
  const households = new Map<string, Household>();
  const members = new Map<string, Map<string, Member>>();
  const userHousehold = new Map<string, string>();
  const invites = new Map<string, Invite>();
  const userCouple = new Map<string, string>();
  return {
    async getUserHouseholdId(uid) { return userHousehold.get(uid) ?? null; },
    async getHousehold(id) { return households.get(id) ?? null; },
    async listMembers(hid) { return [...(members.get(hid)?.values() ?? [])]; },
    async createHousehold(h, owner) { if (userHousehold.has(owner.uid)) throw new HouseholdError("conflict", "You already belong to a household."); households.set(h.id, h); members.set(h.id, new Map([[owner.uid, owner]])); userHousehold.set(owner.uid, h.id); },
    async listInvites(hid) { return [...invites.values()].filter((i) => i.householdId === hid); },
    async findInvitesByEmail(email) { return [...invites.values()].filter((i) => i.email === email); },
    async getInvite(hash) { return invites.get(hash) ?? null; },
    async putInvite(i) { invites.set(i.hash, i); },
    async deleteInvite(hash) { invites.delete(hash); },
    async removeMember(hid, uid) { members.get(hid)?.delete(uid); userHousehold.delete(uid); },
    async deleteHousehold(hid) {
      for (const uid of members.get(hid)?.keys() ?? []) userHousehold.delete(uid);
      members.delete(hid); households.delete(hid);
      for (const [k, i] of invites) if (i.householdId === hid) invites.delete(k);
    },
    async getUserCoupleId(uid) { return userCouple.get(uid) ?? null; },
    async createCoupleFromInvite(hash, usedAt, couple, pair) {
      const inv = invites.get(hash);
      if (!inv || inv.usedAt) return false;
      for (const m of pair) { const cur = userCouple.get(m.uid); if (cur && !households.get(cur)?.endedAt) return false; }
      invites.set(hash, { ...inv, usedAt });
      households.set(couple.id, couple);
      members.set(couple.id, new Map(pair.map((m) => [m.uid, m])));
      for (const m of pair) userCouple.set(m.uid, couple.id);
      return true;
    },
    async updateHousehold(id, patch) { const h = households.get(id); if (h) households.set(id, { ...h, ...patch }); },
    dump: () => ({ households: [...households.values()], invites: [...invites.values()] }),
  };
}
