import type { Repository } from "@/data/repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import type { MerchantRule } from "@/domain/rules";
import type { Account, Category, ExpenseRecord, Participant, Receipt, RecurringItem, Settlement } from "@/domain/types";

/** Everything the UI needs for one household, as plain JSON. */
export interface HouseholdData {
  records: ExpenseRecord[];
  settlements: Settlement[];
  receipts: Receipt[];
  recurring: RecurringItem[];
  participants: Participant[];
  accounts: Account[];
  categories: Category[];
  rules: MerchantRule[];
}

export const participantIdFor = (uid: string) => `u_${uid}`;

/**
 * Idempotent first-run setup, safe to call on every load: default categories if there are none, and a
 * participant for every household member (linked to their account) so splits can name them.
 */
export async function ensureHouseholdReady(repo: Repository, members: { uid: string; displayName: string }[]): Promise<void> {
  if ((await repo.categories.list()).length === 0) for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
  const people = await repo.participants.list();
  for (const m of members) {
    if (!people.some((p) => p.userId === m.uid)) await repo.participants.put({ id: participantIdFor(m.uid), name: m.displayName || "Member", userId: m.uid });
  }
}

export async function loadHouseholdData(repo: Repository): Promise<HouseholdData> {
  const [records, settlements, receipts, recurring, participants, accounts, categories, rules] = await Promise.all([
    repo.records.list(), repo.settlements.list(), repo.receipts.list(), repo.recurring.list(), repo.participants.list(), repo.accounts.list(), repo.categories.list(), repo.rules.list(),
  ]);
  const byDate = (a: ExpenseRecord, b: ExpenseRecord) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  return {
    records: records.sort(byDate), settlements: settlements.sort((a, b) => a.date.localeCompare(b.date)), receipts, recurring,
    participants: participants.sort((a, b) => a.name.localeCompare(b.name)), accounts, categories: categories.sort(orderCategories),
    rules: rules.map((r) => ({ merchant: r.merchant, categoryId: r.categoryId })),
  };
}

// Keep the default order stable, with custom categories after the defaults.
const order = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.id, i]));
const orderCategories = (a: Category, b: Category) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name);
