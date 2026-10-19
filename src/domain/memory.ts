// Merchant memory: what the app has learned about how this household's statement lines map to names, categories
// and payment types. Pure functions; storage lives behind the Repository. Your own approvals always beat AI guesses.
import { normalizeMerchant } from "./dedupe";
import { extractMerchant } from "./import/classify";
import type { ExpenseRecord, MerchantMemory, TxnKind } from "./types";

/** Document id for a memory entry. */
export const memoryDocId = (key: string) => `mm_${key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "x"}`;

/** Payment processors that prefix the real merchant ("cca*Swiggy", "PayU*Zomato"). */
/** Country and noise words at the end of statement text ("SWIGGY BANGALORE IN"). */
const TAIL_NOISE = new Set(["in", "ind", "inr"]);

const PROCESSORS = new Set(["cca", "payu", "rbl", "razorpay", "rzp", "bd", "billdesk", "paytm", "cashfree", "ccavenue", "pg", "ecom", "pos"]);

/**
 * Stable text for matching one merchant across months: processor prefixes, ids and order numbers are dropped,
 * and only the first words are kept ("SWIGGY BANGALORE 560001" and "cca*Swiggy" both start with "swiggy").
 */
export function memoryKey(description: string): string {
  const words = normalizeMerchant(extractMerchant(description)).split(" ").filter(Boolean);
  while (words.length > 1 && PROCESSORS.has(words[0])) words.shift();
  while (words.length > 1 && TAIL_NOISE.has(words[words.length - 1])) words.pop();
  const clean = words.filter((w) => !/\d/.test(w) || w.length <= 3).slice(0, 4);
  const key = clean.join(" ").slice(0, 80);
  return key === "unknown" ? "" : key;
}

const DEBIT_KINDS: TxnKind[] = ["purchase", "fee", "transfer", "cc_payment"];
const CREDIT_KINDS: TxnKind[] = ["refund", "income", "transfer", "cc_payment"];
/** A debit cannot be a refund and a credit cannot be a purchase. */
export const kindFits = (kind: TxnKind, direction: "debit" | "credit") => (direction === "debit" ? DEBIT_KINDS : CREDIT_KINDS).includes(kind);

/** Exact key first; otherwise the longest remembered key that starts the statement text ("swiggy" for "swiggy instamart"). */
export function lookupMemory(memory: MerchantMemory[], key: string): MerchantMemory | null {
  if (!key) return null;
  const exact = memory.find((m) => m.key === key);
  if (exact) return exact;
  let best: MerchantMemory | null = null;
  for (const m of memory) {
    if (m.key.length >= 4 && key.startsWith(`${m.key} `) && (!best || m.key.length > best.key.length)) best = m;
  }
  return best;
}

/** True when the entry is trustworthy enough to pre-approve: you confirmed it, or Claude said it was sure. */
export const isConfident = (m: MerchantMemory) => m.source === "user" || m.confident;

export interface Learned { key: string; name: string; categoryId: string; kind: TxnKind; date: string; voucherSeller?: boolean }

/** You approved or corrected a row: it becomes (or stays) a confirmed memory, replacing any AI guess or older choice. */
export function learnFromUser(existing: MerchantMemory | null | undefined, l: Learned): MerchantMemory {
  const same = existing?.source === "user" && existing.categoryId === l.categoryId && existing.kind === l.kind;
  // Once a merchant is known to sell vouchers it stays that way, so every new purchase from it asks which voucher was bought.
  const voucherSeller = l.voucherSeller || existing?.voucherSeller;
  return { id: memoryDocId(l.key), key: l.key, name: l.name, categoryId: l.categoryId, kind: l.kind, source: "user", confident: true, confirmed: same ? existing.confirmed + 1 : 1, lastSeen: l.date, ...(voucherSeller ? { voucherSeller: true } : {}) };
}

/** A Claude suggestion is kept so the same merchant is never sent again; it never replaces something you decided. */
export function rememberSuggestion(existing: MerchantMemory | null | undefined, l: Learned & { confident: boolean }): MerchantMemory | null {
  if (existing) return null;
  return { id: memoryDocId(l.key), key: l.key, name: l.name, categoryId: l.categoryId, kind: l.kind, source: "ai", confident: l.confident, confirmed: 0, lastSeen: l.date };
}

/** First-time memory from the history you already approved, so the first AI-assisted import starts with context. */
export function seedMemory(records: ExpenseRecord[]): MerchantMemory[] {
  const groups = new Map<string, ExpenseRecord[]>();
  for (const r of records) {
    if (r.status !== "reviewed") continue;
    const key = memoryKey(r.importSource === "Manual entry" ? r.merchant : r.originalDescription);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: MerchantMemory[] = [];
  for (const [key, rs] of groups) {
    const tally = new Map<string, number>();
    for (const r of rs) tally.set(`${r.categoryId}|${r.kind}`, (tally.get(`${r.categoryId}|${r.kind}`) ?? 0) + 1);
    const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const [categoryId, kind] = top[0].split("|") as [string, TxnKind];
    const latest = [...rs].sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({ id: memoryDocId(key), key, name: latest.merchant.slice(0, 60), categoryId, kind, source: "user", confident: true, confirmed: top[1], lastSeen: latest.date });
  }
  return out;
}
