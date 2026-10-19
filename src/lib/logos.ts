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

/**
 * A brand-coloured badge for well-known places that have no picture file yet: the brand's colour with a short mark. Drawn here (not a
 * copy of anyone's logo) so every common merchant looks distinct; a real logo file in public/logos takes over once it is added.
 */
const BADGES: { re: RegExp; bg: string; fg: string; mark: string }[] = [
  { re: /amazon prime|prime video|prime membership/i, bg: "#00A8E1", fg: "#ffffff", mark: "prime" },
  { re: /\bairtel\b/i, bg: "#E40000", fg: "#ffffff", mark: "a" },
  { re: /\b(hotstar|disney)/i, bg: "#0C1B3A", fg: "#F9D54C", mark: "H" },
  { re: /\bmeesho\b/i, bg: "#F43397", fg: "#ffffff", mark: "m" },
  { re: /\bshell\b/i, bg: "#FBCE07", fg: "#DD1D21", mark: "S" },
  { re: /\b(bharat|bharath)( petroleum)?\b|\bbpcl\b/i, bg: "#FFD500", fg: "#0054A6", mark: "BP" },
  { re: /\bgeetham\b/i, bg: "#2E7D32", fg: "#ffffff", mark: "G" },
  { re: /\ba2b\b|adyar ananda/i, bg: "#F57C00", fg: "#ffffff", mark: "A2B" },
  { re: /iron safa/i, bg: "#0F766E", fg: "#ffffff", mark: "IS" },
  { re: /\binstamart\b/i, bg: "#FC8019", fg: "#ffffff", mark: "i" },
];
export function brandBadge(name: string): { bg: string; fg: string; mark: string } | null {
  const b = BADGES.find((x) => x.re.test(name));
  return b ? { bg: b.bg, fg: b.fg, mark: b.mark } : null;
}
