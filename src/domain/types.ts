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

export type SplitMode = "personal" | "equal" | "percent" | "custom" | "shares" | "adjust" | "items";

/**
 * Split configuration. Shares are always derived from this + amount via
 * `computeShares` so there is one authoritative calculation.
 * - personal: participantIds has exactly one id
 * - equal:    participantIds
 * - percent:  values[participantId] in basis points (10000 = 100%)
 * - custom:   values[participantId] in paise (exact amounts)
 * - shares:   values[participantId] = number of shares (2 shares pay twice what 1 share pays; 0 pays nothing)
 * - adjust:   values[participantId] = signed paise added to (or taken off) that person's share after the rest is split equally
 * - items:    `items` lists what was bought and who shared each; tax, tip and fees (the bill total minus the items) are
 *             shared in proportion to what each person's items came to
 */
export interface SplitConfig {
  mode: SplitMode;
  participantIds: string[];
  values?: Record<string, number>;
  items?: SplitItem[];
}

export interface SplitItem {
  id: string;
  name: string;
  /** Always positive. */
  amountPaise: Paise;
  /** Who shared this item; its cost is divided equally between them. */
  participantIds: string[];
}

export interface Participant {
  id: string;
  name: string;
  /** Registered household member, or null for friends without an account. */
  userId: string | null;
  /** Set while this person is an invited partner who has not accepted yet. Their id is temporary. */
  pendingEmail?: string;
  /** Pending partner only: the share (basis points, 6400 = 64%) the inviter usually carries when they split with this person. */
  inviterShareBps?: number;
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
  /** Set when a redacted copy of this expense was shared with the partner (see SharedExpense). */
  sharedWithPartner?: boolean;
  /** The owner chose to show this record's note on the shared copy. Off by default. */
  shareNote?: boolean;
  /** Where the import's guess for merchant/category came from. Only set while the row waits in the review queue. */
  suggested?: Suggestion;
}

/** memory = learned from your own earlier approvals; ai = Claude was fairly sure; ai_unsure = Claude guessed, look at it. */
export type Suggestion = "memory" | "ai" | "ai_unsure";

/** What the app has learned about one merchant: how you name it, where it belongs, what kind of payment it is. */
export interface MerchantMemory {
  id: string;
  /** Normalised merchant text the statement lines are matched against (see memoryKey). */
  key: string;
  name: string;
  categoryId: string;
  kind: TxnKind;
  /** user = you approved or corrected it (always wins); ai = Claude's suggestion, not yet confirmed. */
  source: "user" | "ai";
  /** AI entries only: Claude said it was sure. */
  confident: boolean;
  /** How many times you have confirmed it. */
  confirmed: number;
  /** Date (YYYY-MM-DD) of the last confirmation or suggestion. */
  lastSeen: string;
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
  /** The payments this settlement pays off (so each one can show as settled). Empty for a plain amount. */
  recordIds?: string[];
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
  format: "csv" | "xlsx" | "pdf" | "text";
  /** Who turned the file or text into rows: the deterministic parser, or Claude (every such row needs a careful look). */
  readBy?: "parser" | "ai";
  uploadedAt: string;
  uploadedBy: string;
  counts: { rows: number; staged: number; skippedDuplicate: number; flaggedDuplicate: number; unreadable: number };
  /** Statement totals as read from the file (paise), so a person can compare them with the statement. */
  totals: { debitPaise: number; creditPaise: number };
  /** PDF statements only: did every self-check against the statement's own totals pass, and did the user import despite a failure. */
  checksPassed?: boolean;
  acceptedMismatch?: boolean;
  /** Set when the owner chose to read an already-imported file again: the earlier batch with the same file hash. */
  reimportOf?: string;
}

/** A transaction row exactly as read from a statement. Write-once: the canonical expense may be edited, this never is. */
export interface RawTransaction {
  id: string;
  batchId: string;
  /** 1-based line in the source file. */
  line: number;
  cells: string[];
}

/**
 * The redacted copy of an expense that its owner chose to share with their partner. It lives in the couple space; the
 * private record (with the bank's text, the card used, import details) never leaves the owner's personal space.
 * `id` equals the private record's id, so sharing again after a failed attempt is safe.
 */
export interface SharedExpense {
  id: string;
  /** Account (uid) of the person who shared it. Only they can change or withdraw it. */
  ownerUid: string;
  payerId: string;
  date: string;
  merchant: string;
  amountPaise: Paise;
  /** Only spending-like kinds can be shared: income, transfers and card-bill payments never are. */
  kind: "purchase" | "refund" | "fee";
  categoryId: string;
  /** The category's name when it was shared, so the partner sees it even if their space has no such category. */
  categoryName: string;
  split: SplitConfig;
  /** Only present when the owner chose to show their note. */
  note?: string;
  /** Withdrawn by the owner: kept for history, no longer counted. */
  voided?: boolean;
  createdAt: string;
  updatedAt: string;
}
