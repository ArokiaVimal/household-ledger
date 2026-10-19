// Complete backup, verified restore. A backup is one JSON document: every collection of the personal space, the counts, and a
// SHA-256 checksum of the contents, so a damaged or edited file is caught before anything is touched. Restore only ever runs on a
// backup that verified, and it replaces the space's data in one explicit step. Works with any Repository (Firestore, memory).
import type { ZodType } from "zod";
import type { Repository } from "@/data/repository";
import { AccountSchema, AuditEventSchema, CardBillSchema, CategorySchema, ExpenseRecordSchema, ImportBatchSchema, MerchantMemorySchema, ParticipantSchema, PaymentGroupSchema, SplitGroupSchema, SplitSettlementSchema, RawTransactionSchema, ReceiptSchema, RecurringItemSchema, RuleDocSchema, SettlementSchema, VoucherBrandSchema } from "@/data/schemas";

export const BACKUP_FORMAT = "ledger-backup";
export const BACKUP_VERSION = 1;

/** Everything in a personal space. Partner and linked-friend shared copies live in their own spaces and are not part of it. */
export const COLLECTIONS = ["participants", "accounts", "categories", "rules", "merchantMemory", "paymentGroups", "voucherBrands", "recurring", "cardBills", "importBatches", "rawTransactions", "records", "settlements", "receipts", "audit", "splitGroups", "splitSettlements"] as const;
/** Sections that older backups do not have: read as empty instead of failing, and left out of the checksum when absent. */
const OPTIONAL: ReadonlySet<CollectionName> = new Set(["splitGroups", "splitSettlements"]);
export type CollectionName = (typeof COLLECTIONS)[number];

const SCHEMAS: Record<CollectionName, ZodType<{ id: string }>> = {
  participants: ParticipantSchema, accounts: AccountSchema, categories: CategorySchema, rules: RuleDocSchema, merchantMemory: MerchantMemorySchema, paymentGroups: PaymentGroupSchema,
  voucherBrands: VoucherBrandSchema, recurring: RecurringItemSchema, cardBills: CardBillSchema, importBatches: ImportBatchSchema as unknown as ZodType<{ id: string }>, rawTransactions: RawTransactionSchema,
  records: ExpenseRecordSchema as unknown as ZodType<{ id: string }>, settlements: SettlementSchema as unknown as ZodType<{ id: string }>, receipts: ReceiptSchema, audit: AuditEventSchema as unknown as ZodType<{ id: string }>,
  splitGroups: SplitGroupSchema, splitSettlements: SplitSettlementSchema as unknown as ZodType<{ id: string }>,
};

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  counts: Record<CollectionName, number>;
  /** SHA-256 over the canonical form of `collections`. */
  checksum: string;
  collections: Record<CollectionName, { id: string }[]>;
}

/** Stable JSON: keys sorted, so the same data always gives the same text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

async function read(repo: Repository): Promise<Record<CollectionName, { id: string }[]>> {
  const [participants, accounts, categories, rules, merchantMemory, paymentGroups, voucherBrands, recurring, cardBills, importBatches, rawTransactions, records, settlements, receipts, audit, splitGroups, splitSettlements] = await Promise.all([
    repo.participants.list(), repo.accounts.list(), repo.categories.list(), repo.rules.list(), repo.merchantMemory.list(), repo.paymentGroups.list(), repo.voucherBrands.list(), repo.recurring.list(), repo.cardBills.list(),
    repo.importBatches.list(), repo.rawTransactions.list(), repo.records.list(), repo.settlements.list(), repo.receipts.list(), repo.audit.list(), repo.splitGroups.list(), repo.splitSettlements.list(),
  ]);
  const all: Record<CollectionName, { id: string }[]> = { participants, accounts, categories, rules, merchantMemory, paymentGroups, voucherBrands, recurring, cardBills, importBatches, rawTransactions, records, settlements, receipts, audit, splitGroups, splitSettlements };
  // Sorted so the same data always produces the same file and checksum.
  return Object.fromEntries(COLLECTIONS.map((c) => [c, sortById(all[c])])) as Record<CollectionName, { id: string }[]>;
}

export async function buildBackup(repo: Repository, now: Date = new Date()): Promise<Backup> {
  const collections = await read(repo);
  const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, collections[c].length])) as Record<CollectionName, number>;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), counts, checksum: await sha256Hex(canonical(collections)), collections };
}

export type VerifyResult = { ok: true; backup: Backup; warnings: string[] } | { ok: false; errors: string[] };

/** Checks a backup file end to end. Nothing is written. Errors block a restore; warnings are shown but do not. */
export async function verifyBackup(raw: unknown): Promise<VerifyResult> {
  const errors: string[] = [];
  const o = raw as Partial<Backup> | null;
  if (!o || typeof o !== "object" || o.format !== BACKUP_FORMAT) return { ok: false, errors: ["This is not a backup file from this app."] };
  if (o.version !== BACKUP_VERSION) return { ok: false, errors: [`This backup is version ${String(o.version)}; this app restores version ${BACKUP_VERSION}.`] };
  if (!o.collections || typeof o.collections !== "object") return { ok: false, errors: ["The backup has no data in it."] };
  const cols = o.collections as Record<string, unknown>;
  for (const name of COLLECTIONS) {
    const rows = cols[name];
    if (!Array.isArray(rows) && OPTIONAL.has(name) && rows === undefined) continue;
    if (!Array.isArray(rows)) { errors.push(`The ${name} section is missing.`); continue; }
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const r = SCHEMAS[name].safeParse(row);
      if (!r.success) { if (errors.length < 12) errors.push(`${name} #${i + 1}: ${r.error.issues[0]?.message ?? "invalid"}${r.error.issues[0]?.path.length ? ` (${r.error.issues[0].path.join(".")})` : ""}`); return; }
      if (seen.has(r.data.id)) errors.push(`${name}: the id ${r.data.id} appears twice.`);
      seen.add(r.data.id);
    });
    if (o.counts && o.counts[name] !== rows.length) errors.push(`${name}: the file says ${o.counts[name]} but holds ${rows.length}.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const present = COLLECTIONS.filter((c) => !(OPTIONAL.has(c) && cols[c] === undefined));
  const parsed = Object.fromEntries(present.map((c) => [c, (cols[c] as { id: string }[]).map((x) => SCHEMAS[c].parse(x))])) as Record<CollectionName, { id: string }[]>;
  if ((await sha256Hex(canonical(parsed))) !== o.checksum) return { ok: false, errors: ["The checksum does not match: the file was changed or damaged after it was exported, so it was not restored."] };

  const collections = { ...Object.fromEntries(COLLECTIONS.filter((c) => OPTIONAL.has(c)).map((c) => [c, []])), ...parsed } as Record<CollectionName, { id: string }[]>;
  const warnings: string[] = [];
  const ids = (c: CollectionName) => new Set(collections[c].map((x) => x.id));
  const acc = ids("accounts"), cat = ids("categories"), ppl = ids("participants");
  type R = { accountId: string; categoryId: string; payerId: string };
  const bad = (collections.records as unknown as R[]);
  const missingAcc = bad.filter((r) => !acc.has(r.accountId)).length, missingCat = bad.filter((r) => !cat.has(r.categoryId)).length;
  if (missingAcc) warnings.push(`${missingAcc} transaction${missingAcc === 1 ? "" : "s"} refer to a payment method that is not in the backup.`);
  if (missingCat) warnings.push(`${missingCat} transaction${missingCat === 1 ? "" : "s"} refer to a category that is not in the backup.`);
  const strangers = new Set((collections.records as unknown as R[]).map((r) => r.payerId).filter((p) => !ppl.has(p)));
  if (strangers.size) warnings.push(`${strangers.size} payer${strangers.size === 1 ? "" : "s"} are not in the people list (for example a partner whose details live in the shared space).`);
  return { ok: true, backup: { ...(o as Backup), collections }, warnings };
}

/**
 * Replaces the space's data with a VERIFIED backup. `wipe` clears the space first (for Firestore it deletes every collection).
 * The caller has already verified the file and got the person's explicit confirmation.
 */
export async function restoreBackup(repo: Repository, backup: Backup, wipe: () => Promise<void>): Promise<Record<CollectionName, number>> {
  await wipe();
  const put = async <T extends { id: string }>(c: { put(x: T): Promise<unknown> }, rows: unknown[]) => { for (const r of rows) await c.put(r as T); };
  const c = backup.collections;
  await put(repo.participants, c.participants); await put(repo.accounts, c.accounts); await put(repo.categories, c.categories); await put(repo.rules, c.rules);
  await put(repo.merchantMemory, c.merchantMemory); await put(repo.paymentGroups, c.paymentGroups); await put(repo.voucherBrands, c.voucherBrands); await put(repo.recurring, c.recurring);
  await put(repo.cardBills, c.cardBills); await put(repo.importBatches, c.importBatches); await put(repo.rawTransactions, c.rawTransactions); await put(repo.records, c.records);
  await put(repo.settlements, c.settlements); await put(repo.receipts, c.receipts);
  await put(repo.splitGroups, c.splitGroups ?? []); await put(repo.splitSettlements, c.splitSettlements ?? []);
  for (const e of c.audit as { id: string; at: string; actorId: string; action: never; entity: never; entityId: string; summary: string }[]) await repo.audit.append(e);
  return backup.counts;
}
