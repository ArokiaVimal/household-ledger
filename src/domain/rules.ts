export interface MerchantRule { merchant: string; categoryId: string }

/** First rule whose merchant matches (case-insensitive). Suggestion only; the user confirms in review. */
export function suggestCategory(rules: MerchantRule[], merchant: string, fallback = "uncategorized"): string {
  const m = merchant.trim().toLowerCase();
  return rules.find((r) => r.merchant.trim().toLowerCase() === m)?.categoryId ?? fallback;
}
