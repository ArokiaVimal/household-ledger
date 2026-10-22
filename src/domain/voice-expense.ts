// Turns what Claude understood from a spoken expense into things the Add form can use. Pure: no React, Next or Firebase.
// Claude only reports what was SAID (names, a card word, an amount). This file checks those facts against the transcript and matches
// them to the person's own contacts, payment methods and categories. Anything it cannot match with confidence is returned as a
// question for the person, never guessed.
import { issuerKeys } from "./import/sense";

/** What Claude is asked to report. Every field is optional: null means "not said". */
export interface VoiceFacts {
  merchant: string | null;
  /** Rupees, as spoken. */
  amount: number | null;
  /** YYYY-MM-DD. */
  date: string | null;
  /** One of the person's own category names. */
  category: string | null;
  /** A few words for what it was ("Breakfast"). */
  note: string | null;
  /** The OTHER people named, as spoken, never the speaker. */
  people: string[];
  /** "me" (or null) when the speaker paid, otherwise the name of who paid. */
  paidBy: string | null;
  /** How many ways it is split when the speaker says a number ("split by 3"). */
  splitCount: number | null;
  /** The card or app as spoken ("Amex", "HDFC", "GPay"). */
  paymentMethod: string | null;
}

export const EMPTY_FACTS: VoiceFacts = { merchant: null, amount: null, date: null, category: null, note: null, people: [], paidBy: null, splitCount: null, paymentMethod: null };

// ---- numbers said aloud ----

const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Every amount the transcript could mean: digits ("1,200", "12.5", "1.2k", "2 lakh") and number words ("twelve hundred", "three sixty five"). */
export function spokenNumbers(text: string): number[] {
  const out = new Set<number>();
  const t = text.toLowerCase().replace(/₹|rs\.?|rupees?|inr/g, " ");
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|crores?|cr)?\b/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const unit = m[2];
    const mult = !unit ? 1 : unit === "k" || unit === "thousand" ? 1000 : unit.startsWith("l") ? 100_000 : 10_000_000;
    out.add(Math.round(n * mult * 100) / 100);
  }
  // Number words: "twelve hundred", "two thousand five hundred", "three sixty five" (digits read one group at a time).
  const words = t.replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length) {
    const start = i;
    let total = 0, current = 0, seen = false;
    const parts: number[] = [];
    while (i < words.length) {
      const w = words[i];
      if (w in ONES) { current += ONES[w]; seen = true; parts.push(ONES[w]); }
      else if (w in TENS) { current += TENS[w]; seen = true; parts.push(TENS[w]); }
      else if (w === "hundred" && seen) { current = (current || 1) * 100; }
      else if (w === "thousand" && seen) { total += (current || 1) * 1000; current = 0; }
      else if ((w === "lakh" || w === "lac") && seen) { total += (current || 1) * 100_000; current = 0; }
      else if (w === "and" && seen && i + 1 < words.length && (words[i + 1] in ONES || words[i + 1] in TENS)) { /* "five hundred and sixty" */ }
      else break;
      i++;
    }
    if (seen) {
      out.add(total + current);
      // "three sixty five" is 3, 60, 5 read out as 365: when no hundred/thousand word was used, tens and ones that follow each other
      // make one two-digit group ("sixty five" = 65) and the groups are written side by side.
      if (parts.length >= 2 && parts.length <= 4 && i - start === parts.length) {
        const groups: number[] = [];
        for (const p of parts) {
          const last = groups[groups.length - 1];
          if (last !== undefined && last >= 20 && last < 100 && last % 10 === 0 && p < 10) groups[groups.length - 1] = last + p;
          else groups.push(p);
        }
        if (groups.length >= 2) out.add(Number(groups.map(String).join("")));
      }
    } else i = start + 1;
  }
  return [...out].filter((n) => n > 0);
}

// ---- checking what Claude returned ----

const SPEAKER = /^(i|me|myself|we|us|my|mine|you|self)$/i;
const clean = (v: unknown, max: number): string | null => (typeof v === "string" && v.replace(/\s+/g, " ").trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

export interface ValidateCtx { transcript: string; today: string; categoryNames: string[] }
export interface ValidatedFacts { facts: VoiceFacts; warnings: string[] }

/**
 * Keeps only facts that hold up: the amount must really be in what was said, the date must be real and recent, the category must
 * be one of the person's own, names must be real words. Everything else is dropped to "not said" (with a note when it matters).
 */
export function validateFacts(raw: unknown, ctx: ValidateCtx): ValidatedFacts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const warnings: string[] = [];
  const facts: VoiceFacts = { ...EMPTY_FACTS };
  facts.merchant = clean(r.merchant, 60);
  facts.note = clean(r.note, 80);
  facts.paymentMethod = clean(r.paymentMethod, 40);

  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0 && r.amount < 100_000_000 ? Math.round(r.amount * 100) / 100 : null;
  if (amount !== null) {
    if (spokenNumbers(ctx.transcript).some((n) => Math.abs(n - amount) < 0.005)) facts.amount = amount;
    else warnings.push("I could not find the amount you said, so it is left blank. Type it in.");
  }

  const date = clean(r.date, 10);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    const days = (Date.parse(`${ctx.today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
    if (days >= -1 && days <= 3 * 365) facts.date = date;
    else warnings.push(`I ignored the date ${date}. Pick it yourself.`);
  }

  const cat = clean(r.category, 60);
  if (cat) facts.category = ctx.categoryNames.find((n) => n.toLowerCase() === cat.toLowerCase()) ?? null;

  const people = Array.isArray(r.people) ? r.people : [];
  const seen = new Set<string>();
  for (const p of people) {
    const name = clean(p, 40);
    if (!name || SPEAKER.test(name) || !/[a-zऀ-෿]/i.test(name)) continue;
    const k = name.toLowerCase();
    if (!seen.has(k) && seen.size < 8) { seen.add(k); facts.people.push(name); }
  }

  const paidBy = clean(r.paidBy, 40);
  facts.paidBy = !paidBy || SPEAKER.test(paidBy) || paidBy.toLowerCase() === "me" ? null : paidBy;

  facts.splitCount = typeof r.splitCount === "number" && Number.isInteger(r.splitCount) && r.splitCount >= 2 && r.splitCount <= 20 ? r.splitCount : null;
  return { facts, warnings };
}

// ---- matching to the person's own data ----

export interface ContactLite { id: string; name: string; nickname?: string }
export interface AccountLite { id: string; name: string; type: string; parentId?: string; archived?: boolean }
export interface CategoryLite { id: string; name: string }
export interface ResolveCtx { meId: string; contacts: ContactLite[]; accounts: AccountLite[]; categories: CategoryLite[] }

export interface PersonQuestion { spoken: string; options: { id: string; name: string }[] }

/** What to put in the Add form, and what still needs the person's answer. */
export interface VoiceFill {
  merchant?: string;
  amountPaise?: number;
  date?: string;
  categoryId?: string;
  note?: string;
  /** Matched people other than you. The split is you plus these, shared equally. */
  withIds: string[];
  payerId?: string;
  accountId?: string;
  /** Names that are not in your contacts: offer to add them. */
  unknownPeople: string[];
  /** A name that matches more than one contact. */
  ambiguousPeople: PersonQuestion[];
  /** The card words match more than one payment method: show them all and ask. */
  accountOptions: { id: string; name: string }[];
  /** Who paid, when that name is not in your contacts. */
  unknownPayer?: string;
  /** A number of ways was said ("split by 3"), so share equally instead of using a usual ratio. */
  equalSplit: boolean;
  warnings: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ऀ-෿\s]/g, " ").replace(/\s+/g, " ").trim();

/** One edit apart (insert, delete or change one letter): "varu" ~ "varru". Only for names of 4+ letters, so short names never blur together. */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

/** Finds the contact(s) a spoken name could mean: exact name or nickname first, then first name, then a clear prefix, then one letter off. */
export function matchContacts(spoken: string, contacts: ContactLite[], excludeId?: string): ContactLite[] {
  const q = norm(spoken);
  if (!q) return [];
  const pool = contacts.filter((c) => c.id !== excludeId);
  const keys = (c: ContactLite) => [norm(c.name), c.nickname ? norm(c.nickname) : ""].filter(Boolean);
  const tiers: ((c: ContactLite) => boolean)[] = [
    (c) => keys(c).includes(q),
    (c) => keys(c).some((k) => k.split(" ")[0] === q.split(" ")[0] && (q.split(" ").length === 1 || k === q)),
    (c) => q.length >= 3 && keys(c).some((k) => k.split(" ").some((w) => w.startsWith(q.split(" ")[0]))),
    (c) => keys(c).some((k) => oneEdit(k.split(" ")[0], q.split(" ")[0])),
  ];
  for (const tier of tiers) { const hit = pool.filter(tier); if (hit.length) return hit; }
  return [];
}

/** The payment methods a spoken card or app could mean ("Amex", "HDFC", "GPay", or part of its name). Only live ones. */
export function matchAccounts(spoken: string, accounts: AccountLite[]): AccountLite[] {
  const live = accounts.filter((a) => !a.archived);
  const q = norm(spoken);
  if (!q) return [];
  const issuers = issuerKeys(spoken);
  const byName = live.filter((a) => norm(a.name) === q);
  if (byName.length === 1) return byName;
  const generic = ["card", "credit", "debit", "bank", "account", "the", "via", "with", "my", "paid", "using", "used", "pay"];
  const words = q.split(" ").filter((w) => w.length >= 3 && !generic.includes(w));
  if (issuers.length > 0) {
    const hit = live.filter((a) => issuerKeys(a.name).some((k) => issuers.includes(k)));
    if (hit.length > 1) {
      // "Amex Platinum": a word that only some of the matching cards have narrows it down.
      const extra = words.filter((w) => hit.some((a) => norm(a.name).includes(w)) && !hit.every((a) => norm(a.name).includes(w)));
      const narrowed = extra.length ? hit.filter((a) => extra.every((w) => norm(a.name).includes(w))) : [];
      if (narrowed.length) return narrowed;
    }
    if (hit.length) return hit;
  }
  if (words.length === 0) return [];
  return live.filter((a) => words.every((w) => norm(a.name).includes(w)));
}

/** Matches Claude's facts against the person's data. The result is what to put in the form plus the open questions. */
export function resolveVoice(facts: VoiceFacts, ctx: ResolveCtx, warnings: string[] = []): VoiceFill {
  const fill: VoiceFill = { withIds: [], unknownPeople: [], ambiguousPeople: [], accountOptions: [], equalSplit: facts.splitCount !== null, warnings: [...warnings] };
  if (facts.merchant) fill.merchant = facts.merchant;
  if (facts.note) fill.note = facts.note;
  if (facts.amount !== null) fill.amountPaise = Math.round(facts.amount * 100);
  if (facts.date) fill.date = facts.date;
  if (facts.category) { const c = ctx.categories.find((x) => x.name.toLowerCase() === facts.category!.toLowerCase()); if (c) fill.categoryId = c.id; }

  const taken = new Set<string>();
  for (const spoken of facts.people) {
    const hits = matchContacts(spoken, ctx.contacts, ctx.meId);
    if (hits.length === 1) { if (!taken.has(hits[0].id)) { taken.add(hits[0].id); fill.withIds.push(hits[0].id); } }
    else if (hits.length > 1) fill.ambiguousPeople.push({ spoken, options: hits.map((h) => ({ id: h.id, name: h.name })) });
    else fill.unknownPeople.push(spoken);
  }

  if (facts.paidBy) {
    const hits = matchContacts(facts.paidBy, ctx.contacts, ctx.meId);
    if (hits.length === 1) { fill.payerId = hits[0].id; if (!taken.has(hits[0].id)) { taken.add(hits[0].id); fill.withIds.push(hits[0].id); } }
    else fill.unknownPayer = facts.paidBy;
  }

  if (facts.paymentMethod) {
    const hits = matchAccounts(facts.paymentMethod, ctx.accounts);
    if (hits.length === 1) fill.accountId = hits[0].id;
    else if (hits.length > 1) fill.accountOptions = hits.map((a) => ({ id: a.id, name: a.name }));
    else fill.warnings.push(`I could not match "${facts.paymentMethod}" to one of your payment methods. Pick it below.`);
  }

  // "Split by 3" should agree with the people named (you plus the others).
  if (facts.splitCount !== null) {
    const named = 1 + facts.people.length + (facts.paidBy && !facts.people.some((p) => norm(p) === norm(facts.paidBy!)) ? 1 : 0);
    if (named !== facts.splitCount) fill.warnings.push(`You said split ${facts.splitCount} ways, but I heard ${named} ${named === 1 ? "person" : "people"} including you. Check who is in the split.`);
  }
  return fill;
}
