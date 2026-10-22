// Learning from what you have already verified. Pure. Two things come out of your verified transactions:
//  1. merchant memory: what each merchant is called, which category and kind it belongs to, and whether it sells vouchers, so the next
//     import fills it in without asking. Your own earlier choices are never replaced; AI guesses are upgraded to confirmed.
//  2. lessons: a plain list of the habits found (categories, payment methods, how you split, vouchers), for the person to read.
import { seedMemory, memoryKey } from "./memory";
import type { Account, Category, ExpenseRecord, MerchantMemory, Paise } from "./types";
import { iconByName, type IconKey } from "./icons";

export interface Lesson { topic: "overview" | "merchants" | "payment" | "splits" | "vouchers" | "check"; text: string }
export interface LearnNames { categoryName: (id: string) => string; accountName: (id: string) => string; nameOf: (id: string) => string; voucherName: (id: string) => string; meId: string }
export interface LearnResult {
  /** Memory entries to save (new ones and upgraded ones). */
  memory: MerchantMemory[];
  lessons: Lesson[];
  counts: { verified: number; merchants: number; added: number; upgraded: number; kept: number; conflicts: number };
}

const rupees = (p: Paise) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const top = <T,>(m: Map<T, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = <T,>(m: Map<T, number>, k: T, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const month = (d: string) => new Date(`${d}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });

export function learnFromVerified(records: ExpenseRecord[], existing: MerchantMemory[], n: LearnNames): LearnResult {
  const verified = records.filter((r) => r.status === "reviewed" && !r.excluded);
  const lessons: Lesson[] = [];

  // ---- 1. memory
  const byId = new Map(existing.map((m) => [m.id, m]));
  const candidates = seedMemory(verified);
  const sellers = new Set(verified.filter((r) => r.voucherBrandId).map((r) => memoryKey(r.importSource === "Manual entry" ? r.merchant : r.originalDescription)));
  const out: MerchantMemory[] = [];
  let added = 0, upgraded = 0, kept = 0;
  const mixed: { name: string; cats: string[] }[] = [];
  for (const c of candidates) {
    const cur = byId.get(c.id);
    const entry: MerchantMemory = { ...c, ...(sellers.has(c.key) ? { voucherSeller: true } : {}) };
    if (!cur) { out.push(entry); added++; continue; }
    // Anything you decided yourself stays as you decided it; only the confirmation count grows when history agrees.
    if (cur.source === "user") {
      if (cur.categoryId === c.categoryId && cur.kind === c.kind && (c.confirmed > cur.confirmed || (entry.voucherSeller && !cur.voucherSeller))) { out.push({ ...cur, confirmed: Math.max(cur.confirmed, c.confirmed), lastSeen: c.lastSeen > cur.lastSeen ? c.lastSeen : cur.lastSeen, ...(entry.voucherSeller ? { voucherSeller: true } : {}) }); upgraded++; }
      else kept++;
      continue;
    }
    out.push({ ...cur, ...entry, icon: cur.icon, logo: cur.logo }); upgraded++; // an AI guess becomes a confirmed memory
  }
  // Merchants that were verified under more than one category (worth a look).
  const cats = new Map<string, Map<string, number>>();
  for (const r of verified.filter((x) => x.kind === "purchase" && !x.voucherBrandId)) {
    const key = memoryKey(r.importSource === "Manual entry" ? r.merchant : r.originalDescription) || r.merchant.toLowerCase();
    const m = cats.get(key) ?? new Map<string, number>(); bump(m, n.categoryName(r.categoryId)); cats.set(key, m);
  }
  for (const [key, m] of cats) if (m.size > 1) mixed.push({ name: key, cats: [...m.keys()] });

  // ---- 2. lessons
  const dates = verified.map((r) => r.date).sort();
  const spent = verified.filter((r) => r.kind === "purchase").reduce((s, r) => s + r.amountPaise, 0);
  if (verified.length === 0) {
    lessons.push({ topic: "overview", text: "There are no verified transactions yet, so there is nothing to learn from. Verify some in Transactions and run this again." });
    return { memory: [], lessons, counts: { verified: 0, merchants: 0, added: 0, upgraded: 0, kept: 0, conflicts: 0 } };
  }
  lessons.push({ topic: "overview", text: `Learned from ${plural(verified.length, "verified transaction")} between ${month(dates[0].slice(0, 7))} and ${month(dates[dates.length - 1].slice(0, 7))}: ${rupees(spent)} of purchases across ${plural(candidates.length, "merchant")}.` });

  // merchants -> category
  const perMerchant = new Map<string, { name: string; cat: string; n: number; total: Paise; seller: boolean }>();
  for (const r of verified.filter((x) => x.kind === "purchase")) {
    const k = `${r.merchant.toLowerCase()}|${r.voucherBrandId ? "voucher" : r.categoryId}`;
    const cur = perMerchant.get(k) ?? { name: r.merchant, cat: r.voucherBrandId ? "Vouchers" : n.categoryName(r.categoryId), n: 0, total: 0, seller: !!r.voucherBrandId };
    cur.n++; cur.total += r.amountPaise; perMerchant.set(k, cur);
  }
  const habits = [...perMerchant.values()].sort((a, b) => b.total - a.total).slice(0, 12);
  lessons.push({ topic: "merchants", text: `Remembered: ${habits.map((h) => `${h.name} → ${h.cat}${h.n > 1 ? ` (${h.n}×)` : ""}`).join("; ")}.` });
  const byCat = new Map<string, Paise>();
  for (const r of verified.filter((x) => x.kind === "purchase" && !x.voucherBrandId)) bump(byCat, n.categoryName(r.categoryId), r.amountPaise);
  if (byCat.size) lessons.push({ topic: "merchants", text: `Where the money goes (verified purchases, not counting voucher purchases): ${top(byCat, 5).map(([c, v]) => `${c} ${rupees(v)}`).join(", ")}.` });
  const bills = verified.filter((r) => r.kind === "cc_payment");
  if (bills.length) lessons.push({ topic: "payment", text: `Card bill payments are kept out of spending: ${plural(bills.length, "payment")} totalling ${rupees(bills.reduce((s, r) => s + r.amountPaise, 0))} are filed as Transfers.` });

  // payment methods
  const byAcc = new Map<string, number>();
  for (const r of verified.filter((x) => x.kind === "purchase")) bump(byAcc, n.accountName(r.accountId));
  const [firstAcc, firstN] = top(byAcc, 1)[0] ?? ["", 0];
  const purchases = verified.filter((x) => x.kind === "purchase").length;
  if (firstN) lessons.push({ topic: "payment", text: `Payment methods: ${top(byAcc, 4).map(([a, c]) => `${a} ${c}×`).join(", ")}${purchases && firstN / purchases >= 0.6 ? `. ${firstAcc} is used for ${Math.round((firstN / purchases) * 100)}% of purchases.` : "."}` });
  const srcs = new Map<string, number>();
  for (const r of verified) bump(srcs, /^Pasted text|Manual entry|Captured message/.test(r.importSource) ? r.importSource.split(" (")[0] : "a statement file");
  lessons.push({ topic: "payment", text: `Where they came from: ${top(srcs, 4).map(([s, c]) => `${s} ${c}`).join(", ")}.` });

  // splits
  const sharedRows = verified.filter((r) => r.shared && r.split.participantIds.length > 1);
  if (sharedRows.length) {
    const withWhom = new Map<string, number>();
    for (const r of sharedRows) bump(withWhom, r.split.participantIds.filter((p) => p !== n.meId).map(n.nameOf).sort().join(" + ") || "just you");
    lessons.push({ topic: "splits", text: `${plural(sharedRows.length, "verified transaction")} (${Math.round((sharedRows.length / verified.length) * 100)}%) are shared. Usually with: ${top(withWhom, 3).map(([w, c]) => `${w} ${c}×`).join(", ")}.` });
    const shareCats = new Map<string, number>();
    for (const r of sharedRows) bump(shareCats, n.categoryName(r.categoryId));
    lessons.push({ topic: "splits", text: `Usually shared categories: ${top(shareCats, 4).map(([c, k]) => `${c} (${k})`).join(", ")}.` });
    const mine: number[] = [];
    for (const r of sharedRows) if (r.split.mode === "percent" && r.split.participantIds.length === 2 && r.split.participantIds.includes(n.meId) && r.split.values) { const v = r.split.values[n.meId]; if (typeof v === "number") mine.push(v); }
    if (mine.length) { const common = top(new Map(mine.map((v) => [v, mine.filter((x) => x === v).length])), 1)[0]; lessons.push({ topic: "splits", text: `In two-person percentage splits your usual share is ${(common[0] / 100).toFixed(common[0] % 100 ? 1 : 0)}% (${common[1]} of ${mine.length}).` }); }
    const paidByOther = sharedRows.filter((r) => r.payerId !== n.meId).length;
    lessons.push({ topic: "splits", text: paidByOther === 0 ? `You paid for every shared transaction so far.` : `Someone else paid for ${plural(paidByOther, "shared transaction")}.` });
  } else lessons.push({ topic: "splits", text: "None of the verified transactions are shared, so no split habits yet." });
  const gifts = verified.filter((r) => r.split.gift);
  if (gifts.length) lessons.push({ topic: "splits", text: `${plural(gifts.length, "payment")} (${rupees(gifts.reduce((s, r) => s + r.amountPaise, 0))}) were things you paid for others and do not expect back: ${[...new Set(gifts.map((r) => `${r.merchant} for ${r.split.participantIds.filter((p) => p !== n.meId).map(n.nameOf).join(" + ")}`))].slice(0, 4).join("; ")}.` });
  const personal = verified.filter((r) => r.kind === "purchase" && !r.shared).length;
  if (personal) lessons.push({ topic: "splits", text: `${plural(personal, "purchase")} stay personal (not split with anyone).` });

  // vouchers
  const vb = new Map<string, { n: number; total: Paise }>();
  for (const r of verified.filter((x) => x.voucherBrandId)) { const c = vb.get(r.voucherBrandId!) ?? { n: 0, total: 0 }; c.n++; c.total += r.amountPaise; vb.set(r.voucherBrandId!, c); }
  if (vb.size) lessons.push({ topic: "vouchers", text: `Voucher purchases: ${[...vb].sort((a, b) => b[1].total - a[1].total).map(([id, c]) => `${n.voucherName(id)} ${rupees(c.total)} (${c.n}×)`).join(", ")}. These merchants are remembered as voucher sellers, so each new purchase asks which voucher was bought.` });
  const paidWith = verified.filter((r) => r.paidWithVoucherId);
  if (paidWith.length) lessons.push({ topic: "vouchers", text: `${plural(paidWith.length, "payment")} were made with a voucher or wallet (${[...new Set(paidWith.map((r) => `${r.merchant} via ${n.accountName(r.accountId)}`))].slice(0, 3).join("; ")}); they never count as new spending.` });

  // checks
  const unc = verified.filter((r) => r.kind === "purchase" && !r.voucherBrandId && r.categoryId === "uncategorized");
  if (unc.length) lessons.push({ topic: "check", text: `${plural(unc.length, "verified purchase")} still ${unc.length === 1 ? "has" : "have"} no category: ${[...new Set(unc.map((r) => r.merchant))].slice(0, 5).join(", ")}.` });
  for (const m of mixed.slice(0, 3)) lessons.push({ topic: "check", text: `${m.name} was filed under more than one category (${m.cats.join(", ")}). Your earlier choice stays; decide which one you want.` });
  if (kept) lessons.push({ topic: "check", text: `${kept} remembered merchant${kept === 1 ? " already had" : "s already had"} your own choice and ${kept === 1 ? "was" : "were"} left as ${kept === 1 ? "it is" : "they are"}.` });

  return { memory: out, lessons, counts: { verified: verified.length, merchants: candidates.length, added, upgraded, kept, conflicts: mixed.length } };
}

// ---- icons: the best match for everything that has none yet, with no AI.
const TYPE_ICON: Record<Account["type"], IconKey> = { bank: "landmark", credit_card: "card", upi: "phone", wallet: "wallet", voucher: "ticket", cash: "banknote" };
export interface IconPlan {
  categories: { id: string; icon: IconKey }[];
  accounts: { id: string; icon: IconKey }[];
  merchants: { memory: MerchantMemory; icon?: IconKey; logo?: string }[];
}
/**
 * Only fills what has nothing: a category with no icon gets the name matcher's pick; a payment method with no icon and no brand logo gets
 * one by its type; a remembered merchant with no icon and no logo gets its brand logo if there is one, else the icon of its category.
 */
export function bestIcons(o: { categories: Category[]; accounts: Account[]; memory: MerchantMemory[]; logoFor: (name: string) => string | null }): IconPlan {
  const catIcon = (id: string): IconKey | undefined => { const c = o.categories.find((x) => x.id === id); return (c?.icon as IconKey | undefined) ?? (c ? iconByName(c.name) ?? undefined : undefined); };
  return {
    categories: o.categories.filter((c) => !c.icon).map((c) => ({ id: c.id, icon: iconByName(c.name) ?? "tag" })),
    accounts: o.accounts.filter((a) => !a.icon && !o.logoFor(a.name)).map((a) => ({ id: a.id, icon: TYPE_ICON[a.type] })),
    merchants: o.memory.filter((m) => !m.icon && !m.logo).map((m) => {
      const logo = o.logoFor(m.name)?.replace(/^\/logos\//, "").replace(/\.png$/, "");
      return logo ? { memory: m, logo } : { memory: m, icon: iconByName(m.name) ?? catIcon(m.categoryId) ?? "tag" };
    }),
  };
}
