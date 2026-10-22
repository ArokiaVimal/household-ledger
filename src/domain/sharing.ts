// Sharing an expense with a partner. The private record stays in the owner's personal space; a redacted copy
// (SharedExpense) goes to the couple space. Pure rules here; the server action does the writes.
import type { ExpenseRecord, SharedExpense } from "./types";

const SHAREABLE = new Set<ExpenseRecord["kind"]>(["purchase", "refund", "fee"]);

export interface ShareContext {
  /** Participant ids of the signed-in user and their partner. */
  meId: string;
  partnerId: string;
  /** Linked with a partner right now (not unlinked). */
  coupleActive: boolean;
}

export type SharePlan =
  | { action: "share" }
  /** Not shared (any more): withdraw the copy if one exists. */
  | { action: "withdraw" }
  | { action: "none" };

/**
 * Decides what a record's state means for the partner. Choosing a split that includes the partner is the sharing action.
 * Throws a plain-language message when the choice cannot be shared, so the person can fix it.
 */
export function planShare(r: ExpenseRecord, ctx: ShareContext): SharePlan {
  const withPartner = r.status === "reviewed" && !r.excluded && r.split.mode !== "personal" && r.split.participantIds.includes(ctx.partnerId);
  if (!withPartner) return r.sharedWithPartner ? { action: "withdraw" } : { action: "none" };
  if (!ctx.coupleActive) return { action: "none" };
  if (!SHAREABLE.has(r.kind)) throw new SharingError("Only purchases, refunds and fees can be shared. Income, transfers and card-bill payments stay private.");
  if (r.payerId !== ctx.meId) throw new SharingError("Only the person who paid can share an expense. Ask them to add it.");
  return { action: "share" };
}

export class SharingError extends Error {}

/** Everyone named in a record: the payer and everyone in the split (including item shares). */
const peopleIn = (r: ExpenseRecord): Set<string> => new Set([r.payerId, ...r.split.participantIds, ...(r.split.items ?? []).flatMap((i) => i.participantIds)]);

/**
 * The redacted copy: no bank text, no account, no import details. The note only travels if the owner opted in.
 * The full split travels, like a group expense: when others are in it (a friend as well as the partner) their NAMES go with it
 * (`people`, by id) so the partner can read the whole split. Names only: never email, UPI id, account or relationship.
 */
export function buildShared(r: ExpenseRecord, o: { ownerUid: string; categoryName: string; now: string; createdAt?: string; /** Participant ids of the two partners, and names by id for everyone in the owner's space. */ meId?: string; partnerId?: string; names?: Record<string, string> }): SharedExpense {
  const others = o.names && o.meId && o.partnerId ? [...peopleIn(r)].filter((id) => id !== o.meId && id !== o.partnerId) : [];
  const people = Object.fromEntries(others.map((id) => [id, (o.names?.[id] ?? "Someone").slice(0, 80)]));
  return {
    id: r.id, ownerUid: o.ownerUid, payerId: r.payerId, date: r.date, merchant: r.merchant, amountPaise: r.amountPaise,
    kind: r.kind as SharedExpense["kind"], categoryId: r.categoryId, categoryName: o.categoryName, split: r.split,
    ...(r.shareNote && r.notes ? { note: r.notes.slice(0, 500) } : {}), ...(others.length ? { people } : {}),
    createdAt: o.createdAt ?? o.now, updatedAt: o.now,
  };
}

/** A shared expense as a ledger row, so the same balance and report calculations apply. */
export function sharedToRecord(s: SharedExpense): ExpenseRecord {
  return {
    id: s.id, date: s.date, merchant: s.merchant, originalDescription: "", amountPaise: s.amountPaise, currency: "INR", accountId: "shared",
    categoryId: s.categoryId, kind: s.kind, payerId: s.payerId, shared: true, split: s.split, excluded: false, status: "reviewed",
    importSource: "Shared", notes: s.note,
  };
}

