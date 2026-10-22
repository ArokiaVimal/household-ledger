// HDFC Bank credit-card statement (Biz Grow, Regalia, Millennia and the like). Parsed from text POSITIONS, not reading order:
//   summary:  Previous dues − Payments/credits received + Purchases/debit + Finance charges = Total amount due
//   table:    DATE & TIME ("19/09/2026| 14:54") | TRANSACTION DESCRIPTION | REWARDS | AMOUNT ("C" is the rupee sign)
// Direction: a payment or credit has a "+" printed just before its amount; everything else (purchases, fees, GST lines, a refund of an
// excess payment to your bank account) is a debit. On page 1 the description starts a little above the line with the date and amount and
// continues a little below it, so each description line goes to the nearest dated line. The printed total is rounded to the rupee, so the
// last check allows a difference under ₹1.
import { parseAmount } from "../amount";
import { toLines, type PdfLine } from "./lines";
import type { PdfPage, PdfParseResult, PdfRow, StatementCheck, StatementSummary } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const DATE_CELL = /^(\d{2})\/(\d{2})\/(\d{4})\b/;
const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;
const MAX_LINE_GAP = 9; // a description line belongs to a dated line at most this far away
const PLUS_X_MIN = 495; // the "+" that marks a credit sits next to the amount, far right; reward points ("+ 4") are further left

export function detectHdfcCard(pages: PdfPage[]): boolean {
  const text = toLines(pages.slice(0, 1)).map((l) => l.text).join("\n");
  return /hdfc bank/i.test(text) && /credit card/i.test(text) && /billing period/i.test(text) && /statement date/i.test(text);
}

/** "19 Oct, 2026" anywhere in a piece of text. */
function shortDate(text: string): string | undefined {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  const mo = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  return m && mo ? `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}` : undefined;
}

const amountsIn = (l: PdfLine) => l.items.filter((i) => /^[\d,]+\.\d{2}$/.test(i.text)).map((i) => ({ x: i.x, paise: parseAmount(i.text)!.paise }));

export function parseHdfcCard(pages: PdfPage[]): PdfParseResult {
  const lines = toLines(pages);
  const warnings: string[] = [];

  // ---- period and summary
  const periodLine = lines.find((l) => /billing period/i.test(l.text));
  const dates = periodLine ? [...periodLine.text.matchAll(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/g)].map((m) => shortDate(m[0])) : [];
  const stmtLine = lines.find((l) => /statement date/i.test(l.text));
  const periodEnd = dates[1] ?? (stmtLine ? shortDate(stmtLine.text) : undefined);
  const periodStart = dates[0];
  const headIdx = lines.findIndex((l) => /previous statement dues/i.test(l.text));
  const values = headIdx >= 0 ? lines.slice(headIdx, headIdx + 6).find((l) => amountsIn(l).length >= 5) : undefined;
  const v = values ? amountsIn(values).map((a) => a.paise) : [];
  const [previous, payments, purchases, finance, total] = v;
  const dueIdx = lines.findIndex((l) => /minimum due/i.test(l.text) && /due date/i.test(l.text));
  const dueLine = dueIdx >= 0 ? lines.slice(dueIdx, dueIdx + 4).find((l) => amountsIn(l).length >= 1 && shortDate(l.text)) : undefined;
  const minimum = dueLine ? amountsIn(dueLine)[0]?.paise : undefined;
  const dueDate = dueLine ? shortDate(dueLine.text) : undefined;
  if (!periodEnd) return { ok: false, error: "Could not find the billing period. This does not look like an HDFC card statement." };

  // ---- the transaction table, page by page
  const dated: { page: number; y: number; date: string; line: PdfLine; descX: number; amountX: number }[] = [];
  for (const p of pages) {
    const pl = lines.filter((l) => l.page === p.number);
    const header = pl.find((l) => l.items.some((i) => /transaction description/i.test(i.text)));
    if (!header) continue;
    const descX = header.items.find((i) => /transaction description/i.test(i.text))!.x;
    const amountX = header.items.find((i) => /^amount/i.test(i.text))?.x ?? 500;
    for (const l of pl.filter((x) => x.y < header.y)) {
      const d = l.items.find((i) => i.x < descX && DATE_CELL.test(i.text));
      if (!d) continue;
      const m = d.text.match(DATE_CELL)!;
      dated.push({ page: p.number, y: l.y, date: `${m[3]}-${m[2]}-${m[1]}`, line: l, descX, amountX });
    }
  }
  // A description is the lines nearest to its dated line (the first can sit above it, the rest below), read top to bottom.
  const rows: PdfRow[] = [];
  for (const d of dated) {
    const amt = amountsIn(d.line).filter((a) => a.x >= d.amountX - 20).pop();
    if (!amt) { warnings.push(`Page ${d.page}: the line for ${d.date} has no readable amount and was skipped.`); continue; }
    const credit = d.line.items.some((i) => i.x >= PLUS_X_MIN && i.text === "+");
    const parts = [...lines.filter((l) => l.page === d.page && l !== d.line)]
      .filter((l) => Math.abs(l.y - d.y) <= MAX_LINE_GAP && !/ckyc id/i.test(l.text) && Math.abs(l.items[0].x - d.descX) <= 3 && !dated.some((o) => o.line === l))
      .filter((l) => dated.map((o) => ({ o, gap: Math.abs(o.y - l.y) })).sort((a, b) => a.gap - b.gap)[0].o === d)
      .map((l) => ({ y: l.y, t: l.items.filter((i) => i.x >= d.descX - 1 && i.x < d.amountX - 70).map((i) => i.text).join(" ") }));
    const own = d.line.items.filter((i) => i.x >= d.descX - 1 && i.x < d.amountX - 70 && !/^[+C]$/.test(i.text) && !/^\+\s*\d+$/.test(i.text)).map((i) => i.text).join(" ");
    const all = [...(own ? [{ y: d.y, t: own }] : []), ...parts].sort((a, b) => b.y - a.y).map((x) => x.t).join(" ");
    const description = all.replace(/\s+/g, " ").trim() || "HDFC card transaction";
    rows.push({ page: d.page, index: rows.length + 1, date: d.date, description, amountPaise: amt.paise, direction: credit ? "credit" : "debit", raw: [d.date.split("-").reverse().join("/"), description, `${(amt.paise / 100).toFixed(2)}${credit ? " CR" : ""}`] });
  }
  if (rows.length === 0) return { ok: false, error: "This looks like an HDFC card statement, but no transactions could be read from it." };

  const debitsStated = purchases !== undefined ? purchases + (finance ?? 0) : undefined;
  const summary: StatementSummary = {
    issuer: "HDFC Bank Credit Card", accountType: "credit_card", periodStart, periodEnd,
    ...(previous !== undefined ? { openingPaise: previous } : {}), ...(debitsStated !== undefined ? { newDebitsPaise: debitsStated } : {}),
    ...(payments !== undefined ? { newCreditsPaise: payments } : {}), ...(total !== undefined ? { closingPaise: total } : {}),
    ...(minimum !== undefined ? { minimumDuePaise: minimum } : {}), ...(dueDate ? { dueDate } : {}),
  };
  const sum = (d: "debit" | "credit") => rows.filter((r) => r.direction === d).reduce((s, r) => s + r.amountPaise, 0);
  const checks: StatementCheck[] = [];
  const cmp = (name: string, expected: number | undefined, got: number) => checks.push(expected === undefined
    ? { name, ok: false, detail: "The statement's own total could not be read, so this could not be checked." }
    : { name, ok: expected === got, detail: expected === got ? `${rs(got)} matches the statement` : `statement says ${rs(expected)}, rows add up to ${rs(got)}` });
  cmp("Purchases add up to “Purchases / Debit”", debitsStated, sum("debit"));
  cmp("Credits add up to “Payments / Credits received”", payments, sum("credit"));
  if (previous !== undefined && debitsStated !== undefined && payments !== undefined && total !== undefined) {
    const calc = previous - payments + debitsStated;
    const ok = Math.abs(calc - total) < 100; // HDFC prints the total rounded to the rupee
    checks.push({ name: "Previous − payments + purchases = total due", ok, detail: ok ? `the statement's own arithmetic holds${calc === total ? "" : " (HDFC rounds the total to the rupee)"}` : `calculated ${rs(calc)}, statement says ${rs(total)}` });
  }
  return { ok: true, summary, rows, checks, warnings };
}
