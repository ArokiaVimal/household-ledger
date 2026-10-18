import "server-only";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { ZodType } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AuditEvent, ExpenseRecord, ImportBatch, RawTransaction, Settlement, SharedExpense } from "@/domain/types";
import { ConflictError, type AppendOnly, type Collection, type Repository } from "./repository";
import { AccountSchema, AuditEventSchema, CategorySchema, ExpenseRecordSchema, ImportBatchSchema, MerchantMemorySchema, ParticipantSchema, RawTransactionSchema, ReceiptSchema, RecurringItemSchema, RuleDocSchema, SCHEMA_VERSION, SettlementSchema, SharedExpenseSchema } from "./schemas";

/** Firestore rejects `undefined`; round-trip through JSON to drop it (all our fields are JSON-safe). */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

type Guard<T> = (prev: T, next: T) => void;

function collection<T extends { id: string }>(db: Firestore, hid: string, name: string, schema: ZodType<T>, opts: { appendOnly?: boolean; immutable?: boolean; guard?: Guard<T> } = {}): Collection<T> {
  const col = () => db.collection("households").doc(hid).collection(name);
  const read = (id: string, data: FirebaseFirestore.DocumentData): T => {
    const { schemaVersion: _v, ...rest } = data; // stored for migrations, not part of the entity
    void _v;
    return { ...rest, id } as T;
  };
  return {
    async list() { return (await col().get()).docs.map((d) => read(d.id, d.data())); },
    async get(id) { const s = await col().doc(id).get(); return s.exists ? read(id, s.data()!) : null; },
    async put(item) {
      const parsed = clean(schema.parse(item)); // throws ZodError on invalid money, dates or splits
      const { id, ...body } = parsed;
      const ref = col().doc(id);
      await db.runTransaction(async (tx) => {
        const prev = await tx.get(ref);
        if (prev.exists && opts.immutable) throw new ConflictError("This record is write-once");
        if (prev.exists) opts.guard?.(read(id, prev.data()!), parsed);
        tx.set(ref, { ...body, schemaVersion: SCHEMA_VERSION });
      });
      return parsed;
    },
    async remove(id) {
      if (opts.appendOnly) throw new ConflictError("This collection is append-only");
      await col().doc(id).delete();
    },
  };
}

/** Same rule as the in-memory repository and firestore.rules: bank-sourced fields never change. */
const RAW_FIELDS = ["date", "postedDate", "originalDescription", "amountPaise", "currency", "accountId", "importSource", "referenceId"] as const;
const guardRecord: Guard<ExpenseRecord> = (prev, next) => {
  if (prev.importSource === "Manual entry") return;
  for (const f of RAW_FIELDS) if (prev[f] !== next[f]) throw new ConflictError(`Imported field "${f}" cannot be changed`);
};

/** Household-scoped repository over Firestore (Admin SDK). The caller must already have authorised the household. */
export function createFirestoreRepository(householdId: string, db: Firestore = getAdminDb()): Repository {
  const noRemove = <T extends { id: string }>(c: Collection<T>): AppendOnly<T> => ({ list: c.list, get: c.get, put: c.put });
  const audit = collection<AuditEvent>(db, householdId, "auditEvents", AuditEventSchema, { appendOnly: true });
  return {
    householdId,
    records: collection<ExpenseRecord>(db, householdId, "records", ExpenseRecordSchema as unknown as ZodType<ExpenseRecord>, { guard: guardRecord }),
    settlements: noRemove(collection<Settlement>(db, householdId, "settlements", SettlementSchema as unknown as ZodType<Settlement>, { appendOnly: true })),
    sharedExpenses: noRemove(collection<SharedExpense>(db, householdId, "sharedExpenses", SharedExpenseSchema as unknown as ZodType<SharedExpense>, { appendOnly: true })),
    receipts: collection(db, householdId, "receipts", ReceiptSchema),
    recurring: collection(db, householdId, "recurring", RecurringItemSchema),
    participants: collection(db, householdId, "participants", ParticipantSchema),
    accounts: collection(db, householdId, "accounts", AccountSchema),
    categories: collection(db, householdId, "categories", CategorySchema),
    rules: collection(db, householdId, "merchantRules", RuleDocSchema),
    merchantMemory: collection(db, householdId, "merchantMemory", MerchantMemorySchema),
    importBatches: noRemove(collection<ImportBatch>(db, householdId, "importBatches", ImportBatchSchema as unknown as ZodType<ImportBatch>, { appendOnly: true })),
    rawTransactions: noRemove(collection<RawTransaction>(db, householdId, "rawTransactions", RawTransactionSchema as unknown as ZodType<RawTransaction>, { appendOnly: true, immutable: true })),
    audit: {
      async list() { return (await audit.list()).sort((a, b) => a.at.localeCompare(b.at)); },
      async append(e) {
        const ev = AuditEventSchema.parse({ ...e, id: randomUUID(), at: e.at ?? new Date().toISOString() });
        return audit.put(ev);
      },
    },
  };
}

/** Deletes every document under households/{id}/ (data only; membership docs are handled by the household service). Used for tests and "delete my data". */
export async function deleteHouseholdData(householdId: string, db: Firestore = getAdminDb()): Promise<void> {
  for (const name of ["records", "settlements", "sharedExpenses", "receipts", "recurring", "participants", "accounts", "categories", "merchantRules", "merchantMemory", "auditEvents", "rawTransactions", "importBatches"]) {
    await db.recursiveDelete(db.collection("households").doc(householdId).collection(name));
  }
}
