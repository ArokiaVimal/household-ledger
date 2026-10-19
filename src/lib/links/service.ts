// Account-linking use cases. Authorization is decided here against the stores, from the verified actor, never from the request.
// Rules of the road (docs/FRIENDS_FAMILY_LINKING.md): only a verified email ever matches; the contact owner confirms every link;
// nothing in the owner's ledger is edited; unlinking keeps history and stops sync.
import type { Repository } from "@/data/repository";
import { chooseContact, linkParticipantId, otherUid, pairKey, proposalsFor, type AccountIdentity, type ContactLink, type LinkSide, type LinkStatus, type Proposal } from "@/domain/links";
import { normalizeEmail } from "@/domain/contacts";
import type { Participant, Settlement, SharedExpense } from "@/domain/types";
import { getActiveCouple } from "@/lib/households/couple";
import type { HouseholdStore, Member } from "@/lib/households/types";
import { backfill, type ActionLink } from "./sync";
import { LinkError, type AccountDirectory, type ContactIndex, type LinkStore } from "./types";

export interface LinkDeps {
  store: LinkStore;
  index: ContactIndex;
  accounts: AccountDirectory;
  households: HouseholdStore;
  repoFor: (householdId: string) => Repository;
  now: () => number;
  newId: () => string;
}
export interface LinkActor { uid: string; email: string; name: string }

const iso = (d: LinkDeps) => new Date(d.now()).toISOString();

async function isCouplePartnerOf(d: LinkDeps, ownerUid: string, uid: string): Promise<boolean> {
  return (await getActiveCouple(d.households, ownerUid))?.partner?.uid === uid;
}

async function saveProposals(d: LinkDeps, accountUid: string, proposals: Proposal[]): Promise<number> {
  for (const p of proposals) {
    const key = pairKey(p.ownerUid, accountUid);
    const cur = await d.store.getPair(key);
    const now = iso(d);
    const side: LinkSide = { householdId: p.householdId, contactIds: p.contactIds, email: p.email, status: "proposed", proposedAt: now };
    await d.store.putPair({ id: key, uids: [p.ownerUid, accountUid].sort() as [string, string], ...(cur?.spaceId ? { spaceId: cur.spaceId } : {}), sides: { ...(cur?.sides ?? {}), [p.ownerUid]: side }, createdAt: cur?.createdAt ?? now, updatedAt: now });
  }
  return proposals.length;
}

const existingFor = async (d: LinkDeps, uid: string): Promise<Record<string, ContactLink>> => Object.fromEntries((await d.store.listForUser(uid)).map((l) => [l.id, l]));

/**
 * Account side: after a sign-in with a verified email, find other people's contacts holding it and store a proposal for each
 * owner. Nothing is linked and nothing is shared; the owner has to confirm. Returns how many proposals were stored.
 */
export async function refreshForAccount(d: LinkDeps, account: AccountIdentity): Promise<number> {
  if (!account.emailVerified || !account.email) return 0;
  const found = (await d.index.findContactsByEmail(normalizeEmail(account.email))).filter((f) => f.ownerUid !== account.uid);
  if (found.length === 0) return 0;
  const existing = await existingFor(d, account.uid);
  const partners = new Set<string>();
  for (const f of found) if (await isCouplePartnerOf(d, f.ownerUid, account.uid)) partners.add(f.ownerUid);
  return saveProposals(d, account.uid, proposalsFor(account, found, existing, (o) => partners.has(o)));
}

/**
 * Contact side: the owner just saved a contact with an email (possibly long after the person signed up). Ask the account
 * directory (Firebase Auth, which knows what is verified) and propose only when that account's email is verified.
 */
export async function refreshForContact(d: LinkDeps, owner: { uid: string; householdId: string }, contactId: string): Promise<number> {
  const repo = d.repoFor(owner.householdId);
  const contact = await repo.participants.get(contactId);
  if (!contact?.email || contact.linkId || contact.userId || contact.pendingEmail) return 0;
  const acct = await d.accounts.findVerifiedByEmail(normalizeEmail(contact.email));
  if (!acct || acct.uid === owner.uid) return 0;
  const mine = (await repo.participants.list()).filter((p) => p.email && normalizeEmail(p.email) === normalizeEmail(contact.email!));
  const existing = await existingFor(d, acct.uid);
  const partner = await isCouplePartnerOf(d, owner.uid, acct.uid);
  return saveProposals(d, acct.uid, proposalsFor({ uid: acct.uid, email: acct.email, emailVerified: true }, [{ ownerUid: owner.uid, householdId: owner.householdId, contacts: mine }], existing, () => partner));
}

async function requireSide(d: LinkDeps, actor: LinkActor, key: string, statuses: LinkStatus[]) {
  const link = await d.store.getPair(key);
  const side = link?.sides[actor.uid];
  if (!link || !side || !link.uids.includes(actor.uid)) throw new LinkError("not_found", "That link was not found.");
  if (!statuses.includes(side.status)) throw new LinkError("conflict", "That link has already been dealt with.");
  return { link, side };
}

/** The owner says yes. Re-checks everything now (the email may have changed since the proposal), then mirrors what already qualifies. */
export async function confirmLink(d: LinkDeps, actor: LinkActor, key: string, picked?: string): Promise<{ expenses: number; settlements: number }> {
  const { link, side } = await requireSide(d, actor, key, ["proposed", "active"]);
  const ownSpace = await d.households.getUserHouseholdId(actor.uid);
  if (!ownSpace || ownSpace !== side.householdId) throw new LinkError("forbidden", "That link is not for your space.");
  const contactId = side.status === "active" && side.contactId ? side.contactId : chooseContact(side, picked);
  if (!contactId) throw new LinkError("invalid", "Choose which contact this is.");
  const repo = d.repoFor(side.householdId);
  const contact = await repo.participants.get(contactId);
  if (!contact) throw new LinkError("invalid", "That contact no longer exists.");
  if (contact.linkId && contact.linkId !== key) throw new LinkError("conflict", "That contact is already linked to someone else.");
  const them = otherUid(link, actor.uid);
  // Verified, now: never trust the stored proposal alone.
  const acct = await d.accounts.findVerifiedByEmail(side.email);
  if (!acct || acct.uid !== them) throw new LinkError("conflict", "That account's verified email no longer matches. Check again.");
  if (!contact.email || normalizeEmail(contact.email) !== side.email) throw new LinkError("conflict", `The email saved for ${contact.name} has changed. Check again.`);
  if (await isCouplePartnerOf(d, actor.uid, them)) throw new LinkError("conflict", "You are already linked as partners.");

  const now = iso(d);
  const spaceId = link.spaceId ?? d.newId();
  if (!link.spaceId) {
    const mine: Member = { uid: actor.uid, email: actor.email, displayName: actor.name, role: "owner", joinedAt: now };
    const theirs: Member = { uid: acct.uid, email: acct.email, displayName: acct.displayName || "Friend", role: "member", joinedAt: now };
    await d.store.createLinkSpace({ id: spaceId, name: `${actor.name} & ${theirs.displayName}`.slice(0, 60), ownerUid: actor.uid, createdAt: now, kind: "link" }, [mine, theirs]);
  }
  const next: ContactLink = { ...link, spaceId, updatedAt: now, sides: { ...link.sides, [actor.uid]: { ...side, status: "active", contactId, confirmedAt: side.confirmedAt ?? now } } };
  await d.store.putPair(next);
  if (contact.linkId !== key) await repo.participants.put({ ...contact, linkId: key });
  const ctx = { meId: linkParticipantId(actor.uid), contactId, ownerUid: actor.uid, otherUid: them };
  return backfill(repo, { key, ctx, repo: d.repoFor(spaceId) });
}

/** "Not now / no": the contact stays a plain contact and this pair is not proposed again. */
export async function declineLink(d: LinkDeps, actor: LinkActor, key: string): Promise<void> {
  const { link, side } = await requireSide(d, actor, key, ["proposed"]);
  await d.store.putPair({ ...link, updatedAt: iso(d), sides: { ...link.sides, [actor.uid]: { ...side, status: "declined" } } });
}

/**
 * Either person can unlink. Every side ends, so sync stops in both directions. The link space and its copies stay readable
 * (history); each owner's ledger is untouched; the contacts stay and lose only their `linkId`.
 */
export async function unlink(d: LinkDeps, actor: LinkActor, key: string): Promise<void> {
  const link = await d.store.getPair(key);
  if (!link || !link.uids.includes(actor.uid)) throw new LinkError("not_found", "That link was not found.");
  const now = iso(d);
  const sides: Record<string, LinkSide> = {};
  for (const [uid, s] of Object.entries(link.sides)) {
    sides[uid] = s.status === "active" || s.status === "proposed" ? { ...s, status: "ended", endedAt: now, endedBy: actor.uid } : s;
    await clearContactLink(d, s, key);
  }
  await d.store.putPair({ ...link, sides, updatedAt: now });
}

async function clearContactLink(d: LinkDeps, s: LinkSide, key: string): Promise<void> {
  if (!s.contactId) return;
  const repo = d.repoFor(s.householdId);
  const c = await repo.participants.get(s.contactId);
  if (c?.linkId === key) { const { linkId: _gone, ...rest } = c; void _gone; await repo.participants.put(rest); }
}

/**
 * Account deletion: the person's link spaces hold only copies, so they go with the account. Originals stay in each owner's own
 * space and the other person's contact (and all their history) stays, just no longer linked.
 */
export async function removeAccountLinks(d: LinkDeps, uid: string): Promise<number> {
  const links = await d.store.listForUser(uid);
  for (const l of links) {
    for (const s of Object.values(l.sides)) await clearContactLink(d, s, l.id);
    if (l.spaceId) await d.store.deleteLinkSpace(l.spaceId);
    await d.store.deletePair(l.id);
  }
  return links.length;
}

/** Active links as the owner's write actions need them (to mirror new and edited expenses automatically). */
export async function activeLinksFor(d: LinkDeps, uid: string): Promise<ActionLink[]> {
  const out: ActionLink[] = [];
  for (const l of await d.store.listForUser(uid)) {
    const s = l.sides[uid];
    if (!l.spaceId || s?.status !== "active" || !s.contactId) continue;
    out.push({ key: l.id, ctx: { meId: linkParticipantId(uid), contactId: s.contactId, ownerUid: uid, otherUid: otherUid(l, uid) }, repo: d.repoFor(l.spaceId) });
  }
  return out;
}

// ---- what the screens need (plain JSON) ----

export interface ProposalView { key: string; conflict: boolean; contacts: { id: string; name: string; email?: string }[] }
export interface LinkView {
  key: string;
  other: { uid: string; name: string };
  /** I own a contact that is linked to them (my expenses with them are mirrored). */
  mine: { status: LinkStatus; contactName?: string } | null;
  /** They own a contact linked to me (their expenses with me are mirrored). */
  theirs: { status: LinkStatus } | null;
  /** True while at least one direction still syncs. False = history only. */
  live: boolean;
  me: string; // my participant id in the link space
  shared: SharedExpense[];
  settlements: Settlement[];
}
export interface LinkData { proposals: ProposalView[]; links: LinkView[] }

export async function loadLinkData(d: LinkDeps, uid: string): Promise<LinkData> {
  const pairs = await d.store.listForUser(uid);
  const proposals: ProposalView[] = [];
  const links: LinkView[] = [];
  const ownSpace = pairs.some((p) => p.sides[uid]?.status === "proposed") ? await d.households.getUserHouseholdId(uid) : null;
  for (const p of pairs) {
    const mine = p.sides[uid];
    const theirs = p.sides[otherUid(p, uid)];
    if (mine?.status === "proposed" && ownSpace === mine.householdId) {
      const people = await d.repoFor(mine.householdId).participants.list();
      const contacts = mine.contactIds.map((id) => people.find((x: Participant) => x.id === id)).filter((x): x is Participant => !!x && !x.linkId).map((x) => ({ id: x.id, name: x.name, email: x.email }));
      if (contacts.length > 0) proposals.push({ key: p.id, conflict: contacts.length > 1, contacts });
    }
    const visible = p.spaceId && ((mine && mine.status !== "proposed" && mine.status !== "declined") || (theirs && theirs.status !== "proposed" && theirs.status !== "declined"));
    if (!p.spaceId || !visible) continue;
    const repo = d.repoFor(p.spaceId);
    const [shared, settlements, members] = await Promise.all([repo.sharedExpenses.list(), repo.settlements.list(), d.households.listMembers(p.spaceId)]);
    const them = otherUid(p, uid);
    const contactName = mine?.contactId ? (await d.repoFor(mine.householdId).participants.get(mine.contactId))?.name : undefined;
    links.push({
      key: p.id, other: { uid: them, name: members.find((m) => m.uid === them)?.displayName || "Friend" },
      mine: mine && mine.status !== "proposed" && mine.status !== "declined" ? { status: mine.status, contactName } : null,
      theirs: theirs && theirs.status !== "proposed" && theirs.status !== "declined" ? { status: theirs.status } : null,
      live: mine?.status === "active" || theirs?.status === "active", me: linkParticipantId(uid),
      shared: shared.filter((s) => !s.voided).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      settlements: settlements.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  return { proposals, links };
}
