// Couple space use cases. Personal first: everyone has a private space; two people may optionally link into a couple
// space that holds only what they choose to share. Authorization is decided here, against the store.
import { checkInvite, isValidEmail } from "./logic";
import { createInvite, getMembership, type Deps } from "./service";
import { HouseholdError, type Actor, type CoupleMembership, type HouseholdStore, type Member, type SplitRatio } from "./types";

/** Until a couple chooses, shared expenses default to an even split and the app asks once. */
export const DEFAULT_RATIO_BPS = 5000;
/** A ratio must leave both people a real share. */
export const isValidRatio = (bps: number) => Number.isInteger(bps) && bps >= 500 && bps <= 9500;

export async function getCouple(store: HouseholdStore, uid: string): Promise<CoupleMembership | null> {
  const cid = await store.getUserCoupleId(uid);
  if (!cid) return null;
  const [household, members] = await Promise.all([store.getHousehold(cid), store.listMembers(cid)]);
  const me = members.find((m) => m.uid === uid);
  if (!household || !me || household.kind !== "couple") return null;
  return { household, members, me, partner: members.find((m) => m.uid !== uid) ?? null, active: !household.endedAt };
}

/** The active couple, or null (none, or one that was unlinked). */
export async function getActiveCouple(store: HouseholdStore, uid: string): Promise<CoupleMembership | null> {
  const c = await getCouple(store, uid);
  return c?.active ? c : null;
}

/** Invites one partner by email. At most one invitation can wait at a time. Returns the one-time code (also usable without it: the email is the proof). */
export async function invitePartner(store: HouseholdStore, actor: Actor, email: string, d: Deps): Promise<{ code: string; expiresAt: string }> {
  if (await getActiveCouple(store, actor.uid)) throw new HouseholdError("conflict", "You are already linked with a partner.");
  if (!isValidEmail(email)) throw new HouseholdError("invalid", "Enter a valid email address.");
  if (email.trim().toLowerCase() === actor.email.trim().toLowerCase()) throw new HouseholdError("invalid", "That is your own email address.");
  const own = await getMembership(store, actor.uid);
  if (!own) throw new HouseholdError("forbidden", "Your space is not set up yet.");
  for (const i of own.invites) if (Date.parse(i.expiresAt) > d.now()) await store.deleteInvite(i.hash); // replace the waiting invitation
  return createInvite(store, actor, email, d);
}

/** Accepts a partner invitation addressed to the signed-in (verified) email. Creates the couple space with both people. */
export async function acceptPartnerInvite(store: HouseholdStore, actor: Actor, hash: string, d: Deps): Promise<void> {
  const invite = await store.getInvite(hash);
  if (!invite || !checkInvite(invite, { email: actor.email }, d.now()).ok) throw new HouseholdError("invalid", "That invitation is no longer valid.");
  const inviter = (await store.listMembers(invite.householdId)).find((m) => m.role === "owner");
  if (!inviter) throw new HouseholdError("invalid", "That invitation is no longer valid.");
  if (inviter.uid === actor.uid) throw new HouseholdError("invalid", "You cannot accept your own invitation.");
  if ((await getActiveCouple(store, actor.uid)) || (await getActiveCouple(store, inviter.uid))) throw new HouseholdError("conflict", "One of you is already linked with a partner. Unlink first.");
  const at = new Date(d.now()).toISOString();
  const me: Member = { uid: actor.uid, email: actor.email, displayName: actor.name, role: "member", joinedAt: at };
  const them: Member = { ...inviter, role: "owner" };
  const couple = { id: d.newId(), name: `${inviter.displayName} & ${actor.name}`.slice(0, 60), ownerUid: inviter.uid, createdAt: at, kind: "couple" as const };
  if (!(await store.createCoupleFromInvite(hash, at, couple, [them, me]))) throw new HouseholdError("conflict", "That invitation could not be used. Ask for a new one.");
}

/** Either partner can set how shared expenses are split by default. */
export async function setSplitRatio(store: HouseholdStore, actor: Actor, ratio: SplitRatio): Promise<void> {
  const c = await getActiveCouple(store, actor.uid);
  if (!c) throw new HouseholdError("forbidden", "Link with a partner first.");
  if (!c.members.some((m) => m.uid === ratio.leaderUid)) throw new HouseholdError("invalid", "Choose one of the two partners.");
  if (!isValidRatio(ratio.leaderBps)) throw new HouseholdError("invalid", "The split must give each person between 5% and 95%.");
  await store.updateHousehold(c.household.id, { splitRatio: { leaderUid: ratio.leaderUid, leaderBps: ratio.leaderBps } });
}

/** Either partner can unlink. The couple space stays readable to both as history; each keeps their own private space untouched. */
export async function unlinkPartner(store: HouseholdStore, actor: Actor, d: Pick<Deps, "now">): Promise<void> {
  const c = await getActiveCouple(store, actor.uid);
  if (!c) throw new HouseholdError("conflict", "You are not linked with a partner.");
  await store.updateHousehold(c.household.id, { endedAt: new Date(d.now()).toISOString(), endedBy: actor.uid });
}
