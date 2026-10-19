import type { Repository } from "@/data/repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import type { MerchantRule } from "@/domain/rules";
import type { PaymentGroup, Account, CardBill, Category, VoucherBrand, ExpenseRecord, ImportBatch, Participant, Receipt, RecurringItem, Settlement } from "@/domain/types";

/** Everything the UI needs for one household, as plain JSON. */
export interface HouseholdData {
  records: ExpenseRecord[];
  settlements: Settlement[];
  receipts: Receipt[];
  recurring: RecurringItem[];
  cardBills: CardBill[];
  voucherBrands: VoucherBrand[];
  paymentGroups: PaymentGroup[];
  /** Icon chosen for a merchant (by lowercase display name). */
  merchantIcons: Record<string, string>;
  participants: Participant[];
  accounts: Account[];
  categories: Category[];
  rules: MerchantRule[];
  importBatches: ImportBatch[];
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
  const [records, settlements, receipts, recurring, participants, accounts, categories, rules, importBatches, cardBills, voucherBrands, memories, paymentGroups] = await Promise.all([
    repo.records.list(), repo.settlements.list(), repo.receipts.list(), repo.recurring.list(), repo.participants.list(), repo.accounts.list(), repo.categories.list(), repo.rules.list(), repo.importBatches.list(), repo.cardBills.list(), repo.voucherBrands.list(), repo.merchantMemory.list(), repo.paymentGroups.list(),
  ]);
  const byDate = (a: ExpenseRecord, b: ExpenseRecord) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  return {
    records: records.sort(byDate), settlements: settlements.sort((a, b) => a.date.localeCompare(b.date)), receipts, recurring, cardBills, voucherBrands: voucherBrands.sort((a, b) => a.name.localeCompare(b.name)),
    paymentGroups: paymentGroups.sort((a, b) => (a.order ?? 1e6) - (b.order ?? 1e6)),
    merchantIcons: Object.fromEntries(memories.filter((m) => m.icon).map((m) => [m.name.toLowerCase(), m.icon as string])),
    participants: participants.sort((a, b) => a.name.localeCompare(b.name)), accounts, categories: categories.sort(orderCategories),
    rules: rules.map((r) => ({ merchant: r.merchant, categoryId: r.categoryId })),
    importBatches: importBatches.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
  };
}

/**
 * One round of reads in the normal case. First-run setup only happens (and the data is re-read) when something is
 * actually missing, instead of checking with extra sequential reads on every page load.
 */
export async function loadReadyHouseholdData(repo: Repository, members: { uid: string; displayName: string }[]): Promise<HouseholdData> {
  const data = await loadHouseholdData(repo);
  const complete = data.categories.length > 0 && members.every((m) => data.participants.some((p) => p.userId === m.uid));
  if (complete) return data;
  await ensureHouseholdReady(repo, members);
  return loadHouseholdData(repo);
}

// Keep the default order stable, with custom categories after the defaults.
const order = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.id, i]));
const orderCategories = (a: Category, b: Category) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name);
