import type { Paise } from "../types";

export interface ParsedAmount { paise: Paise; negative: boolean; marker: "dr" | "cr" | null }

/**
 * Parses a statement cell like "1,23,456.78", "₹ 1,000", "Rs. 500.5", "(1,000.00)", "-250", "1000.00 Dr", "45 CR".
 * Integer paise only, no floating point. Returns null for blanks and anything ambiguous (more than 2 decimals, junk).
 */
export function parseAmount(input: string | number | null | undefined): ParsedAmount | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  let negative = false;
  let marker: ParsedAmount["marker"] = null;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  const m = s.match(/\s*(dr|cr)\.?$/i);
  if (m) { marker = m[1].toLowerCase() as "dr" | "cr"; s = s.slice(0, m.index).trim(); }
  s = s.replace(/^(?:inr|rs\.?|₹)\s*/i, "").replace(/\s+/g, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.split(".");
  const paise = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return { paise, negative, marker };
}
