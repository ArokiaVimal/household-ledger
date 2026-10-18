// Prints the STRUCTURE of a bank or card statement with everything personal hidden, so you can review the output and
// share it safely. It reads the file on your Mac, writes nothing, and sends nothing anywhere.
//
//   node scripts/describe-statement.mjs /path/to/statement.pdf|.csv|.xlsx [--lines 10]
//
// What is hidden: every digit becomes 9, and every word becomes x's of the same length and letter case, except a short
// list of structural words (Date, Debit, Balance, UPI, NEFT...). Dates show as 99/99/9999, amounts as 9,999.99, account
// numbers as 99999999. Read the output before you share it. If anything private survives, tell me and I will tighten it.
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const linesFlag = args.indexOf("--lines");
const SHOW = linesFlag >= 0 ? Math.max(3, Math.min(40, Number(args[linesFlag + 1]) || 10)) : 10;

if (!path) {
  console.error("Usage: node scripts/describe-statement.mjs /path/to/statement.pdf|.csv|.xlsx [--lines 10]");
  process.exit(1);
}

// Words that describe the layout, not the person. Everything else is masked.
const KEEP = new Set(
  ("date,dt,txn,transaction,transactions,tran,narration,description,particulars,details,amount,amt,debit,credit,dr,cr,balance,closing,opening," +
    "withdrawal,withdrawals,deposit,deposits,total,payment,payments,due,statement,summary,minimum,limit,available,credit,card,account,upi,neft,imps," +
    "rtgs,pos,ecom,ach,nach,ecs,emi,charges,charge,gst,igst,cgst,sgst,interest,fee,fees,refund,reversal,cashback,ref,reference,no,number,chq,cheque," +
    "value,posting,posted,page,of,from,to,period,bill,billing,previous,new,purchase,purchases,cash,advance,finance,late,annual,reward,rewards,points," +
    "type,mode,inr,rs,the,and,for,on,in,at,by,with,payable,received,thank,you,sr,sl,s,serial,sno,id,utr,rrn,mid,tid,online,transfer,mobile,banking," +
    "salary,sal,atm,wdl,withdrawal,nfs,billpay,autopay,mandate,sip,insurance,premium,tax,tds,dividend,int,pd,cheq,return,returned,bounce,cash,deposit").split(","),
);

/** Digits -> 9. Words -> x (same length and case), unless they are structural words. Emails/URLs keep only their shape. */
export function mask(text) {
  return text
    .replace(/[0-9]/g, "9")
    .replace(/[A-Za-z]+/g, (w) => {
      if (KEEP.has(w.toLowerCase())) return w;
      return [...w].map((c) => (c === c.toUpperCase() ? "X" : "x")).join("");
    });
}

const maskLine = (cells) => cells.map((c) => mask(String(c))).join(" | ");

function summarisePatterns(rows, label) {
  const shapes = (rows) => [...new Set(rows.map((r) => mask(String(r)).replace(/\s+/g, " ")))];
  console.log(`  ${label}: ${shapes(rows).slice(0, 4).join("   ,   ") || "(none)"}`);
}

function banner(title) {
  console.log("\n" + "=".repeat(70) + "\n" + title + "\n" + "=".repeat(70));
}

function header(kind, bytes) {
  banner("STATEMENT STRUCTURE (personal details hidden)");
  console.log(`File type: ${kind}`);
  console.log(`File size: ${(bytes / 1024).toFixed(0)} KB`);
  console.log("Name, account numbers and merchants are hidden. Review before sharing.");
}

const HEADER_WORDS = ["date", "narration", "description", "particulars", "details", "amount", "debit", "credit", "balance", "withdrawal", "deposit", "reference", "ref"];

function describeTable(table) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");
  let headerIdx = -1;
  for (let i = 0; i < Math.min(table.length, 60); i++) {
    const hits = table[i].filter((c) => HEADER_WORDS.some((w) => norm(c).includes(w))).length;
    if (hits >= 3) { headerIdx = i; break; }
  }
  console.log(`Rows (non-empty): ${table.length}`);
  if (headerIdx < 0) {
    console.log("Could not find a header row with Date / Description / Amount style columns. First lines (masked):");
    table.slice(0, SHOW).forEach((r, i) => console.log(`  ${i + 1}: ${maskLine(r)}`));
    return;
  }
  banner("TABLE");
  console.log(`Lines before the table (masked): ${headerIdx}`);
  table.slice(0, Math.min(headerIdx, 6)).forEach((r, i) => console.log(`  pre ${i + 1}: ${maskLine(r)}`));
  console.log(`Column headings (as written, they are labels not data): ${table[headerIdx].map((c) => JSON.stringify(c)).join("  ")}`);
  const data = table.slice(headerIdx + 1).filter((r) => r.filter(Boolean).length >= 2);
  console.log(`Data-looking rows after the header: ${data.length}`);
  console.log(`\nFirst ${Math.min(SHOW, data.length)} data rows (masked):`);
  data.slice(0, SHOW).forEach((r, i) => console.log(`  ${i + 1}: ${maskLine(r)}`));
  console.log("\nLast 3 rows (masked), to see how the table ends:");
  data.slice(-3).forEach((r) => console.log(`  ${maskLine(r)}`));
  banner("FORMATS SEEN");
  const col = (name) => table[headerIdx].findIndex((c) => norm(c).includes(name));
  const dateCol = col("date");
  if (dateCol >= 0) summarisePatterns(data.slice(0, 40).map((r) => r[dateCol] ?? ""), "Date shape");
  for (const n of ["amount", "debit", "withdrawal", "credit", "deposit", "balance"]) {
    const c = col(n);
    if (c >= 0) summarisePatterns(data.slice(0, 60).map((r) => r[c] ?? "").filter(Boolean), `${n} shape`);
  }
}

// ---- CSV -------------------------------------------------------------------------------------------------------
function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of src.slice(0, 4000)) if (ch in counts) counts[ch]++;
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim())); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
  console.log(`Delimiter: ${delim === "\t" ? "tab" : JSON.stringify(delim)}`);
  return rows;
}

// ---- XLSX ------------------------------------------------------------------------------------------------------
async function readXlsx(buf) {
  const { default: readExcelFile } = await import("read-excel-file/node");
  const sheets = await readExcelFile(buf);
  console.log(`Sheets: ${sheets.length} (${sheets.map((s) => JSON.stringify(mask(s.sheet))).join(", ")})`);
  const text = (v) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  // Use the first sheet that has a recognisable header, else the first.
  const tables = sheets.map((s) => s.data.map((r) => r.map(text)).filter((r) => r.some(Boolean)));
  return tables.find((t) => t.slice(0, 60).some((r) => r.filter((c) => HEADER_WORDS.some((w) => c.toLowerCase().includes(w))).length >= 3)) ?? tables[0] ?? [];
}

// ---- PDF -------------------------------------------------------------------------------------------------------
async function describePdf(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") {
      console.log("\nThis PDF is password protected, so it can't be read.");
      console.log("To make an unlocked copy on your Mac: open it in Preview (enter the password yourself), choose File > Export as PDF... or Print > Save as PDF,");
      console.log("save the copy somewhere private, and run this script on the copy. Don't share the password with anyone.");
      return;
    }
    console.log(`\nCould not open this PDF (${e?.name ?? "error"}).`);
    return;
  }
  console.log(`Pages: ${doc.numPages}`);
  const allLines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((i) => "str" in i && i.str.trim() !== "").map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5);
      if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines.sort((a, b) => b.y - a.y)) {
      l.items.sort((a, b) => a.x - b.x);
      let out = "", lastEnd = null;
      for (const it of l.items) {
        if (lastEnd !== null) out += it.x - lastEnd > 14 ? "  |  " : " ";
        out += it.s.trim();
        lastEnd = it.x + it.s.length * 4.6; // rough text width; only used to decide where columns split
      }
      allLines.push({ page: p, text: out });
    }
  }
  if (allLines.length === 0) {
    console.log("\nNo text found. This PDF is probably a scanned image, which can't be read reliably. Ask your bank for the text version.");
    return;
  }
  const dateStart = /^\s*(\d{1,2}[-/. ](\d{1,2}|[A-Za-z]{3,9})[-/. ]\d{2,4})\b/;
  const txnLines = allLines.filter((l) => dateStart.test(l.text));
  console.log(`Text lines: ${allLines.length}. Lines that start with a date (likely transactions): ${txnLines.length}`);
  banner(`FIRST PAGE, FIRST 40 LINES (masked)`);
  allLines.filter((l) => l.page === 1).slice(0, 40).forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}: ${mask(l.text)}`));
  banner(`TRANSACTION-LIKE LINES (first ${SHOW}, masked)`);
  txnLines.slice(0, SHOW).forEach((l, i) => console.log(`  ${i + 1}: ${mask(l.text)}`));
  banner("TOTALS-LIKE LINES (masked)");
  allLines.filter((l) => /(total|opening|closing|previous balance|payment due|minimum|credit limit|available)/i.test(l.text)).slice(0, 16).forEach((l) => console.log(`  p${l.page}: ${mask(l.text)}`));
  banner("FORMATS SEEN");
  summarisePatterns(txnLines.slice(0, 40).map((l) => l.text.match(dateStart)?.[1] ?? ""), "Date shape");
}

// ---- main ------------------------------------------------------------------------------------------------------
const buf = readFileSync(path);
const ext = extname(path).toLowerCase();
const size = statSync(path).size;
const sniff = buf.subarray(0, 5).toString("latin1");
const kind = sniff.startsWith("%PDF") ? "PDF" : buf[0] === 0x50 && buf[1] === 0x4b ? "XLSX" : [".csv", ".txt"].includes(ext) ? "CSV" : "unknown";

header(kind, size);
console.log(`Name of file (kept, so you can tell which statement this is): ${mask(basename(path, ext))}${ext}`);
if (kind === "PDF") await describePdf(buf);
else if (kind === "XLSX") describeTable(await readXlsx(buf));
else if (kind === "CSV") describeTable(parseCsv(buf.toString("utf8")));
else console.log("Unsupported file. Use a .pdf, .csv or .xlsx statement.");
banner("END. Read it all, then share it if nothing personal is visible.");
