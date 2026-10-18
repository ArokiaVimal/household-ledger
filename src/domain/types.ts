/** Money is always integer paise (1 INR = 100 paise). Never floats. */
export type Paise = number;

export type TxnKind =
  | "purchase"
  | "refund"
  | "income"
  | "transfer"
  | "cc_payment"
  | "fee";

export type ReviewStatus = "unreviewed" | "reviewed";

export type SplitMode = "personal" | "equal" | "percent" | "custom";

/**
 * Split configuration. Shares are always derived from this + amount via
 * `computeShares` so there is one authoritative calculation.
 * - personal: participantIds has exactly one id
 * - equal:    participantIds
 * - percent:  values[participantId] in basis points (10000 = 100%)
 * - custom:   values[participantId] in paise
 */
export interface SplitConfig {
  mode: SplitMode;
  participantIds: string[];
  values?: Record<string, number>;
}

export interface Participant {
  id: string;
  name: string;
  /** Registered household member, or null for friends without an account. */
  userId: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: "credit_card" | "bank" | "upi" | "cash";
}

export interface Category {
  id: string;
  name: string;
}

/** Canonical expense/financial record (prototype merges txn + expense). */
export interface ExpenseRecord {
  id: string;
  /** Actual purchase date, YYYY-MM-DD. Reports use this, not postedDate. */
  date: string;
  postedDate?: string;
  merchant: string;
  /** Original bank text. Never edited, kept for audit. */
  originalDescription: string;
  /** Always positive. `kind` determines the direction. */
  amountPaise: Paise;
  currency: "INR";
  accountId: string;
  categoryId: string;
  kind: TxnKind;
  payerId: string;
  shared: boolean;
  split: SplitConfig;
  excluded: boolean;
  status: ReviewStatus;
  importSource: string;
  /** Bank reference / source id when available (dedupe key). */
  referenceId?: string;
  notes?: string;
  /** Id of another record this one is a possible duplicate of. */
  duplicateOf?: string;
  /** Receipt linked to this expense (reversible match). */
  receiptId?: string;
  /** For UPI-app payments: the bank account the money left from. */
  fundedBy?: string;
  /** Recurring commitment this payment fulfils (rent, EMI, insurance...). */
  recurringId?: string;
}

/** A commitment that repeats every month. Records link to it via `recurringId`. */
export interface RecurringItem {
  id: string;
  name: string;
  categoryId: string;
  /** Day of month the payment is due (1-28). */
  dueDay: number;
  /** Expected amount per month, in paise. */
  expectedPaise: Paise;
  payerId: string;
  split: SplitConfig;
  /** Where it applies, e.g. the apartment or parents' house. */
  place?: string;
}

export interface Settlement {
  id: string;
  date: string;
  fromId: string; // payer of the settlement (debtor)
  toId: string;
  amountPaise: Paise;
  note?: string;
  /** Voided settlements stay in history but no longer count. */
  voided?: boolean;
}

export interface Receipt {
  id: string;
  merchant: string;
  date: string;
  amountPaise: Paise;
  orderId?: string;
  filename: string;
}

/** Append-only record of who changed what. Written for imports, edits, matches, settlements. */
export interface AuditEvent {
  id: string;
  /** ISO timestamp. */
  at: string;
  actorId: string;
  action: "import" | "approve" | "reject" | "edit" | "create" | "match" | "unmatch" | "settle" | "void_settlement" | "delete";
  entity: "record" | "settlement" | "receipt" | "recurring" | "household";
  entityId: string;
  summary: string;
}

/** One uploaded statement file. The file itself is not stored; its SHA-256 is, so re-uploads can be refused. */
export interface ImportBatch {
  id: string;
  accountId: string;
  filename: string;
  fileHash: string;
  format: "csv" | "xlsx" | "pdf";
  uploadedAt: string;
  uploadedBy: string;
  counts: { rows: number; staged: number; skippedDuplicate: number; flaggedDuplicate: number; unreadable: number };
  /** Statement totals as read from the file (paise), so a person can compare them with the statement. */
  totals: { debitPaise: number; creditPaise: number };
  /** PDF statements only: did every self-check against the statement's own totals pass, and did the user import despite a failure. */
  checksPassed?: boolean;
  acceptedMismatch?: boolean;
}

/** A transaction row exactly as read from a statement. Write-once: the canonical expense may be edited, this never is. */
export interface RawTransaction {
  id: string;
  batchId: string;
  /** 1-based line in the source file. */
  line: number;
  cells: string[];
}
