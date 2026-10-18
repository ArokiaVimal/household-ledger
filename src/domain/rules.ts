import { normalizeMerchant } from "./dedupe";

export interface MerchantRule { merchant: string; categoryId: string }

/**
 * First rule whose merchant matches. An exact (case-insensitive) match wins; otherwise a rule matches when its
 * name appears inside the statement text ("Swiggy" matches "SWIGGY BANGALORE IN"), ignoring very short names.
 * Suggestion only; the user confirms in review.
 */
export function suggestCategory(rules: MerchantRule[], merchant: string, fallback = "uncategorized"): string {
  const m = merchant.trim().toLowerCase();
  const exact = rules.find((r) => r.merchant.trim().toLowerCase() === m);
  if (exact) return exact.categoryId;
  const n = normalizeMerchant(merchant);
  const loose = rules.find((r) => {
    const rn = normalizeMerchant(r.merchant);
    return rn.length >= 4 && (` ${n} `.includes(` ${rn} `) || n.startsWith(rn));
  });
  return loose?.categoryId ?? fallback;
}
