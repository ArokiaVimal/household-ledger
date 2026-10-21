import { rootOf } from "./accounts";
import type { Account, ExpenseRecord } from "./types";

/**
 * Whether a payment went through UPI, read from the bank's own text (which is never edited), so it also works for rows saved long ago.
 *   ICICI bank   "UPI/Shop name/shop@ybl/note/YES BANK/..."
 *   HDFC bank    "UPI-SHOP NAME-shop@ybl-HDFC0000000-..."
 *   ICICI card   "UPI-663096426370-Shop name"
 * A payment filed under a UPI app (GPay, PhonePe...) counts too.
 */
const UPI_WORD = /(^|[\s/\-:])UPI([\s/\-:]|$)/i;

export function isUpiPayment(r: Pick<ExpenseRecord, "originalDescription" | "accountId">, accounts: Account[]): boolean {
  if (UPI_WORD.test(r.originalDescription)) return true;
  return accounts.find((a) => a.id === r.accountId)?.type === "upi";
}

/** Where the money came from: your bank account (UPI apps sit under a bank) or a credit card. Cash and wallets are neither. */
export function sourceOf(r: Pick<ExpenseRecord, "accountId">, accounts: Account[]): "bank" | "card" | "other" {
  const acc = accounts.find((a) => a.id === rootOf(accounts, r.accountId)) ?? accounts.find((a) => a.id === r.accountId);
  return acc?.type === "credit_card" ? "card" : acc?.type === "bank" || acc?.type === "upi" ? "bank" : "other";
}
