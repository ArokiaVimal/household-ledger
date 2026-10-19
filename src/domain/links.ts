// Linking a Friends & Family contact to a real account. Pure rules: no I/O, no Firebase. The server does the reads and writes.
// See docs/FRIENDS_FAMILY_LINKING.md. Nothing here ever changes the owner's ledger; a link only decides what a redacted,
// pair-scoped copy contains and when it may exist.
import { matchAccount, normalizeEmail } from "./contacts";
import { validateSplit } from "./splits";
import type { ExpenseRecord, Participant, Settlement, SharedExpense, SplitConfig } from "./types";

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
  /** 2 = shared terms carry the full expense (revision 2). Older copies are upgraded once, on the owner's next sign-in. */
  schema?: number;
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

// ---- what a link shares: the full expense, two-way editable (docs/FRIENDS_FAMILY_LINKING.md section 8) ----

const SHAREABLE = new Set<ExpenseRecord["kind"]>(["purchase", "refund", "fee"]);

/** The origin owner's side of a link: who they are, which contact is the linked person, and who that person is. */
export interface LinkContext {
  /** The owner's own participant id and the linked contact's id, both in the owner's personal space. */
  meId: string;
  contactId: string;
  ownerUid: string;
  /** The linked account. */
  otherUid: string;
}

/** Id of a person inside the shared terms: the two linked people are always `u_<uid>`; everyone else keeps the owner's id. */
export const toSharedId = (ctx: LinkContext, id: string) => (id === ctx.meId ? linkParticipantId(ctx.ownerUid) : id === ctx.contactId ? linkParticipantId(ctx.otherUid) : id);
/** The way back, into the origin owner's ledger. */
export const fromSharedId = (ctx: LinkContext, id: string) => (id === linkParticipantId(ctx.ownerUid) ? ctx.meId : id === linkParticipantId(ctx.otherUid) ? ctx.contactId : id);

const mapSplit = (s: SplitConfig, f: (id: string) => string): SplitConfig => ({
  ...s,
  participantIds: s.participantIds.map(f),
  ...(s.values ? { values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [f(k), v])) } : {}),
  ...(s.items ? { items: s.items.map((i) => ({ ...i, participantIds: i.participantIds.map(f) })) } : {}),
});

const peopleIn = (payerId: string, split: SplitConfig): Set<string> => new Set([payerId, ...split.participantIds, ...(split.items ?? []).flatMap((i) => i.participantIds)]);

/** Both linked people take part in the expense (as payer or in the split). That is what makes it theirs to share. */
export function involvesBoth(r: Pick<ExpenseRecord, "payerId" | "split">, ctx: LinkContext): boolean {
  const ids = peopleIn(r.payerId, r.split);
  return ids.has(ctx.meId) && ids.has(ctx.contactId);
}

export type LinkSharePlan = { action: "share" } | { action: "withdraw" };

/**
 * Whether a record is shared with the linked person: reviewed, not excluded, spending-like, a real split, and both of you are in it.
 * Anything else is withdrawn (the caller voids the shared terms only if they exist). Income, transfers and card-bill payments never.
 */
export function planLinkShare(r: ExpenseRecord, ctx: LinkContext): LinkSharePlan {
  const eligible = r.status === "reviewed" && !r.excluded && SHAREABLE.has(r.kind) && r.split.mode !== "personal" && involvesBoth(r, ctx);
  return { action: eligible ? "share" : "withdraw" };
}

/**
 * The shared terms of a record: merchant, date, amount, category, payer, the FULL split (other people by name only) and the note if
 * the owner opted in. No bank text, account, card, import details or receipts. `version` is the next number to store.
 */
export function buildLinkShared(r: ExpenseRecord, ctx: LinkContext, o: { categoryName: string; names: Record<string, string>; now: string; version: number; createdAt?: string }): SharedExpense {
  const split = mapSplit(r.split, (id) => toSharedId(ctx, id));
  const payerId = toSharedId(ctx, r.payerId);
  const me = linkParticipantId(ctx.ownerUid), other = linkParticipantId(ctx.otherUid);
  const people = Object.fromEntries([...peopleIn(payerId, split)].filter((id) => id !== me && id !== other).map((id) => [id, (o.names[id] ?? "Someone").slice(0, 80)]));
  return {
    id: r.id, ownerUid: ctx.ownerUid, payerId, date: r.date, merchant: r.merchant, amountPaise: r.amountPaise, kind: r.kind as SharedExpense["kind"], categoryId: r.categoryId, categoryName: o.categoryName, split,
    ...(r.shareNote && r.notes ? { note: r.notes.slice(0, 500) } : {}), ...(Object.keys(people).length ? { people } : {}),
    version: o.version, createdAt: o.createdAt ?? o.now, updatedAt: o.now,
  };
}

/** The fields either person may change, as the log shows them. */
export const SHARED_FIELDS = ["merchant", "date", "amountPaise", "categoryName", "payerId", "split", "note"] as const;
export type SharedField = (typeof SHARED_FIELDS)[number];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between two versions of the shared terms (absent = null), or null when nothing did. This is the log's before and after. */
export function sharedDiff(prev: SharedExpense | null, next: SharedExpense): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const k of SHARED_FIELDS) {
    const x = prev ? (prev as unknown as Record<string, unknown>)[k] : undefined, y = (next as unknown as Record<string, unknown>)[k];
    if (!same(x, y)) { before[k] = x ?? null; after[k] = y ?? null; }
  }
  return Object.keys(after).length ? { before, after } : null;
}

export interface SharedPatch { merchant?: string; date?: string; amountPaise?: number; categoryName?: string; payerId?: string; split?: SplitConfig; note?: string | null }

/**
 * First problem with an edit to shared terms, or null. Either linked person may change merchant, category, payer, split and (if the
 * owner shares it) the note. Amount and date are the bank's for an imported row. Nobody can add or drop a third person, and both of
 * you stay in the expense (removing it is the owner's withdrawal).
 */
export function checkSharedEdit(cur: SharedExpense, patch: SharedPatch, o: { canEditBankFields: boolean; noteShared: boolean; ownerUid: string; otherUid: string }): string | null {
  if (cur.voided) return "That expense was withdrawn, so it cannot be edited.";
  if (Object.keys(patch).length === 0) return "Nothing to change.";
  if (patch.merchant !== undefined && (!patch.merchant.trim() || patch.merchant.length > 120)) return "Enter a merchant (up to 120 characters).";
  if (patch.categoryName !== undefined && (!patch.categoryName.trim() || patch.categoryName.length > 60)) return "Choose a category.";
  if ((patch.amountPaise !== undefined || patch.date !== undefined) && !o.canEditBankFields) return "The amount and date come from the bank statement, so only the other details can be changed here.";
  if (patch.amountPaise !== undefined && (!Number.isSafeInteger(patch.amountPaise) || patch.amountPaise <= 0)) return "Enter a valid amount.";
  if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) return "Enter a valid date.";
  if (patch.note !== undefined && !o.noteShared) return "The owner has not chosen to show the note, so it cannot be edited here.";
  if (patch.note != null && patch.note.length > 500) return "Keep the note under 500 characters.";
  const amount = patch.amountPaise ?? cur.amountPaise;
  const split = patch.split ?? cur.split;
  const payer = patch.payerId ?? cur.payerId;
  if (split.mode === "personal") return "A shared expense is split with someone else.";
  const known = peopleIn(cur.payerId, cur.split);
  const a = linkParticipantId(o.ownerUid), b = linkParticipantId(o.otherUid);
  known.add(a); known.add(b);
  const now = peopleIn(payer, split);
  if ([...now].some((id) => !known.has(id))) return "You can only split between the people already in this expense.";
  if (!now.has(a) || !now.has(b)) return "Both of you have to stay in this expense. To remove it, ask the person who added it to withdraw it.";
  const bad = validateSplit(amount, split);
  if (bad) return bad;
  return null;
}

/** The edited shared terms: version +1, newest timestamp. A date or amount change also keeps other people's names. */
export function applySharedPatch(cur: SharedExpense, patch: SharedPatch, now: string): SharedExpense {
  const { note, ...rest } = patch;
  const next: SharedExpense = { ...cur, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), version: (cur.version ?? 0) + 1, updatedAt: now };
  if (note !== undefined) { if (note === null || note === "") delete next.note; else next.note = note; }
  return next;
}

/** Writes a shared edit through to the origin owner's record: only the shared fields, mapped back to the owner's ids. `categoryId` is already resolved by the caller. */
export function recordFromShared(rec: ExpenseRecord, next: SharedExpense, ctx: LinkContext, o: { categoryId: string; canEditBankFields: boolean }): ExpenseRecord {
  const out: ExpenseRecord = { ...rec, merchant: next.merchant, categoryId: o.categoryId, payerId: fromSharedId(ctx, next.payerId), split: mapSplit(next.split, (id) => fromSharedId(ctx, id)) };
  if (o.canEditBankFields) { out.date = next.date; out.amountPaise = next.amountPaise; }
  if (rec.shareNote) { if (next.note) out.notes = next.note; else delete out.notes; }
  return out;
}

/** A settlement as the link space stores it: only between exactly the owner and the linked contact. Your note and the payments list stay private; a note only travels when it is written in the link itself. */
export function planLinkSettlement(s: Settlement, ctx: LinkContext): Settlement | null {
  const ids = [s.fromId, s.toId];
  if (!ids.includes(ctx.meId) || !ids.includes(ctx.contactId)) return null;
  return { id: s.id, date: s.date, fromId: toSharedId(ctx, s.fromId), toId: toSharedId(ctx, s.toId), amountPaise: s.amountPaise, ...(s.voided ? { voided: true } : {}) };
}

/** A settlement from the link space, as one owner's ledger stores it. It only ever reduces a balance; it never creates an expense. */
export function settlementToOwner(s: Settlement, ctx: LinkContext): Settlement {
  return { id: s.id, date: s.date, fromId: fromSharedId(ctx, s.fromId), toId: fromSharedId(ctx, s.toId), amountPaise: s.amountPaise, ...(s.note ? { note: s.note } : {}), ...(s.voided ? { voided: true } : {}) };
}
