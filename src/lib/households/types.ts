export type Role = "owner" | "member";

export interface Household { id: string; name: string; ownerUid: string; createdAt: string }
export interface Member { uid: string; email: string; displayName: string; role: Role; joinedAt: string }

/** Invite document id is the SHA-256 of the code, so the plaintext code is never stored. */
export interface Invite { hash: string; householdId: string; email: string; createdBy: string; createdAt: string; expiresAt: string; usedAt?: string }

export interface Actor { uid: string; email: string; name: string }

/** A pending invitation addressed to the signed-in user's email, with who sent it. */
export interface InviteOffer { hash: string; householdId: string; inviterName: string; expiresAt: string }

export interface Membership { household: Household; role: Role; members: Member[]; invites: Pick<Invite, "hash" | "email" | "expiresAt">[] }

/** Persistence contract used by the household service. Implemented in memory (tests) and Firestore (app). */
export interface HouseholdStore {
  getUserHouseholdId(uid: string): Promise<string | null>;
  getHousehold(id: string): Promise<Household | null>;
  listMembers(householdId: string): Promise<Member[]>;
  /** Creates the household, its owner member and the user's link, all or nothing. Throws HouseholdError("conflict") if the owner already has a household (atomic, so two parallel first loads cannot create two). */
  createHousehold(h: Household, owner: Member): Promise<void>;
  listInvites(householdId: string): Promise<Invite[]>;
  /** Invites addressed to this (lower-case) email, used or not. */
  findInvitesByEmail(email: string): Promise<Invite[]>;
  getInvite(hash: string): Promise<Invite | null>;
  putInvite(i: Invite): Promise<void>;
  deleteInvite(hash: string): Promise<void>;
  /** Atomically marks the invite used (only if still unused) and adds the member + link. Returns false if already used. */
  acceptInvite(hash: string, member: Member, usedAt: string): Promise<boolean>;
  removeMember(householdId: string, uid: string): Promise<void>;
  /** Removes an empty personal space: its household doc, members, invites and the user links. */
  deleteHousehold(householdId: string): Promise<void>;
}

export class HouseholdError extends Error {
  constructor(public code: "forbidden" | "invalid" | "conflict" | "limit", message: string) { super(message); }
}
