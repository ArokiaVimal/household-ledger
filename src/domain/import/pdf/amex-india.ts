// American Express (India) credit-card statement. Parsed from text POSITIONS, not from reading order:
//   summary box:  Opening Balance | New Credits | New Debits | Closing Balance | Minimum Payment
//   period line:  "From September 9 to October 9, 2026"   (transaction dates carry no year)
//   table:        Details (date, far left) | description (middle) | Foreign Currency | Amount Rs (right); a credit has
//                 "CR" printed just below its row at the right edge.
// The parser checks itself against the statement's own totals; if they differ the import is blocked until a person agrees.
import { parseAmount } from "../amount";
import { toLines, type PdfLine } from "./lines";
import type { PdfParseResult, PdfRow, PdfPage, StatementCheck, StatementSummary } from "./types";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthNo = (name: string) => MONTHS.findIndex((m) => m === name.toLowerCase()) + 1;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const DATE_CELL = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/i;

const DATE_X_MAX = 60; // transaction date column
const DESC_X_MIN = 70; // description column starts here
const DESC_X_MAX = 335; // the "Foreign Currency" column starts here
const AMOUNT_X_MIN = 440; // amount column
const MARKER_X_MIN = 495; // "CR" sits at the far right
const MARKER_REACH = 20; // a CR belongs to the row at most this far above it

export function detectAmexIndia(pages: PdfPage[]): boolean {
  const text = toLines(pages.slice(0, 1)).map((l) => l.text).join("\n");
  return /american express/i.test(text) && /statement of account/i.test(text);
}

function readPeriod(lines: PdfLine[]): { start?: string; end?: string; endYear?: number; endMonth?: number } {
  for (const l of lines) {
    const m = l.text.match(/from\s+([A-Za-z]+)\s+(\d{1,2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (!m) continue;
    const sm = monthNo(m[1]), em = monthNo(m[3]);
    if (!sm || !em) continue;
    const endYear = Number(m[5]);
    const startYear = sm > em ? endYear - 1 : endYear;
    return { start: iso(startYear, sm, Number(m[2])), end: iso(endYear, em, Number(m[4])), endYear, endMonth: em };
  }
  return {};
}

/** The five figures under "Opening Balance ... Minimum Payment", matched to their headings by horizontal position. */
function readSummary(lines: PdfLine[]): Partial<StatementSummary> {
  const head = lines.findIndex((l) => /opening balance/i.test(l.text) && /closing balance/i.test(l.text));
  if (head < 0) return {};
  const labels = lines[head].items.filter((i) => /balance|credits|debits|payment/i.test(i.text)).map((i) => ({ x: i.x, t: i.text.toLowerCase() }));
  const vals = lines.slice(head + 1, head + 3).find((l) => l.items.filter((i) => parseAmount(i.text)).length >= 4);
  if (!vals) return {};
  const out: Record<string, number> = {};
  const amounts = vals.items.filter((i) => parseAmount(i.text));
  for (const a of amounts) {
    const label = labels.reduce((best, l) => (Math.abs(l.x - a.x) < Math.abs(best.x - a.x) ? l : best), labels[0]);
    const p = parseAmount(a.text)!;
    const credit = vals.items.some((i) => /^cr$/i.test(i.text) && i.x > a.x && i.x - a.x < 45);
    const value = p.paise * (credit ? -1 : 1);
    if (/opening/.test(label.t)) out.openingPaise = value;
    else if (/credits/.test(label.t)) out.newCreditsPaise = value;
    else if (/debits/.test(label.t)) out.newDebitsPaise = value;
    else if (/closing/.test(label.t)) out.closingPaise = value;
    else if (/minimum/.test(label.t)) out.minimumDuePaise = value;
  }
  return out;
}

export function parseAmexIndia(pages: PdfPage[]): PdfParseResult {
  const lines = toLines(pages);
  const period = readPeriod(lines);
  if (!period.end || !period.endYear || !period.endMonth) return { ok: false, error: "Could not find the statement period (\"From … to …\"). This does not look like an Amex India statement." };
  const summary: StatementSummary = { issuer: "American Express (India)", periodStart: period.start, periodEnd: period.end, ...readSummary(lines) };
  const warnings: string[] = [];

  // 1) transaction rows: a date at the far left plus an amount at the right
  const rows: (PdfRow & { y: number })[] = [];
  for (const l of lines) {
    const dateItem = l.items.find((i) => i.x < DATE_X_MAX && DATE_CELL.test(i.text));
    if (!dateItem) continue;
    const amountItem = [...l.items].reverse().find((i) => i.x >= AMOUNT_X_MIN && parseAmount(i.text));
    const m = dateItem.text.match(DATE_CELL)!;
    if (!amountItem) { warnings.push(`Page ${l.page}: a line starting "${dateItem.text}" has no readable amount and was skipped.`); continue; }
    const month = monthNo(m[1]);
    const year = month <= period.endMonth ? period.endYear : period.endYear - 1;
    const desc = l.items.filter((i) => i.x >= DESC_X_MIN && i.x < DESC_X_MAX).map((i) => i.text).join(" ");
    const foreign = l.items.filter((i) => i.x >= DESC_X_MAX && i.x < AMOUNT_X_MIN).map((i) => i.text).join(" ");
    const amount = parseAmount(amountItem.text)!;
    rows.push({
      page: l.page, index: rows.length + 1, y: l.y, date: iso(year, month, Number(m[2])), description: desc, amountPaise: amount.paise,
      direction: "debit", raw: [dateItem.text, desc, amountItem.text, ...(foreign ? [`foreign: ${foreign}`] : [])],
    });
  }

  // 2) "CR" markers: each belongs to the nearest row above it on the same page
  for (const l of lines) {
    for (const it of l.items) {
      if (!/^cr$/i.test(it.text) || it.x < MARKER_X_MIN) continue;
      const row = rows.filter((r) => r.page === l.page && r.y >= l.y - 2 && r.y - l.y <= MARKER_REACH).sort((a, b) => a.y - b.y)[0];
      if (row) { row.direction = "credit"; row.raw.push("CR"); }
    }
  }

  // 3) continuation lines: text in the description column just below a row, with no date and no amount
  for (const l of lines) {
    if (l.items.some((i) => i.x < DATE_X_MAX && DATE_CELL.test(i.text)) || l.items.some((i) => i.x >= AMOUNT_X_MIN && parseAmount(i.text))) continue;
    const first = l.items[0];
    if (first.x < DESC_X_MIN || first.x > DESC_X_MIN + 25) continue;
    const row = rows.filter((r) => r.page === l.page && r.y > l.y && r.y - l.y <= 10).sort((a, b) => a.y - b.y)[0];
    if (row && !/^cr$/i.test(first.text)) row.description = `${row.description} ${l.items.filter((i) => i.x < DESC_X_MAX).map((i) => i.text).join(" ")}`.trim();
  }

  if (rows.length === 0) return { ok: false, error: "No transactions were found in this statement." };
  const out: PdfRow[] = rows.map(({ y: _y, ...r }) => { void _y; return r; });

  // 4) self-checks against the statement's own totals
  const sum = (d: "debit" | "credit") => out.filter((r) => r.direction === d).reduce((s, r) => s + r.amountPaise, 0);
  const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const checks: StatementCheck[] = [];
  const cmp = (name: string, expected: number | undefined, got: number) => {
    if (expected === undefined) { checks.push({ name, ok: false, detail: "The statement's own total could not be read, so this could not be checked." }); return; }
    checks.push({ name, ok: expected === got, detail: expected === got ? `${rs(got)} matches the statement` : `statement says ${rs(expected)}, rows add up to ${rs(got)}` });
  };
  cmp("Debits add up to “New Debits”", summary.newDebitsPaise, sum("debit"));
  cmp("Credits add up to “New Credits”", summary.newCreditsPaise, sum("credit"));
  if (summary.openingPaise !== undefined && summary.newCreditsPaise !== undefined && summary.newDebitsPaise !== undefined && summary.closingPaise !== undefined) {
    const calc = summary.openingPaise - summary.newCreditsPaise + summary.newDebitsPaise;
    checks.push({ name: "Opening − credits + debits = closing", ok: calc === summary.closingPaise, detail: calc === summary.closingPaise ? "the statement's own arithmetic holds" : `calculated ${rs(calc)}, statement says ${rs(summary.closingPaise)}` });
  }
  return { ok: true, summary, rows: out, checks, warnings };
}
