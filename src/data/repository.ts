// Data-access contract. UI and server routes depend on this interface only.
// Implementations: memory-repository.ts (prototype, tests) and, in a later slice,
// a Firestore adapter under src/data/firebase/. Business rules stay in src/domain.
import type { PaymentGroup, Account, AuditEvent, CardBill, VoucherBrand, Category, ExpenseRecord, ImportBatch, MerchantMemory, Participant, RawTransaction, Receipt, RecurringItem, Settlement, SharedExpense } from "@/domain/types";
import type { RuleDoc } from "./schemas";

export class NotFoundError extends Error {}
/** Thrown when a write would break an invariant (e.g. changing an approved record's raw fields). */
export class ConflictError extends Error {}

export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** Create or replace. Validates with the entity's Zod schema before writing. */
  put(item: T): Promise<T>;
  remove(id: string): Promise<void>;
}

/** Collection whose entries can never be deleted (audit trail, settlements keep history via `voided`). */
export type AppendOnly<T extends { id: string }> = Omit<Collection<T>, "remove">;

/** Everything is scoped to one household. An implementation must never return another household's data. */
export interface Repository {
  readonly householdId: string;
  /** Approved ledger rows and review-queue rows share a collection; `status` tells them apart. */
  records: Collection<ExpenseRecord>;
  settlements: AppendOnly<Settlement>;
  /** Couple space only: redacted copies of expenses a partner chose to share. Withdrawn by voiding, never deleted. */
  sharedExpenses: AppendOnly<SharedExpense>;
  receipts: Collection<Receipt>;
  recurring: Collection<RecurringItem>;
  cardBills: Collection<CardBill>;
  voucherBrands: Collection<VoucherBrand>;
  paymentGroups: Collection<PaymentGroup>;
  participants: Collection<Participant>;
  accounts: Collection<Account>;
  categories: Collection<Category>;
  /** One entry per uploaded statement file (history, and file-level duplicate protection). Never deleted. */
  importBatches: AppendOnly<ImportBatch>;
  /** Immutable copy of every imported row as the bank wrote it. */
  rawTransactions: AppendOnly<RawTransaction>;
  /** Merchant -> category rules used to pre-fill the review queue. */
  rules: Collection<RuleDoc>;
  /** What the import has learned about merchants (names, categories, payment types). Written by the server only. */
  merchantMemory: Collection<MerchantMemory>;
  audit: Pick<AppendOnly<AuditEvent>, "list"> & { append(event: Omit<AuditEvent, "id" | "at"> & { at?: string }): Promise<AuditEvent> };
}
