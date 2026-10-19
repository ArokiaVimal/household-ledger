// Brand icons are committed static files in public/logos (fetched once from each
// brand's public favicon). The app never requests icons from third parties at runtime.
const LOGOS: Record<string, string> = {
  swiggy: "swiggy", "swiggy money": "swiggy", "amazon pay": "amazon", zepto: "zepto", blinkit: "blinkit", amazon: "amazon", uber: "uber", ola: "ola",
  netflix: "netflix", spotify: "spotify", "hdfc bank": "hdfc", "sbi credit card": "sbi", "icici coral credit card": "icici", "icici bank": "icici", "amex platinum travel": "amex", gpay: "gpay", cred: "cred", "bhim upi": "bhim", paytm: "paytm", "hdfc credit card": "hdfc", "sbi savings": "sbi", "upi (sbi)": "sbi",
  bigbasket: "bigbasket", "indian oil": "iocl", bookmyshow: "bookmyshow", "apollo pharmacy": "apollo",
  decathlon: "decathlon", starbucks: "starbucks", rapido: "rapido", "cult.fit": "cultfit", "act fibernet": "act",
  "cafe coffee day": "ccd", "reliance fresh": "reliance",
};

// A renamed card still gets its bank's picture: "HDFC BizGrow Card" -> hdfc, "SBI OCTANE BPCL Credit Card" -> sbi.
const BY_WORD: [RegExp, string][] = [[/\bhdfc\b/i, "hdfc"], [/\bsbi\b/i, "sbi"], [/\bicici\b/i, "icici"], [/\b(amex|american express)\b/i, "amex"], [/\bgpay\b|google pay/i, "gpay"], [/\bpaytm\b/i, "paytm"], [/\bbhim\b/i, "bhim"], [/\bcred\b/i, "cred"], [/\bamazon\b/i, "amazon"], [/\bswiggy\b/i, "swiggy"]];

export function logoFor(name: string): string | null {
  const key = name.trim().toLowerCase();
  const exact = LOGOS[key];
  if (exact) return `/logos/${exact}.png`;
  const hit = BY_WORD.find(([re]) => re.test(key));
  return hit ? `/logos/${hit[1]}.png` : null;
}
