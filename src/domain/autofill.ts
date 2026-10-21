// Reads a note ("paid 450 to Swiggy yesterday with Varru on gpay") and a merchant's history to pre-fill the add-expense form. Rules only,
// no AI. Everything returned is a suggestion for fields the person has not filled themselves; nothing is saved by this module.
import type { Account, ExpenseRecord, Participant, SplitConfig, TxnKind } from "./types";

export interface NoteContext { today: string; accounts: Account[]; participants: Participant[]; meId: string; }
export interface NoteFacts {
  amountPaise?: number;
  /** YYYY-MM-DD, never in the future. */
  date?: string;
  accountId?: string;
  /** People named as sharing the expense (never you). */
  withIds?: string[];
  /** Someone else paid ("Varru paid", "paid by Varru"). */
  payerId?: string;
  kind?: TxnKind;
  /** The note says it repeats every month. */
  monthly?: boolean;
  /** A card-bill payment names the credit card it pays. */
  paidCardId?: string;
}

const DAY = 86_400_000;
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9₹.,/ ]+/g, " ").replace(/\s+/g, " ").trim()} `;
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`);
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The first amount that is clearly money: marked with ₹ / rs / inr / rupees, or a number after "paid / spent / for / of / cost…". */
export function amountIn(text: string): number | undefined {
  const t = text.toLowerCase();
  const num = "(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)";
  const patterns = [new RegExp(`(?:₹|rs\\.?|inr)\\s*${num}`), new RegExp(`${num}\\s*(?:rupees|rs\\b|inr\\b|₹)`), new RegExp(`\\b(?:paid|pay|spent|spend|bought|cost|costs|bill|worth|for|of|was|is|total)\\s+${num}(?!\\s*(?:%|people|persons|items?|days?|months?|am|pm|st|nd|rd|th|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))`)];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v > 0 && v <= 10_000_000) return Math.round(v * 100);
  }
  // No marked amount: a single plain number that is not part of a date, a count or a time ("Swiggy dinner 450").
  const loose = [...t.matchAll(new RegExp(`(?<![\\w/.:-])${num}(?![\\w/.:-])(\\s+(?:%|people|persons|items?|days?|months?|years?|am|pm|st|nd|rd|th|${MONTHS.join("|")})[a-z]*)?`, "g"))].filter((m) => !m[2] && !new RegExp(`(?:${MONTHS.join("|")})[a-z]*\\s+${m[1]}\\b`).test(t));
  if (loose.length === 1) { const v = Number(loose[0][1].replace(/,/g, "")); if (v >= 1 && v <= 10_000_000) return Math.round(v * 100); }
  return undefined;
}

/** A date named in the note, as of `today`: today, yesterday, a weekday (the last one), or "12 Oct" / "Oct 12" / "12/10". */
export function dateIn(text: string, today: string): string | undefined {
  const t = norm(text);
  const base = dayNum(today);
  if (/ day before yesterday /.test(t)) return isoOf(base - 2 * DAY);
  if (/ yesterday | yday /.test(t)) return isoOf(base - DAY);
  if (/ today /.test(t)) return today;
  const wd = WEEKDAYS.findIndex((w) => new RegExp(` (?:last |on )?${w} `).test(t) || new RegExp(` ${w.slice(0, 3)} `).test(t) && /last|on/.test(t));
  if (wd >= 0) { const cur = new Date(base).getUTCDay(); let back = (cur - wd + 7) % 7; if (back === 0) back = 7; return isoOf(base - back * DAY); }
  const y = Number(today.slice(0, 4));
  let m = t.match(new RegExp(` (\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTHS.join("|")})[a-z]* `)) ?? t.match(new RegExp(` (${MONTHS.join("|")})[a-z]* (\\d{1,2})(?:st|nd|rd|th)? `));
  let d: number | undefined, mo: number | undefined;
  if (m) { const a = Number(m[1]); if (Number.isNaN(a)) { mo = MONTHS.indexOf(m[1].slice(0, 3)); d = Number(m[2]); } else { d = a; mo = MONTHS.indexOf(m[2].slice(0, 3)); } }
  else { m = t.match(/ (\d{1,2})[/-](\d{1,2}) /); if (m) { d = Number(m[1]); mo = Number(m[2]) - 1; } }
  if (d === undefined || mo === undefined || mo < 0 || mo > 11 || d < 1 || d > 31) return undefined;
  let cand = Date.UTC(y, mo, d);
  if (new Date(cand).getUTCMonth() !== mo) return undefined; // 31 Feb
  if (cand > base) cand = Date.UTC(y - 1, mo, d); // a future date in the note means last year's
  return isoOf(cand);
}

const GENERIC = new Set(["card", "credit", "debit", "bank", "upi", "account", "platinum", "travel", "the", "and", "pay", "wallet", "money"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));

/** The payment method a note names ("on gpay", "hdfc card", "cash", "amex"): the account sharing the most distinctive words with the note. */
export function accountIn(text: string, accounts: Account[]): string | undefined {
  const t = norm(text);
  const live = accounts.filter((a) => !a.archived);
  if (/ cash /.test(t)) { const c = live.find((a) => a.type === "cash"); if (c) return c.id; }
  let best: { id: string; score: number } | null = null;
  for (const a of live) {
    const w = words(a.name).concat(a.name.toLowerCase().includes("american express") ? ["amex"] : []);
    const score = w.filter((x) => t.includes(` ${x} `)).length;
    // A sub method (GPay HDFC UPI) also names its bank; mentioning both the app and the bank is the strongest match.
    if (score > 0 && (!best || score > best.score)) best = { id: a.id, score };
  }
  return best?.id;
}

const display = (p: Participant) => (p.nickname?.trim() || p.name).toLowerCase();

/** People the note says share the expense. "with Varru", "Varru and Karthik", "split with…", "between…": a name alone ("gift for Priya") does not count. */
export function peopleIn(text: string, people: Participant[], meId: string): { withIds: string[]; payerId?: string } {
  const t = norm(text);
  const others = people.filter((p) => p.id !== meId);
  const named = others.filter((p) => [display(p), p.name.toLowerCase().split(/\s+/)[0]].some((n) => n.length >= 3 && t.includes(` ${n} `)));
  if (named.length === 0) return { withIds: [] };
  const sharing = / (with|split|shared|sharing|between|each|both|together|halves|half) /.test(t);
  let payerId: string | undefined;
  for (const p of named) {
    const n = [display(p), p.name.toLowerCase().split(/\s+/)[0]].filter((x) => t.includes(` ${x} `));
    if (n.some((x) => new RegExp(` ${x} (paid|pays|covered|treated) `).test(t) || new RegExp(` paid by ${x} `).test(t))) payerId = p.id;
  }
  return { withIds: sharing || payerId ? named.map((p) => p.id) : [], ...(payerId ? { payerId } : {}) };
}

export function kindIn(text: string): TxnKind | undefined {
  const t = norm(text);
  if (/ (refund|refunded|cashback|reversal|reversed) /.test(t)) return "refund";
  if (/ (salary|received|credited|interest|dividend|income|payout) /.test(t)) return "income";
  if (/ (transfer|transferred) /.test(t)) return "transfer";
  return undefined;
}

/** "paid amex bill from hdfc", "credit card bill 48210", "cc payment": a card-bill payment, with the card it names. */
export function cardPaymentIn(text: string, accounts: Account[]): { paidCardId?: string; bankId?: string } | undefined {
  const t = norm(text);
  const live = accounts.filter((a) => !a.archived);
  // "paid amex bill from hdfc bank": the card is named before "from", the bank after it.
  const [before, after] = text.split(/\b(?:from|via|using|through)\b/i);
  const cards = live.filter((a) => a.type === "credit_card");
  const paidCardId = accountIn(before, cards) ?? accountIn(text, cards);
  const phrase = / (credit card|card|cc) (bill|payment|dues?|statement) | (bill|payment) (of|for|to) (the )?(credit )?card | pay(ing)? (my |the )?(credit card|card|cc)/.test(t);
  // A named card plus "bill" or "payment" is enough ("paid amex bill").
  if (!phrase && !(paidCardId && / (bill|payment|dues?) /.test(t))) return undefined;
  const bankId = accountIn(after ?? text, live.filter((a) => a.type === "bank" || a.type === "upi"));
  return { ...(paidCardId ? { paidCardId } : {}), ...(bankId ? { bankId } : {}) };
}

export function readNote(note: string, ctx: NoteContext): NoteFacts {
  if (note.trim().length < 3) return {};
  const cc = cardPaymentIn(note, ctx.accounts);
  const amountPaise = amountIn(note), date = dateIn(note, ctx.today), kind = cc ? "cc_payment" as const : kindIn(note);
  const accountId = cc ? cc.bankId : accountIn(note, ctx.accounts);
  const { withIds, payerId } = peopleIn(note, ctx.participants, ctx.meId);
  const monthly = /\b(every month|monthly|per month|each month)\b/i.test(note);
  return { ...(amountPaise ? { amountPaise } : {}), ...(date ? { date } : {}), ...(accountId ? { accountId } : {}), ...(withIds.length ? { withIds } : {}), ...(payerId ? { payerId } : {}), ...(kind ? { kind } : {}), ...(monthly ? { monthly } : {}), ...(cc?.paidCardId ? { paidCardId: cc.paidCardId } : {}) };
}

/** What you usually do with a merchant, from your approved history: the payment method used most, and the split if the last two were shared the same way. */
export function usualFor(merchant: string, records: ExpenseRecord[]): { accountId?: string; split?: SplitConfig } {
  const m = merchant.trim().toLowerCase();
  if (!m) return {};
  const mine = records.filter((r) => r.status === "reviewed" && r.kind === "purchase" && r.merchant.trim().toLowerCase() === m).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (mine.length === 0) return {};
  const counts = new Map<string, number>();
  for (const r of mine.slice(0, 20)) counts.set(r.accountId, (counts.get(r.accountId) ?? 0) + 1);
  const accountId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [a, b] = mine;
  const same = a && b && a.split.mode !== "personal" && a.split.mode !== "custom" && a.split.mode === b.split.mode && [...a.split.participantIds].sort().join() === [...b.split.participantIds].sort().join();
  return { accountId, ...(same ? { split: structuredClone(a.split) } : {}) };
}
