// Category and merchant guesses for the add-expense form, from what the person typed and their own history. Rules only, no AI.
// A guess is a pre-fill the person can change; nothing here is saved by itself.
import { suggestCategory as fromRules, type MerchantRule } from "./rules";
import type { Category, ExpenseRecord } from "./types";

export interface CategoryGuess { categoryId: string; reason: "history" | "rule" | "keyword"; /** What it was based on, to show in the form ("milk in your note"). */ detail: string }

/** Everyday words mapped to the category they usually mean. Resolved against the person's OWN categories (by id, then by name), so a renamed or deleted category is simply skipped. */
const GROUPS: { words: RegExp; ids: string[]; name: RegExp }[] = [
  { words: /\b(swiggy|zomato|food delivery|biryani|pizza|burger|dominos|domino's|kfc|mcdonald'?s|ordered food|takeaway)\b/i, ids: ["food_delivery"], name: /delivery/i },
  { words: /\b(restaurant|cafe|café|coffee|dinner|lunch|breakfast|brunch|starbucks|ccd|bar|pub|drinks|eating out|dining|tea)\b/i, ids: ["restaurants"], name: /restaurant|cafe|dining/i },
  { words: /\b(grocer(y|ies)|bigbasket|zepto|blinkit|instamart|dmart|vegetables?|fruits?|milk|eggs|atta|rice|supermarket|provisions?)\b/i, ids: ["groceries"], name: /grocer/i },
  { words: /\b(petrol|diesel|fuel|bpcl|iocl|hpcl|indian oil|cng)\b/i, ids: ["fuel"], name: /fuel|petrol/i },
  { words: /\b(uber|ola|rapido|cab|taxi|auto|metro|bus|train ticket|parking|toll|fastag|commute)\b/i, ids: ["transport"], name: /transport|travel/i },
  { words: /\b(netflix|spotify|hotstar|prime video|youtube premium|subscription|icloud|google one|chatgpt)\b/i, ids: ["subscriptions", "entertainment"], name: /subscription|entertain/i },
  { words: /\b(movie|bookmyshow|concert|game|gaming|theatre)\b/i, ids: ["entertainment"], name: /entertain/i },
  { words: /\b(electricity|eb bill|tneb|bescom|water bill|gas bill|broadband|wifi|internet|airtel|jio|vi recharge|recharge|mobile bill|dth|utility|utilities)\b/i, ids: ["utilities"], name: /utilit|bill/i },
  { words: /\b(rent|maintenance|society|housekeeping|maid|plumber|electrician|repair|furniture)\b/i, ids: ["rent"], name: /rent|household|home/i },
  { words: /\b(doctor|hospital|pharmacy|medicine|medicines|apollo|clinic|dental|lab test|gym|cult|fitness|health|checkup)\b/i, ids: ["health"], name: /health|medic/i },
  { words: /\b(amazon|flipkart|myntra|ajio|nykaa|shopping|clothes|shirt|shoes|decathlon|gift|electronics)\b/i, ids: ["shopping"], name: /shop/i },
  { words: /\b(flight|hotel|irctc|makemytrip|goibibo|airbnb|holiday|vacation|trip|resort|booking)\b/i, ids: ["travel"], name: /travel|trip/i },
  { words: /\b(insurance|premium|lic|policy)\b/i, ids: ["insurance"], name: /insur/i },
  { words: /\b(emi|loan|instalment|installment|credit card bill)\b/i, ids: ["emi"], name: /emi|loan/i },
  { words: /\b(bank charges?|annual fee|late fee|gst|processing fee|penalty|forex)\b/i, ids: ["fees"], name: /fee|charge/i },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const notOther = (c: string) => c && c !== "uncategorized";

/**
 * The most likely category for what is being entered. In order: what you usually file this merchant under (your approved history),
 * then your own merchant rules, then everyday words in the merchant or the note. Returns null when nothing fits well.
 */
export function inferCategory(i: { merchant: string; notes: string; records: ExpenseRecord[]; rules: MerchantRule[]; categories: Category[] }): CategoryGuess | null {
  const has = (id: string) => i.categories.some((c) => c.id === id);
  const m = norm(i.merchant);
  if (m) {
    const counts = new Map<string, number>();
    for (const r of i.records) if (r.status === "reviewed" && norm(r.merchant) === m && notOther(r.categoryId) && has(r.categoryId)) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) return { categoryId: top[0], reason: "history", detail: `you usually file ${i.merchant.trim()} here` };
    const rule = fromRules(i.rules, i.merchant, "");
    if (rule && notOther(rule) && has(rule)) return { categoryId: rule, reason: "rule", detail: `your rule for ${i.merchant.trim()}` };
  }
  const note = i.notes.trim();
  for (const [text, where] of [[note, "note"], [i.merchant, "merchant"]] as const) {
    if (!text) continue;
    for (const g of GROUPS) {
      const hit = text.match(g.words);
      if (!hit) continue;
      const cat = g.ids.map((id) => i.categories.find((c) => c.id === id)).find(Boolean) ?? i.categories.find((c) => g.name.test(c.name) && c.id !== "uncategorized");
      if (cat) return { categoryId: cat.id, reason: "keyword", detail: `“${hit[0]}” in your ${where}` };
    }
  }
  return null;
}

/**
 * A merchant named in the note ("Swiggy dinner with Varru"): the longest known merchant name that appears as whole words.
 * `known` should be the person's own merchants plus a few common names; matching is case-insensitive and ignores very short names.
 */
export function merchantFromNotes(notes: string, known: string[]): string | null {
  const text = ` ${norm(notes)} `;
  if (text.trim().length < 3) return null;
  let best: string | null = null;
  for (const name of known) {
    const n = norm(name);
    if (n.length < 3 || !text.includes(` ${n} `)) continue;
    if (!best || n.length > norm(best).length) best = name;
  }
  return best;
}
