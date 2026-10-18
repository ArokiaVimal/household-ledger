// Statement import: read -> classify -> detect duplicates -> (optionally) save. Pure over the Repository interface,
// so it is tested with the in-memory repository and runs unchanged on Firestore. Nothing here counts toward reports:
// imported rows are written as "unreviewed" and need a person's approval.
import type { Repository } from "@/data/repository";
import { classifyRow } from "@/domain/import/classify";
import { extractRows, type ParsedRow } from "@/domain/import/rows";
import type { PdfParseResult, StatementCheck, StatementSummary } from "@/domain/import/pdf";
import { planImport } from "@/domain/dedupe";
import { isConfident, kindFits, lookupMemory, memoryKey, rememberSuggestion, seedMemory } from "@/domain/memory";
import type { AiItem, AiUsage, Suggest } from "./ai";
import { suggestCategory } from "@/domain/rules";
import type { Account, ExpenseRecord, ImportBatch, MerchantMemory, RawTransaction, Suggestion, TxnKind } from "@/domain/types";

export const MAX_ROWS = 2000;
// Vercel functions accept request bodies up to 4.5 MB, so stay under that.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface ImportDeps {
  /** SHA-256 hex of a string. */
  sha256: (s: string) => string;
  now: () => number;
  newId: () => string;
  /** Asks Claude about merchants missing from memory. Absent when no API key is set: memory and rules still work. */
  suggest?: Suggest | null;
}

export interface PreviewRow {
  line: number;
  date: string;
  description: string;
  merchant: string;
  amountPaise: number;
  direction: "debit" | "credit";
  kind: TxnKind;
  categoryId: string;
  status: "new" | "duplicate" | "possible";
  /** Where the merchant/category guess came from; absent means nothing was known and it needs you. */
  suggested?: Suggestion;
  /** Id of the record this looks like (possible) or is (duplicate). */
  matchId?: string;
}

export interface Preview {
  accountId: string;
  filename: string;
  fileHash: string;
  positiveIsDebit: boolean;
  /** True when the file has one signed Amount column (so the sign convention matters and may need flipping). */
  singleAmountColumn: boolean;
  columns: string[];
  format: "csv" | "xlsx" | "pdf";
  /** PDF statements: what the statement says about itself, and whether our reading agrees with it. */
  summary?: StatementSummary;
  checks: StatementCheck[];
  warnings: string[];
  rows: PreviewRow[];
  skipped: { line: number; reason: string; text: string }[];
  totals: { debitPaise: number; creditPaise: number; debitCount: number; creditCount: number };
  counts: { rows: number; new: number; duplicate: number; possible: number; unreadable: number };
  /** How the guesses were made, so the cost and the benefit are visible. */
  smart: SmartReport;
}

export interface SmartReport {
  /** An Anthropic key is configured on the server. */
  aiEnabled: boolean;
  /** Rows filled in from what you have approved before. */
  fromMemory: number;
  /** Rows filled in by Claude (sure + unsure). */
  fromAi: number;
  /** Rows nobody could fill in. */
  needYou: number;
  /** Distinct merchants sent to Claude this time (0 when memory knew them all), and tokens spent. */
  ai: AiUsage;
}

export class ImportError extends Error {
  constructor(public code: "invalid" | "not_found" | "already_imported" | "too_large" | "check_failed", message: string) { super(message); }
}

interface ImportBase {
  accountId: string;
  filename: string;
  /** SHA-256 of the file's bytes. */
  fileHash: string;
  /** Overrides the default sign convention for a single signed amount column (CSV/Excel). */
  positiveIsDebit?: boolean;
  /** Import even though a self-check failed. Only a person who has looked at the differences should set this. */
  acceptMismatch?: boolean;
}
export type ImportInput = ImportBase & ({ format: "csv" | "xlsx"; table: string[][] } | { format: "pdf"; pdf: PdfParseResult });

const KIND_CATEGORY: Partial<Record<TxnKind, string>> = { income: "income", cc_payment: "transfers", transfer: "transfers", refund: "refunds", fee: "fees" };

/** Dedupe key: a bank reference alone can repeat (e.g. a monthly mandate), so it is combined with the date and amount. */
function dedupeKey(sha256: (s: string) => string, accountId: string, r: ParsedRow, occurrence: number): string {
  if (r.referenceId) return `${r.referenceId}|${r.date}|${r.amountPaise}|${r.direction}`;
  return `h:${sha256(`${accountId}|${r.date}|${r.amountPaise}|${r.direction}|${r.description.toLowerCase()}|${occurrence}`).slice(0, 24)}`;
}

async function prepare(repo: Repository, input: ImportInput, d: ImportDeps): Promise<{ preview: Preview; rows: (PreviewRow & { referenceId: string; parsed: ParsedRow })[]; account: Account }> {
  const account = await repo.accounts.get(input.accountId);
  if (!account) throw new ImportError("not_found", "Choose which payment method this statement is for.");
  const prior = (await repo.importBatches.list()).find((b) => b.fileHash === input.fileHash && b.accountId === input.accountId);
  if (prior) throw new ImportError("already_imported", `This exact file was already imported on ${prior.uploadedAt.slice(0, 10)} as "${prior.filename}". Nothing was added again.`);

  const positiveIsDebit = input.positiveIsDebit ?? account.type === "credit_card";
  let rows: ParsedRow[];
  let skipped: { line: number; reason: string; text: string }[] = [];
  let headers: string[] = [];
  let singleAmountColumn = false;
  let summary: StatementSummary | undefined;
  const checks: StatementCheck[] = [];
  const warnings: string[] = [];
  if (input.format === "pdf") {
    if (!input.pdf.ok) throw new ImportError("invalid", input.pdf.error);
    summary = input.pdf.summary;
    checks.push(...input.pdf.checks);
    warnings.push(...input.pdf.warnings);
    // PDF rows become the same ParsedRow the CSV path produces, so classification, dedupe and staging are shared.
    rows = input.pdf.rows.map((r) => ({ line: r.index, date: r.date, description: r.description, amountPaise: r.amountPaise, direction: r.direction, raw: [`page ${r.page}`, ...r.raw] }));
    const issuerIsAmex = /american express/i.test(summary.issuer);
    const accountIsAmex = /amex|american express/i.test(`${account.name} ${account.id}`);
    checks.push({ name: "Payment method matches the statement's issuer", ok: !issuerIsAmex || accountIsAmex, detail: !issuerIsAmex || accountIsAmex ? `${account.name}` : `this is an ${summary.issuer} statement but you chose "${account.name}"` });
  } else {
    const extracted = extractRows(input.table, { positiveIsDebit });
    if (!extracted.ok) throw new ImportError("invalid", extracted.error);
    rows = extracted.data.rows;
    skipped = extracted.data.skipped;
    headers = extracted.data.layout.headers;
    singleAmountColumn = extracted.data.layout.columns.amount !== undefined && extracted.data.layout.columns.debit === undefined && extracted.data.layout.columns.credit === undefined;
  }
  const totals = { debitPaise: 0, creditPaise: 0, debitCount: 0, creditCount: 0 };
  for (const r of rows) { if (r.direction === "debit") { totals.debitPaise += r.amountPaise; totals.debitCount++; } else { totals.creditPaise += r.amountPaise; totals.creditCount++; } }
  if (rows.length > MAX_ROWS) throw new ImportError("too_large", `This file has ${rows.length} transactions; the limit is ${MAX_ROWS} per file. Split it by month.`);

  const [rules, categories, records, storedMemory] = await Promise.all([repo.rules.list(), repo.categories.list(), repo.records.list(), repo.merchantMemory.list()]);
  const hasCategory = (id: string) => categories.some((c) => c.id === id);
  const today = new Date(d.now()).toISOString().slice(0, 10);

  // First use: learn from everything already approved, so the very first AI-assisted import has context.
  let memory: MerchantMemory[] = storedMemory;
  if (memory.length === 0) {
    memory = seedMemory(records).filter((m) => hasCategory(m.categoryId));
    for (const m of memory) await repo.merchantMemory.put(m);
  }

  const seen = new Map<string, number>();
  const prepared = rows.map((r) => {
    const base = `${input.accountId}|${r.date}|${r.amountPaise}|${r.direction}|${r.description.toLowerCase()}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { r, ...classifyRow(r.description, r.direction, account.type), key: memoryKey(r.description), occurrence, categoryId: "uncategorized", suggested: undefined as Suggestion | undefined };
  });

  // Pass 1: your rules, then memory. Pass 2: Claude, only for merchants neither knows.
  const unknown = new Map<string, AiItem>();
  for (const p of prepared) {
    const ruleHit = KIND_CATEGORY[p.kind] ? "" : suggestCategory(rules, p.merchant, "");
    const mem = lookupMemory(memory, p.key);
    if (ruleHit && hasCategory(ruleHit)) { p.categoryId = ruleHit; p.suggested = "memory"; continue; }
    if (mem && kindFits(mem.kind, p.r.direction) && hasCategory(mem.categoryId)) {
      p.merchant = mem.name; p.kind = mem.kind; p.categoryId = KIND_CATEGORY[mem.kind] ?? mem.categoryId;
      p.suggested = mem.source === "user" ? "memory" : mem.confident ? "ai" : "ai_unsure";
      continue;
    }
    const wanted = KIND_CATEGORY[p.kind];
    if (wanted) { p.categoryId = hasCategory(wanted) ? wanted : "uncategorized"; if (p.kind !== "income" && p.kind !== "refund") continue; }
    // A clearly classified fee, card payment or transfer needs no AI; vague purchases and credits do.
    if (p.key && !unknown.has(p.key)) unknown.set(p.key, { key: p.key, description: p.r.description, amountPaise: p.r.amountPaise, direction: p.r.direction });
  }
  const ai: AiUsage = { asked: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  if (d.suggest && unknown.size > 0) {
    const res = await d.suggest([...unknown.values()], { categories, known: memory });
    Object.assign(ai, res.usage);
    for (const sug of res.suggestions) {
      const entry = rememberSuggestion(lookupMemory(memory, sug.key), { ...sug, date: today });
      if (entry) { memory = [...memory, entry]; await repo.merchantMemory.put(entry); }
    }
    for (const p of prepared) {
      if (p.suggested || !p.key) continue;
      const mem = lookupMemory(memory, p.key);
      if (!mem || !kindFits(mem.kind, p.r.direction) || !hasCategory(mem.categoryId)) continue;
      p.merchant = mem.name; p.kind = mem.kind; p.categoryId = KIND_CATEGORY[mem.kind] ?? mem.categoryId;
      p.suggested = isConfident(mem) ? "ai" : "ai_unsure";
    }
  }
  const withRef = prepared.map((p) => ({ ...p, referenceId: dedupeKey(d.sha256, input.accountId, p.r, p.occurrence) }));
  const plan = planImport(withRef.map((p) => ({ accountId: input.accountId, date: p.r.date, amountPaise: p.r.amountPaise, merchant: p.merchant, referenceId: p.referenceId, direction: p.r.direction })), records);

  const out = withRef.map((p, i) => {
    const dup = plan[i].dup;
    const status: PreviewRow["status"] = dup.status === "exact" ? "duplicate" : dup.status === "possible" ? "possible" : "new";
    return {
      line: p.r.line, date: p.r.date, description: p.r.description, merchant: p.merchant, amountPaise: p.r.amountPaise, direction: p.r.direction,
      kind: p.kind, categoryId: p.categoryId, suggested: p.suggested, status, matchId: dup.status === "none" ? undefined : dup.matchId, referenceId: p.referenceId, parsed: p.r,
    };
  });
  const counts = { rows: out.length, new: out.filter((x) => x.status === "new").length, duplicate: out.filter((x) => x.status === "duplicate").length, possible: out.filter((x) => x.status === "possible").length, unreadable: skipped.length };
  const smart: SmartReport = {
    aiEnabled: !!d.suggest, ai,
    fromMemory: out.filter((x) => x.suggested === "memory").length,
    fromAi: out.filter((x) => x.suggested === "ai" || x.suggested === "ai_unsure").length,
    needYou: out.filter((x) => !x.suggested && x.categoryId === "uncategorized").length,
  };
  const preview: Preview = {
    accountId: input.accountId, filename: input.filename, fileHash: input.fileHash, positiveIsDebit,
    singleAmountColumn, format: input.format, summary, checks, warnings,
    columns: headers, rows: out.map(({ referenceId: _r, parsed: _p, ...row }) => { void _r; void _p; return row; }), skipped, totals, counts, smart,
  };
  return { preview, rows: out, account };
}

/** Reads the file and reports what would happen. Writes nothing. */
export async function previewImport(repo: Repository, input: ImportInput, d: ImportDeps): Promise<Preview> {
  return (await prepare(repo, input, d)).preview;
}

export interface CommitResult { batchId: string; counts: Preview["counts"] & { staged: number } }

/**
 * Saves the batch: an import-history entry, every row as the bank wrote it (immutable), and the new/possible rows as
 * "unreviewed" records for the review queue. Exact duplicates are not added again. The original file is not kept.
 */
export async function commitImport(repo: Repository, actor: { uid: string; participantId: string }, input: ImportInput, d: ImportDeps): Promise<CommitResult> {
  const { preview, rows } = await prepare(repo, input, d);
  const failed = preview.checks.filter((c) => !c.ok);
  if (failed.length > 0 && !input.acceptMismatch) {
    throw new ImportError("check_failed", `The statement's own totals do not match what was read (${failed.map((c) => c.name).join("; ")}). Nothing was imported. Review the differences, then confirm you want to import anyway.`);
  }
  const batchId = d.newId();
  const stage = rows.filter((r) => r.status !== "duplicate");
  const batch: ImportBatch = {
    id: batchId, accountId: input.accountId, filename: input.filename.slice(0, 200), fileHash: input.fileHash, format: input.format,
    uploadedAt: new Date(d.now()).toISOString(), uploadedBy: actor.uid,
    counts: { rows: preview.counts.rows, staged: stage.length, skippedDuplicate: preview.counts.duplicate, flaggedDuplicate: preview.counts.possible, unreadable: preview.counts.unreadable },
    totals: { debitPaise: preview.totals.debitPaise, creditPaise: preview.totals.creditPaise },
    ...(preview.checks.length > 0 ? { checksPassed: failed.length === 0, acceptedMismatch: failed.length > 0 } : {}),
  };
  for (const r of rows) {
    const raw: RawTransaction = { id: `${batchId}-${r.line}`, batchId, line: r.line, cells: r.parsed.raw.map((c) => c.slice(0, 1000)).slice(0, 60) };
    await repo.rawTransactions.put(raw);
  }
  for (const r of stage) {
    const rec: ExpenseRecord = {
      id: d.newId(), date: r.date, postedDate: r.parsed.postedDate, merchant: r.merchant, originalDescription: r.description.slice(0, 500), amountPaise: r.amountPaise, currency: "INR",
      accountId: input.accountId, categoryId: r.categoryId, kind: r.kind, payerId: actor.participantId, shared: false, split: { mode: "personal", participantIds: [actor.participantId] },
      excluded: false, status: "unreviewed", suggested: r.suggested, importSource: `${input.filename.slice(0, 150)} (import ${batchId.slice(0, 8)})`, referenceId: r.referenceId, duplicateOf: r.status === "possible" ? r.matchId : undefined,
    };
    await repo.records.put(JSON.parse(JSON.stringify(rec)) as ExpenseRecord);
  }
  await repo.importBatches.put(batch);
  await repo.audit.append({ actorId: actor.uid, action: "import", entity: "household", entityId: batchId, summary: `Imported ${input.filename}: ${stage.length} to review, ${preview.counts.duplicate} duplicates skipped, ${preview.counts.possible} possible duplicates, ${preview.counts.unreadable} unreadable rows${failed.length > 0 ? `; IMPORTED DESPITE FAILED CHECKS (${failed.map((c) => c.name).join("; ")})` : ""}` });
  return { batchId, counts: { ...preview.counts, staged: stage.length } };
}
