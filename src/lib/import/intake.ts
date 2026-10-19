// Turns an uploaded file or pasted text into an ImportInput, deciding the payment method on the way.
// Order of trust: your explicit choice, then the statement's own wording (deterministic, nothing leaves the server),
// then ask. Rows are read by the deterministic parsers first; Claude is only a fallback, and only with consent (`ai`).
import { extractRows } from "@/domain/import/rows";
import { parseCsv } from "@/domain/import/csv";
import { parseStatementPdf, type PdfPage } from "@/domain/import/pdf";
import { toLines } from "@/domain/import/pdf/lines";
import { senseAccount, type Sensed } from "@/domain/import/sense";
import type { Account } from "@/domain/types";
import type { ClaudeConfig } from "./ai";
import { extractWithClaude, MAX_NOTE_CHARS } from "./ai-extract";
import type { AiUsage } from "./ai";
import { readTable, sniffKind } from "./files";
import { readPdfPages } from "./pdf";
import { ImportError, type ImportInput, type Preview } from "./service";

export interface IntakeOpts {
  accounts: Account[];
  /** The payment method you chose, if any. */
  accountId?: string;
  /** You agreed to send (redacted) text to Claude for this import. */
  ai: boolean;
  claude: ClaudeConfig | null;
  today: string;
  /** Fields shared by every input: filename, fileHash, flags. */
  base: { filename: string; fileHash: string; acceptMismatch?: boolean; allowReimport?: boolean; positiveIsDebit?: boolean; decisions?: Record<string, "import" | "skip">; cardBill?: { dueDate: string } };
}
export type Intake =
  | { kind: "ready"; input: ImportInput; ai?: AiUsage }
  | { kind: "need_account"; reason: string; candidates: Sensed["candidates"]; ai?: AiUsage };

const SAMPLE = 8000;

function decide(opts: IntakeOpts, sample: string, aiAccountId?: string | null): { accountId: string | null; detected: NonNullable<Preview["detected"]>; sensed: Sensed } {
  const chosen = opts.accountId && opts.accounts.find((a) => a.id === opts.accountId);
  const sensed = senseAccount(sample, opts.accounts);
  if (chosen) return { accountId: chosen.id, detected: { chosen: true, confidence: "sure", reason: "You chose it" }, sensed };
  if (sensed.accountId && sensed.confidence !== "none") return { accountId: sensed.accountId, detected: { chosen: false, confidence: sensed.confidence, reason: sensed.reason }, sensed };
  if (aiAccountId) return { accountId: aiAccountId, detected: { chosen: false, confidence: "likely", reason: "Claude matched it to this payment method" }, sensed };
  return { accountId: null, detected: { chosen: false, confidence: "none", reason: sensed.reason }, sensed };
}

/** Reads a statement file (CSV, Excel or PDF). Throws FileError/ImportError for files that cannot be used. */
export async function intakeFile(bytes: Uint8Array, filename: string, opts: IntakeOpts): Promise<Intake> {
  const kind = sniffKind(filename, bytes);
  let table: string[][] | undefined;
  let pages: PdfPage[] | undefined;
  let sample: string;
  if (kind === "pdf") { pages = await readPdfPages(bytes); sample = toLines(pages).map((l) => l.text).join("\n"); }
  else { table = await readTable(kind, bytes); sample = table.map((r) => r.join(" ")).join("\n"); }

  const pdf = pages ? parseStatementPdf(pages) : undefined;
  const parsed = table ? extractRows(table, { positiveIsDebit: opts.base.positiveIsDebit }) : undefined;
  const readable = pdf ? pdf.ok : parsed?.ok === true;

  if (readable) {
    const d = decide(opts, sample.slice(0, SAMPLE));
    if (!d.accountId) return { kind: "need_account", reason: d.detected.reason, candidates: d.sensed.candidates };
    const base = { ...opts.base, accountId: d.accountId, detected: d.detected };
    return { kind: "ready", input: pdf ? { ...base, format: "pdf", pdf } : { ...base, format: kind as "csv" | "xlsx", table: table! } };
  }

  // The deterministic parser could not read this layout. Claude may try, but only with consent.
  const why = pdf && !pdf.ok ? pdf.error : parsed && !parsed.ok ? parsed.error : "This file's layout was not recognised.";
  if (!opts.ai || !opts.claude) throw new ImportError("invalid", `${why} Try “Import with AI”, or paste the transactions into the text box.`);
  const out = await extractWithClaude(opts.claude, sample, "statement", { accounts: opts.accounts, today: opts.today });
  if (out.usage.error) throw new ImportError("invalid", `${why} Claude could not help either: ${out.usage.error}.`);
  if (out.rows.length === 0) throw new ImportError("invalid", `${why} Claude found no transactions it could verify in the text.`);
  const d = decide(opts, sample.slice(0, SAMPLE), out.accountId);
  if (!d.accountId) return { kind: "need_account", reason: d.detected.reason, candidates: d.sensed.candidates, ai: out.usage };
  return { kind: "ready", ai: out.usage, input: { ...opts.base, accountId: d.accountId, detected: d.detected, format: "text", rows: out.rows, readBy: "ai", unverified: out.unverified, warnings: out.warnings } };
}

/**
 * Reads pasted or typed text. A pasted table (with a header row) is read by the same parser as a CSV, no AI needed.
 * Anything else, such as "paid 450 at Swiggy yesterday via GPay", needs Claude (with consent).
 */
export async function intakeText(text: string, mode: "table" | "ai", opts: IntakeOpts): Promise<Intake> {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) throw new ImportError("invalid", "Paste or type some transactions first.");
  if (mode === "table") {
    const delimited = clean.includes("\t") ? clean.split("\n").map((l) => l.split("\t").map((c) => c.trim())) : parseCsv(clean);
    const parsed = extractRows(delimited, { positiveIsDebit: opts.base.positiveIsDebit });
    if (!parsed.ok) throw new ImportError("invalid", `${parsed.error} If this is free text, use “Read with AI”.`);
    const d = decide(opts, clean.slice(0, SAMPLE));
    if (!d.accountId) return { kind: "need_account", reason: d.detected.reason, candidates: d.sensed.candidates };
    return { kind: "ready", input: { ...opts.base, accountId: d.accountId, detected: d.detected, format: "csv", table: delimited } };
  }
  if (!opts.ai || !opts.claude) throw new ImportError("invalid", "Reading free text needs Claude. Turn on AI, or paste a table with a header row.");
  if (clean.length > MAX_NOTE_CHARS * 15) throw new ImportError("too_large", "That is too much text at once. Paste a smaller part.");
  const out = await extractWithClaude(opts.claude, clean, clean.length > MAX_NOTE_CHARS ? "statement" : "note", { accounts: opts.accounts, today: opts.today });
  if (out.usage.error) throw new ImportError("invalid", `Could not read that with Claude: ${out.usage.error}.`);
  if (out.rows.length === 0) throw new ImportError("invalid", "No transactions with an amount were found in that text.");
  const d = decide(opts, clean.slice(0, SAMPLE), out.accountId);
  if (!d.accountId) return { kind: "need_account", reason: d.detected.reason, candidates: d.sensed.candidates, ai: out.usage };
  return { kind: "ready", ai: out.usage, input: { ...opts.base, accountId: d.accountId, detected: d.detected, format: "text", rows: out.rows, readBy: "ai", unverified: out.unverified, warnings: out.warnings } };
}
