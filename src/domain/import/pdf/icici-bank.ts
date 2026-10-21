// ICICI Bank savings/current account "Statement of Transactions" (the PDF from Internet Banking, often named OpTransactionHistory...).
// Parsed from text POSITIONS, not reading order:
//   header:  "Statement of Transactions in Saving Account no. ... for the period August 1, 2026 - October 21, 2026"
//   table:   S No. | Transaction Date (dd.mm.yyyy) | Cheque Number | Transaction Remarks | Withdrawal | Deposit | Balance
// The remarks wrap over several lines and the first remark line is printed a little ABOVE the line that carries the date and amounts,
// so each remark line is given to the row whose block it falls in. Money columns are right-aligned, so a column is told from the
// right edge of the figure, not where it starts.
// The statement prints a running balance after every row. The reader checks every row against it; if any row does not follow from the
// one before, the import is blocked until a person agrees.
import { toLines, type PdfLine } from "./lines";
import type { PdfPage, PdfParseResult, PdfRow, StatementCheck, StatementSummary } from "./types";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthNo = (name: string) => MONTHS.indexOf(name.toLowerCase()) + 1;
const pad = (n: number) => String(n).padStart(2, "0");

const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const MONEY = /^\d{1,3}(?:,\d{2,3})*(?:,\d{3})?\.\d{2}$|^\d+\.\d{2}$/;
const CHAR_WIDTH = 5.2; // average width of a digit in this font, used to find a figure's right edge

const REMARK_X_MIN = 150;
const REMARK_X_MAX = 380;
const WITHDRAWAL_EDGE_MAX = 490; // right edge of a withdrawal figure is about 458
const DEPOSIT_EDGE_MAX = 550; // deposit about 524, balance about 577
const FIRST_LINE_ABOVE = 6; // the first remark line sits this far above its row's amounts
const FOOTER_Y = 90; // below this are the bank's footer lines

const paiseOf = (s: string): number => {
  const [r, f] = s.replace(/,/g, "").split(".");
  return Number(r) * 100 + Number(f ?? "0");
};
const rightEdge = (x: number, text: string) => x + text.length * CHAR_WIDTH;
const fmt = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function detectIciciBank(pages: PdfPage[]): boolean {
  const text = toLines(pages.slice(0, 1)).map((l) => l.text).join("\n");
  return /statement of transactions in/i.test(text) && /transaction remarks/i.test(text) && /withdrawal/i.test(text) && /deposit/i.test(text);
}

function readPeriod(lines: PdfLine[]): { start?: string; end?: string } {
  for (const l of lines) {
    const m = l.text.match(/for the period\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
    if (!m) continue;
    const sm = monthNo(m[1]), em = monthNo(m[4]);
    if (!sm || !em) continue;
    return { start: `${m[3]}-${pad(sm)}-${pad(Number(m[2]))}`, end: `${m[6]}-${pad(em)}-${pad(Number(m[5]))}` };
  }
  return {};
}

interface Row { page: number; y: number; sno: number; date: string; withdrawal: number; deposit: number; balance: number; remarks: string[] }

export function parseIciciBank(pages: PdfPage[]): PdfParseResult {
  const lines = toLines(pages);
  const period = readPeriod(lines);
  const rows: Row[] = [];
  const warnings: string[] = [];

  for (const p of pages) {
    const pl = lines.filter((l) => l.page === p.number);
    // A row starts on the line holding "S No." and the date.
    const anchors = pl.filter((l) => l.items.length >= 3 && /^\d{1,5}$/.test(l.items[0].text) && l.items[0].x < 60 && DATE.test(l.items[1].text));
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const dm = a.items[1].text.match(DATE)!;
      const figures = a.items.slice(2).filter((it) => it.x > REMARK_X_MAX && MONEY.test(it.text));
      let withdrawal = 0, deposit = 0, balance: number | null = null;
      for (const f of figures) {
        const edge = rightEdge(f.x, f.text);
        if (edge < WITHDRAWAL_EDGE_MAX) withdrawal += paiseOf(f.text);
        else if (edge < DEPOSIT_EDGE_MAX) deposit += paiseOf(f.text);
        else balance = paiseOf(f.text);
      }
      if (balance === null || (withdrawal === 0 && deposit === 0)) { warnings.push(`Could not read the amounts on line ${a.items[0].text} of page ${p.number}.`); continue; }
      // Remark lines: everything in the remarks column from just above this row's amounts down to just above the next row's.
      const top = a.y + FIRST_LINE_ABOVE;
      const bottom = i + 1 < anchors.length ? anchors[i + 1].y + FIRST_LINE_ABOVE : FOOTER_Y;
      const remarks = pl
        .filter((l) => l.y <= top && l.y > bottom && l.y > FOOTER_Y)
        .map((l) => l.items.filter((it) => it.x >= REMARK_X_MIN && it.x < REMARK_X_MAX && !(l === a && DATE.test(it.text))).map((it) => it.text).join(" "))
        .filter((t) => t.trim() !== "");
      rows.push({ page: p.number, y: a.y, sno: Number(a.items[0].text), date: `${dm[3]}-${dm[2]}-${dm[1]}`, withdrawal, deposit, balance, remarks });
    }
  }

  if (rows.length === 0) return { ok: false, error: "This looks like an ICICI Bank statement, but no transactions could be read from it." };

  // The statement may list oldest first or newest first. The running balance tells which.
  const asc = rows[0].date <= rows[rows.length - 1].date;
  const ordered = asc ? rows : [...rows].reverse();

  // Check 1: every balance follows from the one before it.
  const breaks: string[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const expect = ordered[i - 1].balance - ordered[i].withdrawal + ordered[i].deposit;
    if (expect !== ordered[i].balance) breaks.push(`S No. ${ordered[i].sno} (${ordered[i].date})`);
  }
  const first = ordered[0], last = ordered[ordered.length - 1];
  const opening = first.balance + first.withdrawal - first.deposit;
  const debits = ordered.reduce((s, r) => s + r.withdrawal, 0);
  const credits = ordered.reduce((s, r) => s + r.deposit, 0);
  // Check 3: the serial numbers run 1..n with none missing.
  const snos = ordered.map((r) => r.sno).sort((x, y) => x - y);
  const missing = snos.length > 0 ? snos[snos.length - 1] - snos[0] + 1 - new Set(snos).size - 0 : 0;
  const gaps = snos.filter((n, i) => i > 0 && n !== snos[i - 1] + 1).length;

  const checks: StatementCheck[] = [
    { name: "Each balance follows from the one before", ok: breaks.length === 0, detail: breaks.length === 0 ? `all ${ordered.length} rows add up to the statement's own running balance` : `${breaks.length} row${breaks.length === 1 ? "" : "s"} do not add up: ${breaks.slice(0, 4).join(", ")}${breaks.length > 4 ? "…" : ""}` },
    { name: "Opening − withdrawals + deposits = closing", ok: opening - debits + credits === last.balance, detail: `${fmt(opening)} − ${fmt(debits)} + ${fmt(credits)} = ${fmt(last.balance)}` },
    { name: "No row is missing", ok: gaps === 0 && missing === 0, detail: gaps === 0 ? `rows ${snos[0]} to ${snos[snos.length - 1]} are all there` : `${gaps} gap${gaps === 1 ? "" : "s"} in the row numbers` },
  ];

  const summary: StatementSummary = {
    issuer: "ICICI Bank", accountType: "bank",
    ...(period.start ? { periodStart: period.start } : {}),
    ...(period.end ? { periodEnd: period.end } : {}),
    openingPaise: opening, newDebitsPaise: debits, newCreditsPaise: credits, closingPaise: last.balance,
  };
  const out: PdfRow[] = ordered.map((r, index) => {
    const description = r.remarks.join(" ").replace(/\s+/g, " ").trim();
    return {
      page: r.page, index: index + 1, date: r.date, description: description || "ICICI Bank transaction", amountPaise: r.withdrawal > 0 ? r.withdrawal : r.deposit,
      direction: r.withdrawal > 0 ? "debit" : "credit",
      raw: [String(r.sno), r.date, description, r.withdrawal > 0 ? `Withdrawal ${(r.withdrawal / 100).toFixed(2)}` : `Deposit ${(r.deposit / 100).toFixed(2)}`, `Balance ${(r.balance / 100).toFixed(2)}`],
    };
  });
  return { ok: true, summary, rows: out, checks, warnings };
}
