// Turns one message into something for the review queue. The message is parsed deterministically first; Claude is only asked
// when the wording is financial but unreadable, and its answer must be backed by the message text. Everything lands as
// "unreviewed" through the same import path as a statement (so duplicates, merchant memory and rules all apply), and nothing
// counts until you approve it. A card-due message creates the card bill directly (it is not spending).
import type { Repository } from "@/data/repository";
import { looksFinancial, parseMessage } from "@/domain/capture/message";
import { senseAccount, type AccountLite } from "@/domain/import/sense";
import type { Account } from "@/domain/types";
import type { ClaudeConfig } from "@/lib/import/ai";
import { extractWithClaude } from "@/lib/import/ai-extract";
import { commitImport, ImportError, previewImport, type ImportDeps, type ImportInput } from "@/lib/import/service";
import { MAX_MESSAGE_CHARS } from "./types";

export type CaptureOutcome = "added" | "bill" | "duplicate" | "ignored" | "unreadable";
export interface CaptureResult { result: CaptureOutcome; /** One short line for the person, e.g. "₹450.00 added to review". */ message: string; /** Dry runs only: what would be added. */ preview?: { merchant: string; amountPaise: number; direction: "debit" | "credit"; account: string; kind: string; category: string; status: string } }
export interface CaptureDeps extends ImportDeps { claude: ClaudeConfig | null; today: string }

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pickAccount(text: string, accounts: Account[], fallbackId: string, only?: Account["type"]): { account: Account; sensed: boolean } | null {
  const pool = only ? accounts.filter((a) => a.type === only) : accounts.filter((a) => a.type !== "cash");
  const lite: AccountLite[] = pool.map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const s = senseAccount(text, lite);
  const hit = s.accountId && s.confidence !== "none" ? pool.find((a) => a.id === s.accountId) : undefined;
  if (hit) return { account: hit, sensed: true };
  const fb = pool.find((a) => a.id === fallbackId) ?? (only && pool.length === 1 ? pool[0] : undefined);
  return fb ? { account: fb, sensed: false } : null;
}

export async function captureMessage(repo: Repository, who: { uid: string; participantId: string; defaultAccountId: string }, rawText: string, d: CaptureDeps, opts: { dryRun?: boolean } = {}): Promise<CaptureResult> {
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARS);
  let parsed = parseMessage(text, d.today);
  const accounts = await repo.accounts.list();

  // Unreadable but clearly about money: ask Claude, whose rows must be found in the message itself.
  let byAi = false;
  if (parsed.kind === "unknown" || (parsed.kind === "ignore" && parsed.reason === "not a debit or a credit" && looksFinancial(text))) {
    if (d.claude && looksFinancial(text)) {
      const ex = await extractWithClaude(d.claude, text, "statement", { accounts: accounts.map((a) => ({ id: a.id, name: a.name })), today: d.today });
      const r = ex.rows[0];
      byAi = !!r || !!ex.bill?.dueDate;
      if (r) parsed = { kind: "transaction", amountPaise: r.amountPaise, direction: r.direction, date: r.date, description: r.description };
      else if (ex.bill?.dueDate) parsed = { kind: "bill", totalDuePaise: ex.bill.totalDuePaise, dueDate: ex.bill.dueDate, statementDate: ex.bill.statementDate };
    }
  }

  if (parsed.kind === "ignore" && parsed.reason === "not a debit or a credit" && looksFinancial(text)) return { result: "unreadable", message: "Could not read this message." };
  if (parsed.kind === "ignore") return { result: "ignored", message: `Skipped (${parsed.reason}).` };
  if (parsed.kind === "unknown") return { result: "unreadable", message: "Could not read this message." };

  if (parsed.kind === "bill") {
    const pick = pickAccount(text, accounts, who.defaultAccountId, "credit_card");
    if (!pick) return { result: "unreadable", message: "This looks like a card bill, but I could not tell which card. Add the card under Settings first." };
    if (!parsed.dueDate) return { result: "unreadable", message: "A card bill needs a due date, and this message has none." };
    const statementDate = parsed.statementDate ?? d.today;
    if (parsed.dueDate < statementDate) return { result: "ignored", message: "Skipped (due date is before the statement date)." };
    const id = d.sha256(`${pick.account.id}|${parsed.dueDate}|${parsed.totalDuePaise}`).slice(0, 24);
    if (await repo.cardBills.get(id)) return { result: "duplicate", message: "That card bill is already tracked." };
    if (!opts.dryRun) await repo.cardBills.put({ id, accountId: pick.account.id, statementDate, dueDate: parsed.dueDate, totalDuePaise: parsed.totalDuePaise, source: "message" });
    return { result: "bill", message: `${pick.account.name}: pay ${rupees(parsed.totalDuePaise)} in full by ${parsed.dueDate}${opts.dryRun ? " (not saved)" : ""}.` };
  }

  const pick = pickAccount(text, accounts, who.defaultAccountId);
  if (!pick) return { result: "unreadable", message: "Add a payment method under Settings first, so messages know where to go." };
  const input: ImportInput = {
    accountId: pick.account.id, ...(pick.sensed ? {} : { cardUnsure: true }), filename: "Captured message", fileHash: d.sha256(`${who.uid}|${text}`), format: "text", readBy: byAi ? "ai" : "parser",
    rows: [{ line: 1, date: parsed.date, description: parsed.description, amountPaise: parsed.amountPaise, direction: parsed.direction, ...(parsed.referenceId ? { referenceId: parsed.referenceId } : {}), raw: [text.slice(0, 500)] }],
  };
  if (opts.dryRun) {
    const p = await previewImport(repo, input, d);
    const row = p.rows[0];
    return { result: row.action === "skip" ? "duplicate" : "added", message: row.action === "skip" ? "Already in your records." : `${rupees(row.amountPaise)} would be added to review.`, preview: { merchant: row.merchant, amountPaise: row.amountPaise, direction: row.direction, account: accounts.find((a) => a.id === row.accountId)?.name ?? "", kind: row.kind, category: row.categoryId, status: row.status } };
  }
  try {
    const res = await commitImport(repo, { uid: who.uid, participantId: who.participantId }, input, d);
    if (res.counts.staged === 0) return { result: "duplicate", message: "Already in your records." };
    return { result: "added", message: `${rupees(parsed.amountPaise)} ${parsed.direction === "credit" ? "received" : "spent"} added to review.` };
  } catch (e) {
    if (e instanceof ImportError && e.code === "already_imported") return { result: "duplicate", message: "Already captured." };
    throw e;
  }
}
