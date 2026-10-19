// Works out which of the user's payment methods a statement belongs to from the statement's own words, with no AI and
// nothing leaving the server. Issuer names and "credit card" / "savings account" wording are matched against the
// user's methods; anything not clear-cut is returned as "none" or "likely" so a person confirms it.
import type { Account } from "../types";

export interface AccountLite { id: string; name: string; type: Account["type"] }

/** Issuers, banks and UPI apps by the words that identify them in statement text and in payment-method names. */
const ISSUERS: { key: string; words: string[] }[] = [
  { key: "amex", words: ["american express", "amex"] }, { key: "hdfc", words: ["hdfc"] }, { key: "icici", words: ["icici"] },
  { key: "sbi", words: ["sbi", "state bank of india"] }, { key: "axis", words: ["axis bank", "axis"] }, { key: "kotak", words: ["kotak"] },
  { key: "yes", words: ["yes bank"] }, { key: "idfc", words: ["idfc"] }, { key: "indusind", words: ["indusind"] }, { key: "rbl", words: ["rbl"] },
  { key: "federal", words: ["federal bank"] }, { key: "pnb", words: ["punjab national", "pnb"] }, { key: "bob", words: ["bank of baroda"] },
  { key: "citi", words: ["citibank", "citi"] }, { key: "sc", words: ["standard chartered"] }, { key: "hsbc", words: ["hsbc"] },
  { key: "gpay", words: ["google pay", "gpay", "g pay"] }, { key: "phonepe", words: ["phonepe", "phone pe"] }, { key: "paytm", words: ["paytm"] },
  { key: "cred", words: ["cred"] }, { key: "bhim", words: ["bhim"] }, { key: "amazonpay", words: ["amazon pay"] },
];

const wordRe = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "gi");

/** Issuer keys mentioned in a piece of text, each with how often it appears. */
export function issuerHits(text: string): Map<string, number> {
  const hits = new Map<string, number>();
  for (const { key, words } of ISSUERS) {
    let n = 0;
    for (const w of words) n += [...text.matchAll(wordRe(w))].length;
    if (n > 0) hits.set(key, n);
  }
  return hits;
}
export const issuerKeys = (text: string) => [...issuerHits(text).keys()];

/** "credit_card" or "bank" when the wording makes it clear, otherwise null. */
export function statementType(text: string): "credit_card" | "bank" | null {
  const t = text.toLowerCase();
  const count = (res: RegExp[], weight = 1) => res.reduce((s, r) => s + (r.test(t) ? weight : 0), 0);
  const card = count([/credit limit/, /minimum (amount|payment) due/, /total (amount|payment) due/, /payment due date/, /credit card/, /card (number|no)/, /reward points/]);
  const bank = count([/\bifsc\b/, /account (no|number)/, /savings account|current account/, /\bbranch\b/], 1) + count([/narration/, /withdrawal amt|deposit amt/, /chq\.?\s*\/?\s*ref|cheque/], 2);
  if (card >= 2 && card > bank) return "credit_card";
  if (bank >= 2 && bank > card) return "bank";
  return null;
}

export interface Sensed {
  accountId: string | null;
  /** sure: safe to preselect. likely: preselected but worth a glance. none: ask. */
  confidence: "sure" | "likely" | "none";
  reason: string;
  candidates: { id: string; name: string; score: number }[];
}

const GENERIC = new Set(["credit", "card", "bank", "account", "savings", "current", "upi", "debit"]);

export function senseAccount(text: string, accounts: AccountLite[]): Sensed {
  const usable = accounts.filter((a) => a.type !== "cash");
  const hits = issuerHits(text);
  const type = statementType(text);
  const head = issuerHits(text.slice(0, 500));
  const lower = text.toLowerCase();
  const scored = usable.map((a) => {
    const keys = issuerKeys(a.name);
    let score = 0;
    for (const k of keys) if (hits.has(k)) score += (head.has(k) ? 5 : 0) + Math.min(hits.get(k)!, 6);
    for (const tok of a.name.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 5 && !GENERIC.has(x)).slice(0, 2)) if (lower.includes(tok)) score += 1;
    // A statement is never from a UPI app unless it names that app; a clear type mismatch rules a method out.
    if ((a.type === "upi" || a.type === "wallet") && score === 0) score = -10;
    if (type && a.type !== "upi" && a.type !== "wallet" && a.type !== type) score -= 10;
    if (type && a.type === type) score += 2;
    return { id: a.id, name: a.name, score };
  }).sort((x, y) => y.score - x.score);
  const [top, second] = scored;
  const gap = top ? top.score - (second?.score ?? -99) : 0;
  const named = top ? [...hits.keys()].filter((k) => issuerKeys(top.name).includes(k)) : [];
  const why = top ? `The statement mentions ${named.map((k) => ISSUERS.find((i) => i.key === k)!.words[0]).join(" and ")}${type ? ` and reads like a ${type === "credit_card" ? "credit-card" : "bank-account"} statement` : ""}.` : "";
  if (top && top.score >= 7 && gap >= 3) return { accountId: top.id, confidence: "sure", reason: why, candidates: scored.filter((s) => s.score > 0) };
  if (top && top.score >= 4 && gap >= 2) return { accountId: top.id, confidence: "likely", reason: why, candidates: scored.filter((s) => s.score > 0) };
  return { accountId: null, confidence: "none", reason: hits.size > 0 ? "The statement names an issuer, but none of your payment methods is a clear match." : "Could not tell which payment method this is from the text.", candidates: scored.filter((s) => s.score > 0) };
}
