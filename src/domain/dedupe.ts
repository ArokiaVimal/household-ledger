import type { ExpenseRecord, Paise, Receipt, TxnKind } from "./types";

const CREDIT_KINDS: TxnKind[] = ["refund", "income"];
type Dir = "debit" | "credit";
const dirOfKind = (k?: TxnKind): Dir | undefined => (k ? (CREDIT_KINDS.includes(k) ? "credit" : "debit") : undefined);

export const normalizeMerchant = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(pvt|ltd|india|private|limited|upi|pos)\b/g, " ").replace(/\s+/g, " ").trim();

const merchantsAlike = (a: string, b: string) => {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  return x.length > 2 && y.length > 2 && (x === y || x.includes(y) || y.includes(x));
};

export interface IncomingTxn {
  accountId: string;
  date: string;
  amountPaise: Paise;
  merchant: string;
  referenceId?: string;
  /** Money in or out. A refund of a purchase has the same merchant, date and amount but is NOT a duplicate of it. */
  direction?: Dir;
}

export type DupResult =
  | { status: "exact"; matchId: string }
  | { status: "possible"; matchId: string }
  | { status: "none" };

/**
 * Exact: same account + same bank reference id (re-upload of the same data).
 * Possible: same account, date and amount with alike merchant. Only flagged
 * for review; amount alone never matches, and nothing is merged automatically.
 */
type Existing = Pick<ExpenseRecord, "id" | "accountId" | "date" | "amountPaise" | "merchant" | "referenceId"> & { kind?: TxnKind; direction?: Dir };

export function detectDuplicate(t: IncomingTxn, existing: Existing[]): DupResult {
  if (t.referenceId) {
    const hit = existing.find((e) => e.accountId === t.accountId && e.referenceId === t.referenceId);
    if (hit) return { status: "exact", matchId: hit.id };
  }
  const poss = existing.find(
    (e) => e.accountId === t.accountId && e.date === t.date && e.amountPaise === t.amountPaise && merchantsAlike(e.merchant, t.merchant) && sameDirection(t.direction, e.direction ?? dirOfKind(e.kind)),
  );
  return poss ? { status: "possible", matchId: poss.id } : { status: "none" };
}

export const isFileAlreadyImported = (hash: string, importedHashes: string[]) => importedHashes.includes(hash);

export interface ReceiptMatch {
  recordId: string;
  score: number;
  reasons: string[];
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/**
 * Suggest card transactions for a receipt. Amount must match exactly, and
 * either the merchant is alike or the order id appears in the bank text.
 * Suggestions are ranked; linking is always a manual, reversible action.
 */
export function suggestReceiptMatches(receipt: Receipt, records: ExpenseRecord[]): ReceiptMatch[] {
  const out: ReceiptMatch[] = [];
  for (const r of records) {
    if (r.receiptId || r.amountPaise !== receipt.amountPaise) continue;
    const reasons = ["amount"];
    let score = 40;
    const orderHit = !!receipt.orderId && (r.originalDescription.includes(receipt.orderId) || r.referenceId === receipt.orderId);
    const merchantHit = merchantsAlike(r.merchant, receipt.merchant) || merchantsAlike(r.originalDescription, receipt.merchant);
    if (!orderHit && !merchantHit) continue;
    if (orderHit) { score += 40; reasons.push("order id"); }
    if (merchantHit) { score += 20; reasons.push("merchant"); }
    const d = dayDiff(r.date, receipt.date);
    if (d <= 3) { score += 10 - d * 3; reasons.push(d === 0 ? "same day" : `${d} day(s) apart`); } else continue;
    out.push({ recordId: r.id, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface PlannedRow<T extends IncomingTxn> {
  row: T;
  dup: DupResult;
}

/**
 * Decide what happens to each imported row before anything is staged.
 * exact = skipped (already in the ledger or review queue, or repeated inside the file);
 * possible = staged but flagged; none = staged. Rows within the file also count
 * as existing for later rows so a file repeating a reference id is not double staged.
 */
const sameDirection = (a?: Dir, b?: Dir) => !a || !b || a === b;

export function planImport<T extends IncomingTxn>(rows: T[], existing: Existing[]): PlannedRow<T>[] {
  const seen = [...existing];
  return rows.map((row, i) => {
    const dup = detectDuplicate(row, seen);
    if (dup.status !== "exact") seen.push({ id: `incoming-${i}`, accountId: row.accountId, date: row.date, amountPaise: row.amountPaise, merchant: row.merchant, referenceId: row.referenceId, direction: row.direction });
    return { row, dup };
  });
}
