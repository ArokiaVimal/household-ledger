// Persistence contracts for account linking. Implemented in memory (tests) and Firestore (app). See docs/FRIENDS_FAMILY_LINKING.md.
import type { ContactLink, OwnerContacts } from "@/domain/links";
import type { Household, Member } from "@/lib/households/types";

export interface LinkStore {
  getPair(key: string): Promise<ContactLink | null>;
  /** Every link this account is part of. */
  listForUser(uid: string): Promise<ContactLink[]>;
  putPair(link: ContactLink): Promise<void>;
  deletePair(key: string): Promise<void>;
  /** Creates the link space (`kind: "link"`) with both members. Idempotent for the same id. */
  createLinkSpace(space: Household, members: Member[]): Promise<void>;
  /** Removes the link space and everything in it. The copies in it are mirrors; the originals live in the owners' own spaces. */
  deleteLinkSpace(spaceId: string): Promise<void>;
}

/** Finds contacts that hold an email, across other people's PERSONAL spaces only. */
export interface ContactIndex {
  findContactsByEmail(email: string): Promise<OwnerContacts[]>;
}

/** Looks an account up by email with Firebase Auth as the source of truth for "verified". Never answers for an unverified email. */
export interface AccountDirectory {
  findVerifiedByEmail(email: string): Promise<{ uid: string; email: string; displayName: string } | null>;
}

export class LinkError extends Error {
  constructor(public code: "forbidden" | "invalid" | "conflict" | "not_found", message: string) { super(message); }
}
