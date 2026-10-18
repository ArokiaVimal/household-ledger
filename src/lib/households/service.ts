// Household use cases. Authorization (who may do what) is decided here, on the server,
// against the store, never from anything the browser claims.
import { INVITE_TTL_MS, MAX_MEMBERS, canManageMembers, checkInvite, formatInviteCode, isPlausibleInviteCode, isValidEmail, normalizeInviteCode } from "./logic";
import { HouseholdError, type Actor, type HouseholdStore, type Invite, type InviteOffer, type Member, type Membership } from "./types";

export interface Deps {
  now: () => number;
  randomBytes: (n: number) => Uint8Array;
  /** SHA-256 hex of the normalised code. */
  hash: (normalisedCode: string) => string;
  newId: () => string;
}

const iso = (ms: number) => new Date(ms).toISOString();
const JOIN_FAILED = "That invite code did not work. Check the code, that it was issued for this email, and that it has not expired.";

export async function getMembership(store: HouseholdStore, uid: string): Promise<Membership | null> {
  const hid = await store.getUserHouseholdId(uid);
  if (!hid) return null;
  const [household, members] = await Promise.all([store.getHousehold(hid), store.listMembers(hid)]);
  const me = members.find((m) => m.uid === uid);
  if (!household || !me) return null; // user doc points at a household they are not in: treat as none
  const invites = me.role === "owner" ? (await store.listInvites(hid)).filter((i) => !i.usedAt).map(({ hash, email, expiresAt }) => ({ hash, email, expiresAt })) : [];
  return { household, role: me.role, members, invites };
}

export async function createHousehold(store: HouseholdStore, actor: Actor, name: string, d: Deps): Promise<void> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) throw new HouseholdError("invalid", "Enter a household name (1 to 60 characters).");
  if (await store.getUserHouseholdId(actor.uid)) throw new HouseholdError("conflict", "You already belong to a household.");
  const at = iso(d.now());
  const id = d.newId();
  await store.createHousehold(
    { id, name: clean, ownerUid: actor.uid, createdAt: at },
    { uid: actor.uid, email: actor.email, displayName: actor.name, role: "owner", joinedAt: at },
  );
}

async function requireOwner(store: HouseholdStore, actor: Actor) {
  const m = await getMembership(store, actor.uid);
  if (!m) throw new HouseholdError("forbidden", "Create or join a household first.");
  if (!canManageMembers(m.role)) throw new HouseholdError("forbidden", "Only the household owner can do that.");
  return m;
}

/** Returns the plaintext code exactly once. Only its hash is stored. */
export async function createInvite(store: HouseholdStore, actor: Actor, email: string, d: Deps): Promise<{ code: string; expiresAt: string }> {
  const m = await requireOwner(store, actor);
  if (!isValidEmail(email)) throw new HouseholdError("invalid", "Enter a valid email address.");
  const target = email.trim().toLowerCase();
  if (m.members.some((x) => x.email.toLowerCase() === target)) throw new HouseholdError("conflict", "That person is already a member.");
  if (m.members.length + m.invites.length >= MAX_MEMBERS) throw new HouseholdError("limit", `A household can have at most ${MAX_MEMBERS} members including pending invites.`);
  const code = formatInviteCode(d.randomBytes(24));
  const invite: Invite = { hash: d.hash(normalizeInviteCode(code)), householdId: m.household.id, email: target, createdBy: actor.uid, createdAt: iso(d.now()), expiresAt: iso(d.now() + INVITE_TTL_MS) };
  await store.putInvite(invite);
  return { code, expiresAt: invite.expiresAt };
}

export async function revokeInvite(store: HouseholdStore, actor: Actor, hash: string): Promise<void> {
  const m = await requireOwner(store, actor);
  const inv = await store.getInvite(hash);
  if (!inv || inv.householdId !== m.household.id) throw new HouseholdError("forbidden", "Invite not found.");
  await store.deleteInvite(hash);
}

/** Every failure returns the same message so codes cannot be probed. */
export async function joinHousehold(store: HouseholdStore, actor: Actor, code: string, d: Deps): Promise<void> {
  if (await store.getUserHouseholdId(actor.uid)) throw new HouseholdError("conflict", "You already belong to a household.");
  if (!isPlausibleInviteCode(code)) throw new HouseholdError("invalid", JOIN_FAILED);
  const hash = d.hash(normalizeInviteCode(code));
  const invite = await store.getInvite(hash);
  if (!checkInvite(invite, { email: actor.email }, d.now()).ok || !invite) throw new HouseholdError("invalid", JOIN_FAILED);
  const members = await store.listMembers(invite.householdId);
  if (members.length >= MAX_MEMBERS) throw new HouseholdError("limit", "This household is full.");
  const at = iso(d.now());
  const member: Member = { uid: actor.uid, email: actor.email, displayName: actor.name, role: "member", joinedAt: at };
  if (!(await store.acceptInvite(hash, member, at))) throw new HouseholdError("invalid", JOIN_FAILED); // lost a race: already used
}

export async function removeMember(store: HouseholdStore, actor: Actor, uid: string): Promise<void> {
  const m = await requireOwner(store, actor);
  const target = m.members.find((x) => x.uid === uid);
  if (!target) throw new HouseholdError("forbidden", "Member not found.");
  if (target.role === "owner") throw new HouseholdError("conflict", "The owner cannot be removed.");
  await store.removeMember(m.household.id, uid);
}

/** The first word of a display name, for naming a personal space. */
const firstWord = (name: string) => name.trim().split(/\s+/)[0] || "My";

/** Pending (unused, unexpired) invitations addressed to this email, newest first, with who sent each. */
export async function pendingInvitesFor(store: HouseholdStore, email: string, d: Pick<Deps, "now">): Promise<InviteOffer[]> {
  const found = (await store.findInvitesByEmail(email.trim().toLowerCase())).filter((i) => checkInvite(i, { email }, d.now()).ok);
  const offers: InviteOffer[] = [];
  for (const i of found.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const owner = (await store.listMembers(i.householdId)).find((m) => m.role === "owner");
    offers.push({ hash: i.hash, householdId: i.householdId, inviterName: owner?.displayName || "Someone", expiresAt: i.expiresAt });
  }
  return offers;
}

/**
 * What to do the first time someone signs in. The app is personal first: with no invitation waiting, a private space
 * is created automatically (no "create a household" step). With an invitation addressed to their email they are asked
 * whether to join it instead. Safe to call on every load, and safe if two loads race.
 */
export async function firstRun(store: HouseholdStore, actor: Actor, d: Deps): Promise<{ kind: "ready" } | { kind: "invited"; offers: InviteOffer[] }> {
  if (await store.getUserHouseholdId(actor.uid)) return { kind: "ready" };
  const offers = await pendingInvitesFor(store, actor.email, d);
  if (offers.length > 0) return { kind: "invited", offers };
  await startPersonalSpace(store, actor, d);
  return { kind: "ready" };
}

/** Creates the user's own space. A parallel call that lost the race is not an error. */
export async function startPersonalSpace(store: HouseholdStore, actor: Actor, d: Deps): Promise<void> {
  try {
    await createHousehold(store, actor, `${firstWord(actor.name)}'s finances`, d);
  } catch (e) {
    if (!(e instanceof HouseholdError && e.code === "conflict")) throw e;
  }
}

/**
 * Accepts an invitation addressed to the signed-in user's email, with no code: the verified sign-in email is the proof.
 * `ownSpaceIsEmpty` says whether the user's current private space holds no data; an empty one is dropped so they can
 * join. If it holds data, joining is refused (their data would be hidden) rather than silently discarded.
 */
export async function acceptInviteByEmail(store: HouseholdStore, actor: Actor, hash: string, d: Deps, ownSpace: { householdId: string; isEmpty: boolean } | null): Promise<void> {
  const invite = await store.getInvite(hash);
  if (!checkInvite(invite, { email: actor.email }, d.now()).ok || !invite) throw new HouseholdError("invalid", "That invitation is no longer valid.");
  if (ownSpace) {
    const members = await store.listMembers(ownSpace.householdId);
    const onlyMe = members.length === 1 && members[0].uid === actor.uid;
    if (!onlyMe || !ownSpace.isEmpty) throw new HouseholdError("conflict", "You already have your own data here. Joining would hide it, so it was not changed.");
    if (ownSpace.householdId === invite.householdId) throw new HouseholdError("conflict", "You are already in that space.");
    await store.deleteHousehold(ownSpace.householdId);
  }
  if ((await store.listMembers(invite.householdId)).length >= MAX_MEMBERS) throw new HouseholdError("limit", "That space is full.");
  const at = new Date(d.now()).toISOString();
  const member: Member = { uid: actor.uid, email: actor.email, displayName: actor.name, role: "member", joinedAt: at };
  if (!(await store.acceptInvite(hash, member, at))) throw new HouseholdError("invalid", "That invitation is no longer valid.");
}
