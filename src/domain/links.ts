// Linking a Friends & Family contact to a real account. Pure rules: no I/O, no Firebase. The server does the reads and writes.
// See docs/FRIENDS_FAMILY_LINKING.md. Nothing here ever changes the owner's ledger; a link only decides what a redacted,
// pair-scoped copy contains and when it may exist.
import { matchAccount, normalizeEmail } from "./contacts";
import { computeShares } from "./splits";
import type { ExpenseRecord, Participant, Settlement, SharedExpense } from "./types";

export type LinkStatus = "proposed" | "active" | "declined" | "ended";

/** One owner's half of a link: "my contact matched that account". */
export interface LinkSide {
  /** The owner's personal space. */
  householdId: string;
  /** Contacts that held the matching email. More than one is a conflict the owner resolves. */
  contactIds: string[];
  /** The contact the owner chose (set on confirm). */
  contactId?: string;
  /** The verified email that matched, lower-case. */
  email: string;
  status: LinkStatus;
  proposedAt: string;
  confirmedAt?: string;
  endedAt?: string;
  endedBy?: string;
}

/** `contactLinks/{pairKey}`: one document per pair of accounts, so a pair can never be linked twice. */
export interface ContactLink {
  id: string;
  uids: [string, string];
  /** The link space (`households/{spaceId}`, kind "link"). Created on the first confirmation. */
  spaceId?: string;
  sides: Record<string, LinkSide>;
  createdAt: string;
  updatedAt: string;
}

/** Same key whichever way round the two accounts are given. */
export const pairKey = (a: string, b: string) => [a, b].sort().join("__");
/** The other account of a pair. */
export const otherUid = (link: Pick<ContactLink, "uids">, me: string) => (link.uids[0] === me ? link.uids[1] : link.uids[0]);
/** Participant id of an account inside any shared space. */
export const linkParticipantId = (uid: string) => `u_${uid}`;

/** What the signed-in account is allowed to be matched on. `emailVerified` comes from the verified session, never the request. */
export interface AccountIdentity { uid: string; email: string | null | undefined; emailVerified: boolean }

/** Contacts of one owner (in their personal space) that hold the account's email. */
export interface OwnerContacts { ownerUid: string; householdId: string; contacts: Participant[] }

export interface Proposal {
  ownerUid: string;
  householdId: string;
  contactIds: string[];
  email: string;
  /** More than one of the owner's contacts holds the email: the owner has to choose, nothing is picked for them. */
  conflict: boolean;
}

/**
 * Which owners should be asked to link this account. Only a VERIFIED email matches, only the account's own email, only contacts
 * not already linked. Never the owner's own account. A pair that already has an active, proposed or declined side from this
 * owner is not proposed again (duplicates and "no" are respected). Active couple partners are already linked another way.
 */
export function proposalsFor(account: AccountIdentity, found: OwnerContacts[], existing: Record<string, ContactLink>, isCouplePartner: (ownerUid: string) => boolean = () => false): Proposal[] {
  if (!account.emailVerified || !account.email) return [];
  const email = normalizeEmail(account.email);
  const out: Proposal[] = [];
  for (const f of found) {
    if (f.ownerUid === account.uid || isCouplePartner(f.ownerUid)) continue;
    const side = existing[pairKey(f.ownerUid, account.uid)]?.sides[f.ownerUid];
    if (side && side.status !== "ended") continue;
    const m = matchAccount(f.contacts, { email: account.email, emailVerified: true });
    if (m.status === "unique") out.push({ ownerUid: f.ownerUid, householdId: f.householdId, contactIds: [m.contact.id], email, conflict: false });
    else if (m.status === "conflict") out.push({ ownerUid: f.ownerUid, householdId: f.householdId, contactIds: m.contacts.map((c) => c.id), email, conflict: true });
  }
  return out;
}

/** The contact the owner may pick on confirm: must be one the server stored, never a client-supplied id. */
export function chooseContact(side: Pick<LinkSide, "contactIds">, picked: string | undefined): string | null {
  if (side.contactIds.length === 1) return side.contactIds[0];
  return picked && side.contactIds.includes(picked) ? picked : null;
}

// ---- what a link mirrors ----

const SHAREABLE = new Set<ExpenseRecord["kind"]>(["purchase", "refund", "fee"]);

export interface LinkContext {
  /** The owner's own participant id and the linked contact's id, both in the owner's personal space. */
  meId: string;
  contactId: string;
  ownerUid: string;
  /** The linked account. */
  otherUid: string;
}

export type LinkSharePlan = { action: "share"; copy: Pick<SharedExpense, "payerId" | "amountPaise" | "split"> } | { action: "withdraw" } | { action: "none" };

/**
 * What the linked person may see of a record, if anything. They see only the part between the two of you: who paid and each
 * person's share. Other people in the split, bank text, accounts and notes never leave your space.
 */
export function planLinkShare(r: ExpenseRecord, ctx: LinkContext): LinkSharePlan {
  const eligible = r.status === "reviewed" && !r.excluded && SHAREABLE.has(r.kind) && r.split.mode !== "personal"
    && r.split.participantIds.includes(ctx.contactId) && (r.payerId === ctx.meId || r.payerId === ctx.contactId);
  if (!eligible) return { action: "withdraw" }; // the caller withdraws only if a copy exists
  let shares: Record<string, number>;
  try { shares = computeShares(r.amountPaise, r.split); } catch { return { action: "withdraw" }; }
  const mine = shares[ctx.meId] ?? 0;
  const theirs = shares[ctx.contactId] ?? 0;
  if (theirs === 0 || mine + theirs === 0) return { action: "withdraw" };
  const a = linkParticipantId(ctx.ownerUid);
  const b = linkParticipantId(ctx.otherUid);
  const values: Record<string, number> = { [b]: theirs, ...(mine > 0 ? { [a]: mine } : {}) };
  return { action: "share", copy: { payerId: r.payerId === ctx.meId ? a : b, amountPaise: mine + theirs, split: { mode: "custom", participantIds: Object.keys(values), values } } };
}

/** The pair-scoped copy. No note, ever: a link never carries the owner's notes. */
export function buildLinkShared(r: ExpenseRecord, copy: Pick<SharedExpense, "payerId" | "amountPaise" | "split">, o: { ownerUid: string; categoryName: string; now: string; createdAt?: string }): SharedExpense {
  return { id: r.id, ownerUid: o.ownerUid, payerId: copy.payerId, date: r.date, merchant: r.merchant, amountPaise: copy.amountPaise, kind: r.kind as SharedExpense["kind"], categoryId: r.categoryId, categoryName: o.categoryName, split: copy.split, createdAt: o.createdAt ?? o.now, updatedAt: o.now };
}

/** A settlement is mirrored only when it is between exactly the owner and the linked contact. Amount, date, direction: no note, no payments list. */
export function planLinkSettlement(s: Settlement, ctx: LinkContext): Settlement | null {
  const ids = [s.fromId, s.toId];
  if (!ids.includes(ctx.meId) || !ids.includes(ctx.contactId)) return null;
  const map = (id: string) => (id === ctx.meId ? linkParticipantId(ctx.ownerUid) : linkParticipantId(ctx.otherUid));
  return { id: s.id, date: s.date, fromId: map(s.fromId), toId: map(s.toId), amountPaise: s.amountPaise, ...(s.voided ? { voided: true } : {}) };
}
