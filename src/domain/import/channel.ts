// Per-row routing. One statement can mix accounts: a bank statement holds UPI payments made through apps and card-bill
// payments; a UPI statement says which bank paid. This decides, row by row, which payment method a transaction belongs to,
// which bank funded it, and which card a bill payment went to. Heuristic and conservative: it only acts on clear wording.
import type { TxnKind } from "../types";
import { issuerKeys, type AccountLite } from "./sense";

const APP_HINTS: { key: string; re: RegExp }[] = [
  { key: "gpay", re: /\b(gpay|google\s*pay|g\s*pay)\b/i }, { key: "phonepe", re: /\b(phonepe|phone\s*pe)\b/i }, { key: "paytm", re: /\bpaytm\b/i },
  { key: "cred", re: /\bcred(\s*club)?\b|cred\.club/i }, { key: "bhim", re: /\bbhim\b/i }, { key: "amazonpay", re: /amazon\s*pay/i },
];

export interface Channel {
  /** The payment method this row is filed under. */
  accountId: string;
  /** The bank that actually paid, when the row went through a UPI app. */
  fundedBy?: string;
  /** For card-bill payments: the card that was paid. */
  paidCard?: AccountLite;
  /** A clearer merchant name than the bank's text, when the route is known. */
  merchant?: string;
}

export function resolveChannel(description: string, kind: TxnKind, source: AccountLite, accounts: AccountLite[]): Channel {
  const out: Channel = { accountId: source.id };
  const mentioned = issuerKeys(description);

  if (source.type === "bank") {
    // Paid through a UPI app the narration names (e.g. "Payment from PhonePe"): file it under the app, funded by this bank.
    const hint = APP_HINTS.find((h) => h.re.test(description));
    // Prefer the app set up under this very bank ("GPay HDFC UPI" for an HDFC row), else any account for that app.
    const apps = hint ? accounts.filter((a) => a.type === "upi" && issuerKeys(a.name).includes(hint.key)) : [];
    const app = apps.find((a) => a.parentId === source.id) ?? apps.find((a) => !a.parentId) ?? apps[0];
    if (app && kind !== "cc_payment") { out.accountId = app.id; out.fundedBy = source.id; }
    // A card-bill payment: name the card, so it reads "Payment to Amex" and is never counted as spending.
    if (kind === "cc_payment") {
      const cards = accounts.filter((a) => a.type === "credit_card" && issuerKeys(a.name).some((k) => mentioned.includes(k)));
      if (cards.length === 1) { out.paidCard = cards[0]; out.merchant = `Payment to ${cards[0].name}`; }
    }
  } else if (source.type === "upi") {
    // A UPI app's own record often says which bank account paid.
    const bank = accounts.find((a) => a.type === "bank" && issuerKeys(a.name).some((k) => mentioned.includes(k)));
    if (bank) out.fundedBy = bank.id;
  }
  return out;
}
