import type { Account, TxnKind } from "../types";
import { isSelfTransfer, type SelfIdentity } from "./self";

const UPI_NOISE = /^(upi|dr|cr|ib|imps|neft|rtgs|payment|payments|from|to|via|pay|paid|ref|refno|txn|xx|na)$/i;
const BANK_CODE = /^[A-Z]{3,5}$/; // YESB, HDFC, SBIN, ICIC...

/** Pulls a readable merchant out of typical bank narration: UPI strings, POS/ECOM prefixes, NACH/ECS mandates. */
export function extractMerchant(description: string): string {
  const d = description.replace(/\s+/g, " ").trim();
  if (/^upi[-/ ]/i.test(d)) {
    const parts = d.split(/[-/]/).map((p) => p.trim());
    const pick = parts.find((p) => /[A-Za-z]{3,}/.test(p) && !/^\d+$/.test(p) && !p.includes("@") && !UPI_NOISE.test(p) && !BANK_CODE.test(p));
    if (pick) return tidy(pick);
  }
  const pos = d.match(/^(?:pos|ecom pur|ecom|pur|purchase|ach d|nach|ecs)[-/ :]*(?:\d{3,}[ -/]*)?(.+)$/i);
  if (pos?.[1] && /[A-Za-z]{3,}/.test(pos[1])) return tidy(pos[1]);
  return tidy(d);
}

function tidy(s: string): string {
  const cleaned = s.replace(/[*_]+/g, " ").replace(/\b\d{6,}\b/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 60);
  if (!cleaned) return "Unknown";
  const letters = cleaned.replace(/[^A-Za-z]/g, "");
  const allCaps = letters.length > 0 && letters === letters.toUpperCase();
  return allCaps ? cleaned.toLowerCase().replace(/(^|[\s&(-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : cleaned;
}

// Card bills, however the bank words them: netbanking bill pay ("IB BILLPAY DR", "CC BillPay"), fund transfers to a card, and UPI to a card issuer.
const CC_PAYMENT = /(credit\s*card|cc\s*pay|cc\s*bill\s*pay|card\s*bill|ib\s*bill\s*pay|bill\s*pay\s*dr|fund\s*trf\s*cc|card\s*pay|cardpayment|bill\s*pay.*card|cred\s*club|cred\.club|autopay|billdesk.*card|american\s*e(xpress)?\b|\bamex\b)/i;
const CASH = /(\batm\b|cash\s*(wdl|withdrawal)|\bnfs\b)/i;
const FEE = /(charges?|\bfee\b|\bgst\b|\bigst\b|\bcgst\b|\bsgst\b|annual fee|late (payment|fee)|finance charge|\binterest\b|\bsms\b.*charge|penalty)/i;
const REFUND = /(refund|reversal|\brev\b|cashback|credit voucher|chargeback)/i;
const SALARY = /(salary|\bsal\b|payroll|stipend)/i;
const PAYMENT_RECEIVED = /(payment received|payment\s*-?\s*thank|thank you|autopay|bbps payment|net banking payment|neft payment|credit\s*card\s*payment)/i;
/** On a card: a charge that is really money sent back to your own bank account (HDFC "EXC PYT REFUND TO AC"). Not spending. */
const CARD_TO_BANK = /(exc(ess)?\s*pyt?m?t?\s*refund|refund\s*to\s*a\/?c)/i;

export interface Classified { kind: TxnKind; merchant: string }

/**
 * First guess at what a row is. It only needs to be good enough to pre-fill the review queue: every row is
 * checked by a person before it counts. Credit-card bill payments and transfers are never spending.
 */
export function classifyRow(description: string, direction: "debit" | "credit", accountType: Account["type"], self?: SelfIdentity): Classified {
  const merchant = extractMerchant(description);
  if (accountType === "credit_card") {
    if (direction === "credit") return { kind: PAYMENT_RECEIVED.test(description) ? "cc_payment" : REFUND.test(description) ? "refund" : "refund", merchant };
    if (CARD_TO_BANK.test(description)) return { kind: "transfer", merchant };
    return { kind: FEE.test(description) && !/\b(swiggy|zomato|amazon|uber)\b/i.test(description) ? "fee" : "purchase", merchant };
  }
  // Money moved between your own accounts: not spending and not income, in either direction.
  if (isSelfTransfer(description, self)) return { kind: "transfer", merchant: "Own account transfer" };
  if (direction === "credit") return { kind: REFUND.test(description) ? "refund" : SALARY.test(description) ? "income" : "income", merchant };
  if (CC_PAYMENT.test(description)) return { kind: "cc_payment", merchant };
  if (CASH.test(description)) return { kind: "transfer", merchant };
  if (FEE.test(description)) return { kind: "fee", merchant };
  return { kind: "purchase", merchant };
}
