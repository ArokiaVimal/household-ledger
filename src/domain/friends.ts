import type { ExpenseRecord, Participant, RecurringItem, Settlement } from "./types";

export interface FriendUse { transactions: number; settlements: number; recurring: string[] }

/** Where a person appears: as payer or in a split of a transaction (approved or waiting), in a settlement, in a recurring item. */
export function friendUsage(id: string, data: { records: ExpenseRecord[]; settlements: Settlement[]; recurring: RecurringItem[] }): FriendUse {
  return {
    transactions: data.records.filter((r) => r.payerId === id || r.split.participantIds.includes(id)).length,
    settlements: data.settlements.filter((s) => s.fromId === id || s.toId === id).length,
    recurring: data.recurring.filter((r) => r.payerId === id || r.split.participantIds.includes(id)).map((r) => r.name),
  };
}

export type FriendDeleteCheck = { ok: true } | { ok: false; reason: string };

/**
 * Only a friend without an account can be removed, and only when nothing refers to them: deleting someone who is in a
 * split or a settlement would silently change who owes what. Settlements are never deleted, so they block for good.
 */
export function checkFriendDelete(p: Participant | undefined, meId: string, use: FriendUse): FriendDeleteCheck {
  if (!p) return { ok: false, reason: "That person was not found." };
  if (p.id === meId || p.userId) return { ok: false, reason: "People with an account are managed under Sharing, not here." };
  const parts = [
    use.transactions > 0 ? `${use.transactions} transaction${use.transactions === 1 ? "" : "s"}` : "",
    use.settlements > 0 ? `${use.settlements} settlement${use.settlements === 1 ? "" : "s"}` : "",
    use.recurring.length > 0 ? `recurring ${use.recurring.join(", ")}` : "",
  ].filter(Boolean);
  if (parts.length > 0) return { ok: false, reason: `${p.name} is part of ${parts.join(", ")}. Remove them from those first, so nobody's balance changes by accident.` };
  return { ok: true };
}
