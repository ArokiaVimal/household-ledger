// Runtime validation for every persisted entity. The same schemas validate
// client forms and server routes. `satisfies` keeps them in step with the
// domain types, so a type change that is not mirrored here fails to compile.
import { z } from "zod";
import { validateSplit } from "@/domain/splits";
import type { Account, AuditEvent, CardBill, VoucherBrand, Category, ExpenseRecord, ImportBatch, MerchantMemory, Participant, RawTransaction, Receipt, RecurringItem, Settlement, SharedExpense, SplitConfig } from "@/domain/types";

export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(128);
const paise = z.number().int().safe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date");

const SplitItemSchema = z.object({ id, name: z.string().max(80), amountPaise: z.number().int().safe().positive(), participantIds: z.array(id).min(1).max(50) });
export const SplitConfigSchema = z.object({
  mode: z.enum(["personal", "equal", "percent", "custom", "shares", "adjust", "items"]),
  participantIds: z.array(id),
  values: z.record(z.string(), z.number().int().safe()).optional(),
  items: z.array(SplitItemSchema).max(100).optional(),
}) satisfies z.ZodType<SplitConfig>;

export const ParticipantSchema = z.object({ id, name: z.string().min(1).max(80), userId: z.string().min(1).nullable(), pendingEmail: z.string().max(200).optional(), inviterShareBps: z.number().int().min(500).max(9500).optional() }) satisfies z.ZodType<Participant>;
export const AccountSchema = z.object({ id, name: z.string().min(1).max(80), type: z.enum(["credit_card", "bank", "upi", "cash"]) }) satisfies z.ZodType<Account>;
export const CategorySchema = z.object({ id, name: z.string().min(1).max(60) }) satisfies z.ZodType<Category>;

export const ExpenseRecordSchema = z
  .object({
    id,
    date,
    postedDate: date.optional(),
    merchant: z.string().min(1).max(120),
    originalDescription: z.string().max(500),
    amountPaise: paise.positive("Amount must be greater than zero"),
    currency: z.literal("INR"),
    accountId: id,
    categoryId: id,
    kind: z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]),
    payerId: id,
    shared: z.boolean(),
    split: SplitConfigSchema,
    excluded: z.boolean(),
    status: z.enum(["unreviewed", "reviewed"]),
    importSource: z.string().max(200),
    referenceId: z.string().max(120).optional(),
    notes: z.string().max(1000).optional(),
    duplicateOf: id.optional(),
    receiptId: id.optional(),
    fundedBy: id.optional(),
    paidCardId: id.optional(),
    recurringHint: z.boolean().optional(),
    voucherBrandId: id.optional(),
    paidWithVoucherId: id.optional(),
    voucherPending: z.boolean().optional(),
    recurringId: id.optional(),
    suggested: z.enum(["memory", "ai", "ai_unsure"]).optional(),
    sharedWithPartner: z.boolean().optional(),
    shareNote: z.boolean().optional(),
  })
  .superRefine((r, ctx) => {
    // Business rule lives in the domain: shares must add up to the amount, to the paise.
    const err = validateSplit(r.amountPaise, r.split as SplitConfig);
    if (err) ctx.addIssue({ code: "custom", path: ["split"], message: err });
    if (r.shared !== (r.split.mode !== "personal")) ctx.addIssue({ code: "custom", path: ["shared"], message: "shared must match the split mode" });
    // A voucher purchase is one outflow; a payment made with a voucher is not. A transaction cannot be both.
    if (r.voucherBrandId && r.paidWithVoucherId) ctx.addIssue({ code: "custom", path: ["paidWithVoucherId"], message: "A transaction cannot both buy a voucher and be paid with one" });
    if (r.voucherBrandId && r.kind !== "purchase") ctx.addIssue({ code: "custom", path: ["voucherBrandId"], message: "Only a purchase can buy a voucher" });
  }) satisfies z.ZodType<ExpenseRecord>;

export const SettlementSchema = z
  .object({ id, date, fromId: id, toId: id, amountPaise: paise.positive(), note: z.string().max(500).optional(), voided: z.boolean().optional(), recordIds: z.array(id).max(500).optional() })
  .refine((s) => s.fromId !== s.toId, { message: "Pick two different people", path: ["toId"] }) satisfies z.ZodType<Settlement>;

export const SharedExpenseSchema = z
  .object({
    id, ownerUid: id, payerId: id, date, merchant: z.string().min(1).max(120), amountPaise: paise.positive("Amount must be greater than zero"), kind: z.enum(["purchase", "refund", "fee"]), categoryId: id, categoryName: z.string().min(1).max(60),
    split: SplitConfigSchema, note: z.string().max(500).optional(), voided: z.boolean().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  })
  .superRefine((r, ctx) => {
    const err = validateSplit(r.amountPaise, r.split as SplitConfig);
    if (err) ctx.addIssue({ code: "custom", path: ["split"], message: err });
    if (r.split.mode === "personal") ctx.addIssue({ code: "custom", path: ["split"], message: "A shared expense needs a split with someone else" });
  }) satisfies z.ZodType<SharedExpense>;

export const ReceiptSchema = z.object({ id, merchant: z.string().min(1), date, amountPaise: paise.positive(), orderId: z.string().optional(), filename: z.string().min(1) }) satisfies z.ZodType<Receipt>;

export const RecurringItemSchema = z.object({
  id, name: z.string().min(1).max(80), categoryId: id, dueDay: z.number().int().min(1).max(28), expectedPaise: paise.positive(), payerId: id, split: SplitConfigSchema, place: z.string().max(120).optional(),
}) satisfies z.ZodType<RecurringItem>;

/** Merchant rule document. The id is derived from the merchant so a merchant has at most one rule. */
export const RuleDocSchema = z.object({ id, merchant: z.string().trim().min(1).max(80), categoryId: id });
export type RuleDoc = z.infer<typeof RuleDocSchema>;
export const ruleId = (merchant: string) => `r_${merchant.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "rule"}`;

export const AuditEventSchema = z.object({
  id, at: z.string().datetime(), actorId: id,
  action: z.enum(["import", "approve", "reject", "edit", "create", "match", "unmatch", "settle", "void_settlement", "delete"]),
  entity: z.enum(["record", "settlement", "receipt", "recurring", "household"]), entityId: id, summary: z.string().max(500),
}) satisfies z.ZodType<AuditEvent>;

const count = z.number().int().min(0).max(1_000_000);
export const ImportBatchSchema = z.object({
  id, accountId: id, filename: z.string().min(1).max(200), fileHash: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(["csv", "xlsx", "pdf", "text"]), readBy: z.enum(["parser", "ai"]).optional(),
  uploadedAt: z.string().datetime(), uploadedBy: id,
  counts: z.object({ rows: count, staged: count, skippedDuplicate: count, flaggedDuplicate: count, unreadable: count }),
  totals: z.object({ debitPaise: z.number().int().safe().min(0), creditPaise: z.number().int().safe().min(0) }),
  checksPassed: z.boolean().optional(), acceptedMismatch: z.boolean().optional(), reimportOf: id.optional(),
}) satisfies z.ZodType<ImportBatch>;

export const RawTransactionSchema = z.object({
  id, batchId: id, line: z.number().int().min(1).max(1_000_000), cells: z.array(z.string().max(1000)).max(60),
}) satisfies z.ZodType<RawTransaction>;

const kindEnum = z.enum(["purchase", "refund", "income", "transfer", "cc_payment", "fee"]);
export const MerchantMemorySchema = z.object({
  id, key: z.string().min(1).max(80), name: z.string().min(1).max(60), categoryId: id, kind: kindEnum,
  source: z.enum(["user", "ai"]), confident: z.boolean(), confirmed: z.number().int().min(0).max(1_000_000), lastSeen: date, voucherSeller: z.boolean().optional(),
}) satisfies z.ZodType<MerchantMemory>;

export const CardBillSchema = z.object({
  id, accountId: id, statementDate: date, dueDate: date, totalDuePaise: paise.positive(), source: z.enum(["statement", "manual", "message"]), batchId: id.optional(), paid: z.boolean().optional(),
}) satisfies z.ZodType<CardBill>;

export const VoucherBrandSchema = z.object({
  id, name: z.string().trim().min(1).max(40),
  balance: z.object({ amountPaise: z.number().int().safe().min(0), asOf: date }).optional(),
  tracksAllUse: z.boolean().optional(),
}) satisfies z.ZodType<VoucherBrand>;

