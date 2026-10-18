// Brand icons are committed static files in public/logos (fetched once from each
// brand's public favicon). The app never requests icons from third parties at runtime.
const LOGOS: Record<string, string> = {
  swiggy: "swiggy", zepto: "zepto", blinkit: "blinkit", amazon: "amazon", uber: "uber", ola: "ola",
  netflix: "netflix", spotify: "spotify", "hdfc bank": "hdfc", "sbi credit card": "sbi", "icici coral credit card": "icici", "icici bank": "icici", "amex platinum travel": "amex", gpay: "gpay", cred: "cred", "bhim upi": "bhim", paytm: "paytm", "hdfc credit card": "hdfc", "sbi savings": "sbi", "upi (sbi)": "sbi",
  bigbasket: "bigbasket", "indian oil": "iocl", bookmyshow: "bookmyshow", "apollo pharmacy": "apollo",
  decathlon: "decathlon", starbucks: "starbucks", rapido: "rapido", "cult.fit": "cultfit", "act fibernet": "act",
  "cafe coffee day": "ccd", "reliance fresh": "reliance",
};

export function logoFor(name: string): string | null {
  const f = LOGOS[name.trim().toLowerCase()];
  return f ? `/logos/${f}.png` : null;
}
