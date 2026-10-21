// Brand icons are committed static files in public/logos (fetched once from each
// brand's public favicon). The app never requests icons from third parties at runtime.
const LOGOS: Record<string, string> = {
  swiggy: "swiggy", "swiggy money": "swiggy", "amazon pay": "amazon", zepto: "zepto", blinkit: "blinkit", amazon: "amazon", uber: "uber", ola: "ola",
  netflix: "netflix", spotify: "spotify", "hdfc bank": "hdfc", "sbi credit card": "sbi", "icici coral credit card": "icici", "icici bank": "icici", "amex platinum travel": "amex", gpay: "gpay", cred: "cred", "bhim upi": "bhim", paytm: "paytm", "hdfc credit card": "hdfc", "sbi savings": "sbi", "upi (sbi)": "sbi",
  bigbasket: "bigbasket", "indian oil": "iocl", bookmyshow: "bookmyshow", "apollo pharmacy": "apollo",
  decathlon: "decathlon", starbucks: "starbucks", rapido: "rapido", "cult.fit": "cultfit", "act fibernet": "act",
  "cafe coffee day": "ccd", "reliance fresh": "reliance",
  airtel: "airtel", hotstar: "hotstar", "disney hotstar": "hotstar", jiohotstar: "hotstar", "amazon prime": "primevideo", "prime video": "primevideo", meesho: "meesho", shell: "shell",
  "bharat petroleum": "bpcl", bpcl: "bpcl", instamart: "swiggy", myntra: "myntra", shopwise: "shopwise",
};

// A renamed card still gets its bank's picture: "HDFC BizGrow Card" -> hdfc, "SBI OCTANE BPCL Credit Card" -> sbi.
const BY_WORD: [RegExp, string][] = [[/\bhdfc\b/i, "hdfc"], [/\bsbi\b/i, "sbi"], [/\bicici\b/i, "icici"], [/\b(amex|american express)\b/i, "amex"], [/\bgpay\b|google pay/i, "gpay"], [/\bpaytm\b/i, "paytm"], [/\bbhim\b/i, "bhim"], [/\bcred\b/i, "cred"], [/amazon prime|prime video/i, "primevideo"], [/\bamazon\b/i, "amazon"], [/\bswiggy\b|\binstamart\b/i, "swiggy"], [/\bairtel\b/i, "airtel"], [/\b(hotstar|disney)/i, "hotstar"], [/\bmeesho\b/i, "meesho"], [/\bshell\b/i, "shell"], [/\b(bharat|bharath)( petroleum)?\b|\bbpcl\b/i, "bpcl"]];

/** Every logo file that exists in public/logos. AI may only point at one of these, and a person can pick one; nothing is fetched from outside. */
export const LOGO_KEYS = ["act", "airtel", "amazon", "amex", "apollo", "bhim", "bigbasket", "blinkit", "bookmyshow", "bpcl", "ccd", "cred", "cultfit", "decathlon", "gpay", "hdfc", "hotstar", "icici", "iocl", "meesho", "myntra", "netflix", "ola", "paytm", "primevideo", "rapido", "reliance", "sbi", "shell", "shopwise", "spotify", "starbucks", "swiggy", "uber", "zepto"] as const;
export type LogoKey = (typeof LOGO_KEYS)[number];
export const isLogoKey = (v: unknown): v is LogoKey => typeof v === "string" && (LOGO_KEYS as readonly string[]).includes(v);
export const logoSrc = (key: string) => `/logos/${key}.png`;

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
  { re: /\bgeetham\b/i, bg: "#2E7D32", fg: "#ffffff", mark: "G" },
  { re: /\ba2b\b|adyar ananda/i, bg: "#F57C00", fg: "#ffffff", mark: "A2B" },
  { re: /iron safa/i, bg: "#0F766E", fg: "#ffffff", mark: "IS" },
];
export function brandBadge(name: string): { bg: string; fg: string; mark: string } | null {
  const b = BADGES.find((x) => x.re.test(name));
  return b ? { bg: b.bg, fg: b.fg, mark: b.mark } : null;
}
