import { parseAmount } from "./amount";
import { detectLayout, type Layout } from "./columns";
import { parseStatementDate } from "./date";

export interface ParsedRow {
  /** 1-based row number in the file (counting the header and any preamble), so users can find it. */
  line: number;
  date: string;
  postedDate?: string;
  description: string;
  amountPaise: number;
  direction: "debit" | "credit";
  referenceId?: string;
  balancePaise?: number;
  /** The row's cells as they appeared, kept as the immutable raw record. */
  raw: string[];
}
export interface SkippedRow { line: number; reason: string; text: string }
export interface Extracted {
  layout: Layout;
  rows: ParsedRow[];
  skipped: SkippedRow[];
  totals: { debitPaise: number; creditPaise: number; debitCount: number; creditCount: number };
  /** Which sign convention was applied to a single signed amount column. */
  positiveIsDebit: boolean;
}
export type ExtractResult = { ok: true; data: Extracted } | { ok: false; error: string };

const FOOTER = /^(total|grand total|opening balance|closing balance|statement summary|balance brought|carried forward|brought forward|end of statement)/i;
const DEBIT_WORDS = /^(dr|d|debit|withdrawal)$/i;
const CREDIT_WORDS = /^(cr|c|credit|deposit)$/i;

/**
 * Turns a parsed table into transactions. Nothing is guessed silently: rows that cannot be read are returned in
 * `skipped` with a reason, and totals are returned so the user can compare them with the statement.
 * `positiveIsDebit` applies to a single signed amount column: credit-card statements usually show purchases as
 * positive (true), bank statements show money out as negative (false).
 */
export function extractRows(table: string[][], opts: { positiveIsDebit?: boolean } = {}): ExtractResult {
  const layout = detectLayout(table);
  if (!layout) return { ok: false, error: "Could not find a transaction table. Expected columns like Date, Description and Amount (or Debit and Credit)." };
  const c = layout.columns;
  const positiveIsDebit = opts.positiveIsDebit ?? false;
  const rows: ParsedRow[] = [];
  const skipped: SkippedRow[] = [];
  const totals = { debitPaise: 0, creditPaise: 0, debitCount: 0, creditCount: 0 };

  for (let i = layout.headerIndex + 1; i < table.length; i++) {
    const cells = table[i];
    const line = i + 1;
    const text = cells.filter(Boolean).join(" | ").slice(0, 160);
    const date = parseStatementDate(cells[c.date]);
    const description = (cells[c.description] ?? "").trim();
    if (!date) {
      if (!FOOTER.test(cells.find(Boolean) ?? "") && cells.filter(Boolean).length >= 3) skipped.push({ line, reason: "No valid date", text });
      continue;
    }
    if (!description) { skipped.push({ line, reason: "Empty description", text }); continue; }

    let direction: "debit" | "credit" | null = null;
    let paise = 0;
    if (c.debit !== undefined || c.credit !== undefined) {
      const d = c.debit !== undefined ? parseAmount(cells[c.debit]) : null;
      const cr = c.credit !== undefined ? parseAmount(cells[c.credit]) : null;
      const dv = d?.paise ?? 0;
      const cv = cr?.paise ?? 0;
      if (dv > 0 && cv > 0) { skipped.push({ line, reason: "Both debit and credit filled", text }); continue; }
      if (dv > 0) { direction = "debit"; paise = dv; } else if (cv > 0) { direction = "credit"; paise = cv; }
    } else if (c.amount !== undefined) {
      const a = parseAmount(cells[c.amount]);
      if (a && a.paise > 0) {
        paise = a.paise;
        const word = c.drcr !== undefined ? (cells[c.drcr] ?? "").trim() : "";
        if (a.marker) direction = a.marker === "dr" ? "debit" : "credit";
        else if (DEBIT_WORDS.test(word)) direction = "debit";
        else if (CREDIT_WORDS.test(word)) direction = "credit";
        else direction = a.negative ? (positiveIsDebit ? "credit" : "debit") : (positiveIsDebit ? "debit" : "credit");
      }
    }
    if (!direction || paise <= 0) { skipped.push({ line, reason: "No readable amount", text }); continue; }

    const ref = c.reference !== undefined ? (cells[c.reference] ?? "").trim() : "";
    const bal = c.balance !== undefined ? parseAmount(cells[c.balance]) : null;
    rows.push({
      line, date, description, amountPaise: paise, direction,
      postedDate: c.postedDate !== undefined ? parseStatementDate(cells[c.postedDate]) ?? undefined : undefined,
      referenceId: ref && !/^0+$/.test(ref) ? ref : undefined,
      balancePaise: bal ? bal.paise * (bal.negative || bal.marker === "dr" ? -1 : 1) : undefined,
      raw: cells,
    });
    if (direction === "debit") { totals.debitPaise += paise; totals.debitCount++; } else { totals.creditPaise += paise; totals.creditCount++; }
  }
  if (rows.length === 0) return { ok: false, error: "The table was found but no transaction rows could be read." };
  return { ok: true, data: { layout, rows, skipped, totals, positiveIsDebit } };
}
