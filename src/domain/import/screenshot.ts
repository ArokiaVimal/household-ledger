// What to do with payments read from a screenshot. Pure functions, no network.
// A payment that is already in your records (same amount, a close date) is matched to it instead of being added twice; for a
// voucher order that means tagging the existing card transaction with the voucher brand. Failed orders never become anything.
import type { ExpenseRecord, VoucherBrand } from "../types";

export interface ShotLike {
  date: string;
  merchant: string;
  product?: string;
  amountPaise: number;
  direction: "debit" | "credit";
  status: "done" | "failed" | "pending";
  voucherBrand?: string;
  faceValuePaise?: number;
  orderId?: string;
}

export type ShotPlan =
  | { item: ShotLike; action: "skip"; why: string }
  | { item: ShotLike; action: "tag"; record: ExpenseRecord }
  | { item: ShotLike; action: "add" };

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/** How far apart the order date and the card's posting date may be. Cards post a day or two late. */
export const MATCH_WINDOW_DAYS = 4;

/**
 * One plan per payment on the screen. Failed and cancelled orders are skipped. A payment with the same amount as an existing
 * purchase within the window is matched to the closest one, each record used once. Anything left over is new.
 */
export function planShots(items: ShotLike[], records: ExpenseRecord[], window = MATCH_WINDOW_DAYS): ShotPlan[] {
  const taken = new Set<string>();
  const out: ShotPlan[] = [];
  const pool = records.filter((r) => r.kind === "purchase" && !r.paidWithVoucherId);
  // Match the most constrained payments first (fewest candidates), so two orders of the same amount do not steal each other's row.
  const order = items.map((item, i) => ({ item, i })).sort((a, b) => candidates(a.item, pool, window).length - candidates(b.item, pool, window).length || a.i - b.i);
  const planned = new Map<number, ShotPlan>();
  for (const { item, i } of order) {
    if (item.status === "failed") { planned.set(i, { item, action: "skip", why: "Failed order" }); continue; }
    if (item.status === "pending") { planned.set(i, { item, action: "skip", why: "Still processing" }); continue; }
    if (item.direction !== "debit") { planned.set(i, { item, action: "add" }); continue; }
    const hit = candidates(item, pool, window).filter((r) => !taken.has(r.id)).sort((a, b) => days(a.date, item.date) - days(b.date, item.date) || a.id.localeCompare(b.id))[0];
    if (hit) { taken.add(hit.id); planned.set(i, { item, action: "tag", record: hit }); } else planned.set(i, { item, action: "add" });
  }
  items.forEach((_, i) => out.push(planned.get(i)!));
  return out;
}

function candidates(item: ShotLike, pool: ExpenseRecord[], window: number): ExpenseRecord[] {
  if (item.status !== "done" || item.direction !== "debit") return [];
  return pool.filter((r) => r.amountPaise === item.amountPaise && days(r.date, item.date) <= window);
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["pay", "money", "gift", "card", "voucher", "egift"].includes(w));

/** The voucher brand you already have for a name on the screen ("Amazon Pay" finds "Amazon"), or null. */
export function brandFor(name: string | undefined, brands: VoucherBrand[]): VoucherBrand | null {
  if (!name?.trim()) return null;
  const n = name.trim().toLowerCase();
  const exact = brands.find((b) => b.name.toLowerCase() === n);
  if (exact) return exact;
  const w = words(name);
  return w.length ? brands.find((b) => { const bw = words(b.name); return bw.length > 0 && bw.some((x) => w.includes(x)); }) ?? null : null;
}

/** A short note for a record, such as "₹5,000 Amazon Pay e-gift card · order A0HMRKQBWT5T", added after any note already there. */
export function shotNote(item: ShotLike, existing?: string): string {
  const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const bits = [item.faceValuePaise ? `${rupees(item.faceValuePaise)} ${item.voucherBrand ?? "voucher"} e-gift card` : item.product ?? "", item.orderId ? `order ${item.orderId}` : ""].filter(Boolean);
  const line = bits.join(" · ");
  if (!line) return existing ?? "";
  if (existing?.includes(line)) return existing;
  return [existing?.trim(), line].filter(Boolean).join(" · ").slice(0, 1000);
}
