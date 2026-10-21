// ICICI Bank credit-card statement (Coral, Amazon Pay, Platinum and the like). Parsed from text POSITIONS, not reading order:
//   summary:  "Total Amount due | Previous Balance | Purchases / Charges | Cash Advances | Payments / Credits", figures a line or two below
//   table:    Date (dd/mm/yyyy) | SerNo (11 digits) | Transaction Details | Reward Points | [Intl.] | Amount (a credit ends in "CR")
// The columns sit at different places on the first page (beside the summary) and on later pages, so a row is read by ORDER of its
// cells, not by x: date, serial number, then the details, then the points and the amount at the end.
// A UPI payment made with the card reads "UPI-<12 digit reference>-<merchant>". The reader keeps that text whole so the UPI mark can be seen later.
// The merchant text wraps onto a second line, and the country code ("IN") is printed after it.
// The reader checks itself against the statement's own totals; if they differ the import is blocked until a person agrees.
import { parseAmount } from "../amount";
import { toLines, type PdfLine } from "./lines";
import type { PdfPage, PdfParseResult, PdfRow, StatementCheck, StatementSummary } from "./types";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthNo = (name: string) => MONTHS.indexOf(name.toLowerCase()) + 1;
const pad = (n: number) => String(n).padStart(2, "0");
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const SERNO = /^\d{9,13}$/;
const AMOUNT = /^([\d,]+\.\d{2})(\s*CR)?$/i;
const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;

export function detectIciciCard(pages: PdfPage[]): boolean {
  const text = toLines(pages.slice(0, 1)).map((l) => l.text).join("\n");
  return /credit card statement/i.test(text) && /serno/i.test(text) && /icici/i.test(text);
}

/** "October 17, 2026" anywhere in a piece of text. */
function longDate(text: string): string | undefined {
  const m = text.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  const mo = m ? monthNo(m[1]) : 0;
  return m && mo ? `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}` : undefined;
}

/** The date printed a little below a label ("PAYMENT DUE DATE"), within the next few lines. */
function dateAfter(lines: PdfLine[], label: RegExp): string | undefined {
  const i = lines.findIndex((l) => label.test(l.text));
  if (i < 0) return undefined;
  for (const l of lines.slice(i, i + 8)) { const d = longDate(l.text.replace(label, "")); if (d) return d; }
  return undefined;
}

function readPeriod(lines: PdfLine[]): { start?: string; end?: string } {
  for (const l of lines) {
    const m = l.text.match(/statement period\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (m) return { start: longDate(m[1]), end: longDate(m[2]) };
  }
  return {};
}

const figure = (text: string): number | undefined => { const m = text.replace(/[`₹]/g, "").trim().match(/^[\d,]+\.\d{2}$/); return m ? parseAmount(m[0])?.paise : undefined; };

/** The five summary figures, each matched to the heading above it by horizontal position. */
function readSummary(lines: PdfLine[]): { previous?: number; purchases?: number; cash?: number; payments?: number; total?: number; minimum?: number } {
  const out: { previous?: number; purchases?: number; cash?: number; payments?: number; total?: number; minimum?: number } = {};
  const head = lines.findIndex((l) => /previous balance/i.test(l.text) && /purchases/i.test(l.text) && /payments/i.test(l.text));
  if (head < 0) return out;
  const heads = lines[head].items.filter((i) => /^(previous|purchases|cash|payments)\b/i.test(i.text) || /^(previous balance|purchases \/ charges|cash advances|payments \/ credits)$/i.test(i.text)).map((i) => ({ x: i.x, t: i.text.toLowerCase() }));
  const total = lines[head].items.find((i) => /total amount due/i.test(i.text));
  // figures can be joined to the "`" sign ("`44,680.00") or follow it as their own cell
  const cells = (l: PdfLine) => l.items.map((i) => ({ x: i.x, v: figure(i.text) })).filter((c): c is { x: number; v: number } => c.v !== undefined);
  const near = lines.slice(head + 1, head + 6);
  for (const l of near) {
    const c = cells(l);
    if (c.length >= 3 && heads.length >= 3) {
      for (const f of c) {
        const h = [...heads].filter((x) => x.x <= f.x + 4).sort((a, b) => b.x - a.x)[0];
        if (!h) continue;
        if (/previous/.test(h.t)) out.previous = f.v; else if (/purchases/.test(h.t)) out.purchases = f.v; else if (/cash/.test(h.t)) out.cash = f.v; else if (/payments/.test(h.t)) out.payments = f.v;
      }
    } else if (c.length === 1 && total && c[0].x < 200 && out.total === undefined) out.total = c[0].v;
  }
  const min = lines.findIndex((l) => /minimum amount due/i.test(l.text));
  if (min >= 0) for (const l of lines.slice(min, min + 4)) { const c = cells(l); if (c.length && c[0].x < 200) { out.minimum = c[0].v; break; } }
  return out;
}

interface Raw { page: number; y: number; descX: number; date: string; ser: string; desc: string; amount: number; credit: boolean; points: string }

export function parseIciciCard(pages: PdfPage[]): PdfParseResult {
  const lines = toLines(pages);
  const period = readPeriod(lines);
  const sum = readSummary(lines);
  const warnings: string[] = [];
  const raws: Raw[] = [];

  for (const l of lines) {
    const di = l.items.findIndex((i) => DATE.test(i.text));
    if (di < 0 || !l.items[di + 1] || !SERNO.test(l.items[di + 1].text)) continue;
    const cells = l.items.slice(di + 2);
    const last = cells[cells.length - 1];
    const am = last?.text.match(AMOUNT);
    if (!am) { warnings.push(`Page ${l.page}: the line for ${l.items[di].text} has no readable amount and was skipped.`); continue; }
    const credit = !!am[2] || /^cr$/i.test(cells[cells.length - 1].text);
    const body = cells.slice(0, -1);
    // The reward points are a small whole number just before the amount ("0", "16", "1560").
    const points = body.length > 1 && /^\d{1,5}$/.test(body[body.length - 1].text) ? body.pop()!.text : "";
    const dm = l.items[di].text.match(DATE)!;
    raws.push({ page: l.page, y: l.y, descX: body[0]?.x ?? l.items[di + 1].x + 50, date: `${dm[3]}-${dm[2]}-${dm[1]}`, ser: l.items[di + 1].text, desc: body.map((i) => i.text).join(" "), amount: parseAmount(am[1])!.paise, credit, points });
  }

  // Wrapped merchant text: a line below a row, in the same text column, with no date.
  for (const l of lines) {
    if (l.items.some((i) => DATE.test(i.text)) || !l.items.length) continue;
    const row = raws.filter((r) => r.page === l.page && r.y > l.y && r.y - l.y <= 14 && Math.abs(r.descX - l.items[0].x) <= 3).sort((a, b) => a.y - b.y)[0];
    if (row && l.items.length <= 4 && l.items.every((i) => i.x < row.descX + 160)) row.desc = `${row.desc} ${l.items.map((i) => i.text).join(" ")}`;
  }

  if (raws.length === 0) return { ok: false, error: "This looks like an ICICI Bank credit card statement, but no transactions could be read from it." };

  const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s+IN$/, "").trim();
  const out: PdfRow[] = raws.map((r, index) => {
    const description = clean(r.desc) || "ICICI card transaction";
    return {
      page: r.page, index: index + 1, date: r.date, description, amountPaise: r.amount, direction: r.credit ? "credit" : "debit",
      raw: [r.date.split("-").reverse().join("/"), r.ser, description, r.points ? `points ${r.points}` : "", `${(r.amount / 100).toFixed(2)}${r.credit ? " CR" : ""}`].filter(Boolean),
    };
  });

  const due = dateAfter(lines, /payment due date/i);
  const debitsStated = sum.purchases !== undefined ? sum.purchases + (sum.cash ?? 0) : undefined;
  const summary: StatementSummary = {
    issuer: "ICICI Bank Credit Card", accountType: "credit_card",
    ...(period.start ? { periodStart: period.start } : {}), ...(period.end ? { periodEnd: period.end } : {}),
    ...(sum.previous !== undefined ? { openingPaise: sum.previous } : {}), ...(debitsStated !== undefined ? { newDebitsPaise: debitsStated } : {}),
    ...(sum.payments !== undefined ? { newCreditsPaise: sum.payments } : {}), ...(sum.total !== undefined ? { closingPaise: sum.total } : {}),
    ...(sum.minimum !== undefined ? { minimumDuePaise: sum.minimum } : {}), ...(due ? { dueDate: due } : {}),
  };

  const total = (d: "debit" | "credit") => out.filter((r) => r.direction === d).reduce((s, r) => s + r.amountPaise, 0);
  const checks: StatementCheck[] = [];
  const cmp = (name: string, expected: number | undefined, got: number) => checks.push(expected === undefined
    ? { name, ok: false, detail: "The statement's own total could not be read, so this could not be checked." }
    : { name, ok: expected === got, detail: expected === got ? `${rs(got)} matches the statement` : `statement says ${rs(expected)}, rows add up to ${rs(got)}` });
  cmp("Purchases add up to “Purchases / Charges”", debitsStated, total("debit"));
  cmp("Payments add up to “Payments / Credits”", sum.payments, total("credit"));
  if (sum.previous !== undefined && debitsStated !== undefined && sum.payments !== undefined && sum.total !== undefined) {
    const calc = sum.previous + debitsStated - sum.payments;
    checks.push({ name: "Previous + purchases − payments = total due", ok: calc === sum.total, detail: calc === sum.total ? "the statement's own arithmetic holds" : `calculated ${rs(calc)}, statement says ${rs(sum.total)}` });
  }
  return { ok: true, summary, rows: out, checks, warnings };
}
