// Reads one bank, card or UPI text message (SMS or email body) into a transaction or a card bill. Deterministic and cautious:
// it only answers when the wording is clear (an amount plus a debit or credit word), and drops OTPs and offers.
// Anything it cannot read comes back as "unknown" so the caller may ask Claude (with the same grounding rules as statements).
import { parseAmount } from "../import/amount";
import { parseStatementDate } from "../import/date";

export type ParsedMessage =
  | { kind: "transaction"; amountPaise: number; direction: "debit" | "credit"; date: string; description: string; referenceId?: string }
  | { kind: "bill"; totalDuePaise: number; dueDate?: string; statementDate?: string }
  | { kind: "ignore"; reason: string }
  | { kind: "unknown" };

const MONEY = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
const DEBIT = /\b(debited|spent|paid|purchase|purchased|withdrawn|withdrawal|sent|debit(?:ed)? of|payment of|charged|txn of)\b/i;
const CREDIT = /\b(credited|received|refund(?:ed)?|deposited|credit of|reversed|reversal)\b/i;
const OTP = /\b(otp|one[\s-]?time password|verification code|do not share|never share|valid for \d+ ?min)\b/i;
const DATE_RE = /\b(\d{1,2}[-\/](?:\d{1,2}|[A-Za-z]{3,9})[-\/]\d{2,4})\b/;
const REF_RE = /(?:upi\s*ref(?:erence)?(?:\s*no)?|ref(?:erence)?(?:\s*no)?|utr|txn\s*id|rrn)\s*[.:#-]?\s*([A-Za-z0-9]{6,22})/i;

const first = (re: RegExp, s: string) => s.match(re)?.[1];
const money = (s: string | undefined) => (s ? parseAmount(s)?.paise : undefined);

/** "Total Amt Due Rs 41,250.00 ... Due Date 05-Oct-26": the FULL amount due, never the minimum. */
function readBill(t: string): ParsedMessage | null {
  const total = money(first(/total\s+(?:amt|amount)\s+(?:due|payable)[^\d₹]{0,25}(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, t) ?? first(/\b(?:total\s+due|amount\s+due|total\s+payable|outstanding)[^\d₹]{0,20}(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i, t));
  if (!total || total <= 0) return null;
  const dueRaw = first(/(?:payment\s+)?due\s+(?:date|on|by)\s*[:\-]?\s*(\d{1,2}[-\/ ](?:\d{1,2}|[A-Za-z]{3,9})[-\/ ,]*\d{2,4})/i, t) ?? first(/\bpay\s+(?:by|before)\s+(\d{1,2}[-\/ ](?:\d{1,2}|[A-Za-z]{3,9})[-\/ ,]*\d{2,4})/i, t);
  const stmtRaw = first(/statement\s+(?:date|dated)\s*[:\-]?\s*(\d{1,2}[-\/ ](?:\d{1,2}|[A-Za-z]{3,9})[-\/ ,]*\d{2,4})/i, t);
  const dueDate = dueRaw ? parseStatementDate(dueRaw.replace(/[ ,]+/g, "-")) ?? undefined : undefined;
  const statementDate = stmtRaw ? parseStatementDate(stmtRaw.replace(/[ ,]+/g, "-")) ?? undefined : undefined;
  return { kind: "bill", totalDuePaise: total, ...(dueDate ? { dueDate } : {}), ...(statementDate ? { statementDate } : {}) };
}

/** Who was paid (or who paid): the words after "to", "at", "towards", "from", "VPA" or "Info:". */
function readCounterparty(t: string, direction: "debit" | "credit"): string {
  const re = direction === "debit"
    ? /(?:\bto\b|\bat\b|\btowards\b|\bvpa\b|info[:\-])\s+([A-Za-z0-9@._&'*\- ]{3,40}?)(?=\s+(?:on|ref|upi|avl|txn|using|via|for|if|not|call|bal|a\/c|dated)\b|[.,;(]|$)/i
    : /(?:\bfrom\b|\bby\b|info[:\-])\s+([A-Za-z0-9@._&'*\- ]{3,40}?)(?=\s+(?:on|ref|upi|avl|txn|using|via|for|if|not|call|bal|a\/c|dated)\b|[.,;(]|$)/i;
  const m = first(re, t)?.replace(/\s+/g, " ").trim();
  if (m && !/^(a\/c|account|your|card|bank)\b/i.test(m)) return m;
  return t.replace(/\s+/g, " ").slice(0, 60);
}

export function parseMessage(raw: string, today: string): ParsedMessage {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return { kind: "ignore", reason: "empty" };
  if (OTP.test(t)) return { kind: "ignore", reason: "one-time password" };
  // A bank's "balance update" notice is information, not a payment: it lists the balance and recent activity, which is recorded elsewhere.
  if (/\b(balance update|inform you about the balance)\b/i.test(t)) return { kind: "ignore", reason: "balance notice" };
  if (!/(?:rs\.?|inr|₹)\s*\d/i.test(t)) return { kind: "ignore", reason: "no amount" };
  const bill = /\b(due|statement)\b/i.test(t) ? readBill(t) : null;
  if (bill) return bill;
  const amounts = [...t.matchAll(MONEY)].map((m) => money(m[1])).filter((n): n is number => !!n && n > 0);
  if (amounts.length === 0) return { kind: "unknown" };
  const d = t.search(DEBIT), c = t.search(CREDIT);
  if (d < 0 && c < 0) return { kind: "ignore", reason: "not a debit or a credit" };
  // An offer such as "Get Rs 500 cashback when you spend" is not a transaction.
  if (/\b(offer|cashback|win|get up to|apply now|pre-?approved|loan of|limit of rs)\b/i.test(t) && !/\b(debited|credited|spent)\b/i.test(t)) return { kind: "ignore", reason: "promotion" };
  const direction: "debit" | "credit" = c >= 0 && (d < 0 || c < d) ? "credit" : "debit";
  const dateRaw = first(DATE_RE, t);
  const date = (dateRaw && parseStatementDate(dateRaw)) || today;
  const referenceId = first(REF_RE, t);
  return { kind: "transaction", amountPaise: amounts[0], direction, date, description: readCounterparty(t, direction), ...(referenceId ? { referenceId } : {}) };
}

/** Quick check used to decide whether an unreadable message is worth asking Claude about. */
export const looksFinancial = (t: string) =>
  /(?:rs\.?|inr|₹)\s*\d/i.test(t) && !OTP.test(t) &&
  /\b(txn|transaction|payment|autopay|auto-?debit|mandate|upi|a\/c|account|card|wallet|emi|due|charged|debit|debited|credit|credited|spent|paid|sent|received|refund)\b/i.test(t) &&
  !(/\bbalance\b/i.test(t) && !/\b(txn|transaction|payment|autopay|mandate|debited|credited|spent)\b/i.test(t));
