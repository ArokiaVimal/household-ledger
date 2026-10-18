import type { Paise } from "./types";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function formatINR(paise: Paise): string {
  return fmt.format(paise / 100);
}

/** Compact form for chart axes: ₹12.3k */
export function formatINRCompact(paise: Paise): string {
  const r = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  if (r >= 100000) return `${sign}₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `${sign}₹${(r / 1000).toFixed(1)}k`;
  return `${sign}₹${Math.round(r)}`;
}

/** Parse user input like "1,234.5" into integer paise. Returns null if invalid. */
export function parseRupees(input: string): Paise | null {
  const s = input.replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -paise : paise;
}

export function assertPaise(n: number): void {
  if (!Number.isSafeInteger(n)) throw new Error(`Not integer paise: ${n}`);
}
