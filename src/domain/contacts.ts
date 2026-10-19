// Friends & Family: contacts you split with. A contact is NOT a login. Its email is only a hint for matching a future sign-up, and an
// account is linked only from a VERIFIED email. These rules are pure so the server and the screens agree.
import type { Participant, Relationship } from "./types";

export const RELATIONSHIP_LABEL: Record<Relationship, string> = { partner: "Partner", friend: "Friend", family: "Family", parent: "Parent", custom: "Custom" };

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.trim().length <= 200;

/** What to show for a contact's relationship: the custom wording, or the standard name. */
export function relationshipText(p: Pick<Participant, "relationship" | "relationshipLabel">): string {
  if (p.relationship === "custom") return p.relationshipLabel?.trim() || "Custom";
  return p.relationship ? RELATIONSHIP_LABEL[p.relationship] : "Friend";
}

export interface ContactDraft { name: string; nickname?: string | null; email?: string | null; relationship: Relationship; relationshipLabel?: string | null }

/** First problem with a new or edited contact, or null. `others` are the contacts it must not clash with (never including itself). */
export function checkContact(draft: ContactDraft, others: Participant[]): string | null {
  const name = draft.name.trim();
  if (!name) return "Enter a name.";
  if (name.length > 60) return "Keep the name under 60 characters.";
  if (others.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) return "Someone with that name already exists.";
  if (draft.email && draft.email.trim()) {
    if (!isValidEmail(draft.email)) return "Enter a valid email address, or leave it empty.";
    const hit = others.find((p) => p.email && normalizeEmail(p.email) === normalizeEmail(draft.email!));
    if (hit) return `${hit.name} already has that email.`;
  }
  if ((draft.nickname ?? "").trim().length > 30) return "Keep the nickname under 30 characters.";
  if (draft.relationship === "custom" && !(draft.relationshipLabel ?? "").trim()) return "Say what the relationship is, for example Flatmate.";
  if ((draft.relationshipLabel ?? "").length > 30) return "Keep the relationship under 30 characters.";
  return null;
}

export type LinkMatch =
  | { status: "unverified" }                       // the account's email is not verified: never link
  | { status: "none" }
  | { status: "unique"; contact: Participant }     // safe to offer linking
  | { status: "conflict"; contacts: Participant[] }; // several contacts share the email: a person must choose, nothing is linked automatically

/**
 * Which of YOUR contacts a newly signed-up account may be linked to. Only a verified email matches, only contacts that are not
 * already linked, and more than one match is a conflict that needs a human decision.
 */
export function matchAccount(contacts: Participant[], account: { email: string | null | undefined; emailVerified: boolean }): LinkMatch {
  if (!account.emailVerified || !account.email) return { status: "unverified" };
  const email = normalizeEmail(account.email);
  const hits = contacts.filter((p) => !p.userId && !p.pendingEmail && !p.linkId && p.email && normalizeEmail(p.email) === email);
  if (hits.length === 0) return { status: "none" };
  return hits.length === 1 ? { status: "unique", contact: hits[0] } : { status: "conflict", contacts: hits };
}
