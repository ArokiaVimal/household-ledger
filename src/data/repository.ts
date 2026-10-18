// Data-access contract. UI and server routes depend on this interface only.
// Implementations: memory-repository.ts (prototype, tests) and, in a later slice,
// a Firestore adapter under src/data/firebase/. Business rules stay in src/domain.
import type { Account, AuditEvent, Category, ExpenseRecord, Participant, Receipt, RecurringItem, Settlement } from "@/domain/types";

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
  receipts: Collection<Receipt>;
  recurring: Collection<RecurringItem>;
  participants: Collection<Participant>;
  accounts: Collection<Account>;
  categories: Collection<Category>;
  audit: Pick<AppendOnly<AuditEvent>, "list"> & { append(event: Omit<AuditEvent, "id" | "at"> & { at?: string }): Promise<AuditEvent> };
}
