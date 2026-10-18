import type { ZodType } from "zod";
import { AccountSchema, AuditEventSchema, CategorySchema, ExpenseRecordSchema, ParticipantSchema, ReceiptSchema, RecurringItemSchema, SettlementSchema } from "./schemas";
import { ConflictError, type AppendOnly, type Collection, type Repository } from "./repository";
import type { Account, AuditEvent, Category, ExpenseRecord, Participant, Receipt, RecurringItem, Settlement } from "@/domain/types";

export interface Seed {
  records?: ExpenseRecord[];
  settlements?: Settlement[];
  receipts?: Receipt[];
  recurring?: RecurringItem[];
  participants?: Participant[];
  accounts?: Account[];
  categories?: Category[];
}

function collection<T extends { id: string }>(schema: ZodType<T>, seed: T[] = [], opts: { appendOnly?: boolean; guard?: (prev: T, next: T) => void } = {}): Collection<T> {
  const items = new Map<string, T>();
  for (const s of seed) items.set(s.id, structuredClone(schema.parse(s)));
  return {
    async list() { return [...items.values()].map((x) => structuredClone(x)); },
    async get(id) { const x = items.get(id); return x ? structuredClone(x) : null; },
    async put(item) {
      const parsed = schema.parse(item); // throws ZodError on invalid money, dates or splits
      const prev = items.get(parsed.id);
      if (prev) opts.guard?.(prev, parsed);
      items.set(parsed.id, structuredClone(parsed));
      return structuredClone(parsed);
    },
    async remove(id) {
      if (opts.appendOnly) throw new ConflictError("This collection is append-only");
      items.delete(id);
    },
  };
}

/** Raw bank fields of a reviewed record never change; edits go to categorisation and split fields only. */
const RAW_FIELDS = ["date", "postedDate", "originalDescription", "amountPaise", "currency", "accountId", "importSource", "referenceId"] as const;
function guardRecord(prev: ExpenseRecord, next: ExpenseRecord) {
  if (prev.importSource === "Manual entry") return; // the user owns manual entries
  for (const f of RAW_FIELDS) if (prev[f] !== next[f]) throw new ConflictError(`Imported field "${f}" cannot be changed`);
}

/** In-memory repository for the prototype and for tests. Mirrors the rules a real backend must enforce. */
export function createMemoryRepository(householdId: string, seed: Seed = {}): Repository {
  const audit: AuditEvent[] = [];
  let n = 0;
  const noRemove = <T extends { id: string }>(c: Collection<T>): AppendOnly<T> => ({ list: c.list, get: c.get, put: c.put });
  return {
    householdId,
    records: collection(ExpenseRecordSchema as unknown as ZodType<ExpenseRecord>, seed.records, { guard: guardRecord }),
    settlements: noRemove(collection(SettlementSchema as unknown as ZodType<Settlement>, seed.settlements, { appendOnly: true })),
    receipts: collection(ReceiptSchema, seed.receipts),
    recurring: collection(RecurringItemSchema, seed.recurring),
    participants: collection(ParticipantSchema, seed.participants),
    accounts: collection(AccountSchema, seed.accounts),
    categories: collection(CategorySchema, seed.categories),
    audit: {
      async list() { return structuredClone(audit); },
      async append(e) {
        const ev = AuditEventSchema.parse({ ...e, id: `a${++n}`, at: e.at ?? new Date().toISOString() });
        audit.push(ev);
        return structuredClone(ev);
      },
    },
  };
}
