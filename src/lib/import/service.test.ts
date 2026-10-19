import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import { parseCsv } from "@/domain/import/csv";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { commitImport, ImportError, MAX_ROWS, previewImport, type ImportDeps, type ImportInput } from "./service";

let n = 0;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const deps: ImportDeps = { sha256: sha, now: () => Date.parse("2026-10-18T10:00:00Z"), newId: () => `id${++n}` };
const actor = { uid: "u1", participantId: "u_u1" };

const bankCsv = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,UPI-SWIGGY-swiggy@icici-123456789012-Order,0000123456789012,01/09/26,612.00,,45388.00
01/09/26,NEFT CR-ACME LTD-SALARY SEP,N123,01/09/26,,"1,85,000.00","2,30,388.00"
05/09/26,CREDIT CARD PAYMENT HDFC 4471,REF5,05/09/26,"18,500.00",,"2,11,888.00"
`;
const file = (csv: string, over: { accountId?: string; positiveIsDebit?: boolean; acceptMismatch?: boolean } = {}): ImportInput => ({ accountId: "bank_hdfc", filename: "hdfc_sep.csv", format: "csv", fileHash: sha(csv), table: parseCsv(csv), ...over });

async function setup(): Promise<Repository> {
  const repo = createMemoryRepository("h");
  for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
  await repo.accounts.put({ id: "bank_hdfc", name: "HDFC Bank", type: "bank" });
  await repo.accounts.put({ id: "cc_hdfc", name: "HDFC Credit Card", type: "credit_card" });
  await repo.rules.put({ id: "r_swiggy", merchant: "Swiggy", categoryId: "food_delivery" });
  return repo;
}

describe("preview", () => {
  it("classifies, categorises and totals without writing anything", async () => {
    const repo = await setup();
    const p = await previewImport(repo, file(bankCsv), deps);
    expect(p.counts).toEqual({ rows: 3, new: 3, duplicate: 0, possible: 0, unreadable: 0, toImport: 3 });
    expect(p.rows.map((r) => [r.kind, r.categoryId, r.merchant])).toEqual([["purchase", "food_delivery", "Swiggy"], ["income", "income", "Neft Cr-Acme Ltd-Salary Sep"], ["cc_payment", "transfers", "Payment to HDFC Credit Card"]]);
    expect(p.totals).toMatchObject({ debitPaise: 61200 + 1850000, creditPaise: 18500000 });
    expect(await repo.records.list()).toEqual([]);
    expect(await repo.importBatches.list()).toEqual([]);
  });
  it("uses the card sign convention for card accounts, and the user can flip it", async () => {
    const repo = await setup();
    const csv = "Date,Transaction Details,Amount\n02/09/2026,SWIGGY BANGALORE IN,612.00\n13/09/2026,AMAZON REFUND,-1299.00\n";
    const card = await previewImport(repo, file(csv, { accountId: "cc_hdfc" }), deps);
    expect(card.rows.map((r) => [r.direction, r.kind])).toEqual([["debit", "purchase"], ["credit", "refund"]]);
    expect(card.singleAmountColumn).toBe(true);
    expect((await previewImport(repo, file(bankCsv), deps)).singleAmountColumn).toBe(false);
    const flipped = await previewImport(repo, file(csv, { accountId: "cc_hdfc", positiveIsDebit: false }), deps);
    expect(flipped.rows.map((r) => r.direction)).toEqual(["credit", "debit"]);
  });
  it("refuses an unknown account, a table-less file and oversized files", async () => {
    const repo = await setup();
    await expect(previewImport(repo, file(bankCsv, { accountId: "nope" }), deps)).rejects.toMatchObject({ code: "not_found" });
    await expect(previewImport(repo, file("hello,world\n1,2"), deps)).rejects.toMatchObject({ code: "invalid" });
    const big = "Date,Narration,Debit,Credit\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `01/09/2026,Row ${i},1.00,`).join("\n");
    await expect(previewImport(repo, file(big), deps)).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("commit", () => {
  it("saves the batch, every raw row, review-queue records and an audit event", async () => {
    const repo = await setup();
    const res = await commitImport(repo, actor, file(bankCsv), deps);
    expect(res.counts).toMatchObject({ rows: 3, staged: 3, duplicate: 0 });
    const records = await repo.records.list();
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.status === "unreviewed" && r.payerId === "u_u1" && r.shared === false)).toBe(true);
    expect(records.find((r) => r.merchant === "Swiggy")).toMatchObject({ amountPaise: 61200, kind: "purchase", categoryId: "food_delivery", originalDescription: "UPI-SWIGGY-swiggy@icici-123456789012-Order", date: "2026-09-01", accountId: "bank_hdfc" });
    const raws = await repo.rawTransactions.list();
    expect(raws.map((r) => r.line).sort()).toEqual([2, 3, 4]);
    expect(raws.find((r) => r.line === 2)!.cells[1]).toContain("SWIGGY");
    const batch = (await repo.importBatches.list())[0];
    expect(batch).toMatchObject({ filename: "hdfc_sep.csv", format: "csv", counts: { rows: 3, staged: 3, skippedDuplicate: 0 } });
    expect((await repo.audit.list()).map((e) => e.action)).toEqual(["import"]);
  });

  it("the same file again is not saved without consent, and other payment methods are unaffected", async () => {
    const repo = await setup();
    await commitImport(repo, actor, file(bankCsv), deps);
    await expect(commitImport(repo, actor, file(bankCsv), deps)).rejects.toMatchObject({ code: "already_imported" });
    expect(await repo.records.list()).toHaveLength(3);
    expect((await repo.importBatches.list())).toHaveLength(1);
    // a different payment method is a different statement, so no question is asked
    const other = await previewImport(repo, file(bankCsv, { accountId: "cc_hdfc" }), deps);
    expect(other.previousImport).toBeUndefined();
  });

  it("previewing a file that was imported before reports it (with what would happen) instead of failing", async () => {
    const repo = await setup();
    const first = await commitImport(repo, actor, file(bankCsv), deps);
    const p = await previewImport(repo, file(bankCsv), deps);
    expect(p.previousImport).toMatchObject({ batchId: first.batchId, filename: "hdfc_sep.csv", staged: 3 });
    expect(p.counts).toMatchObject({ rows: 3, duplicate: 3, new: 0 }); // everything is still there, so nothing would be added
    expect((await previewImport(repo, file("Date,Narration,Debit,Credit\n01/09/2026,New file,1.00,\n"), deps)).previousImport).toBeUndefined();
  });

  it("after entries were rejected, confirming brings back only the missing rows and never counts anything twice", async () => {
    const repo = await setup();
    await commitImport(repo, actor, file(bankCsv), deps);
    const rows = await repo.records.list();
    const gone = rows.filter((r) => r.merchant === "Swiggy" || r.kind === "cc_payment"); // two of the three were rejected
    for (const r of gone) await repo.records.remove(r.id);
    expect(await repo.records.list()).toHaveLength(1);

    const p = await previewImport(repo, file(bankCsv), deps);
    expect(p.counts).toMatchObject({ new: 2, duplicate: 1 });
    const res = await commitImport(repo, actor, file(bankCsv, {}), deps, ).catch((e) => e);
    expect(res).toBeInstanceOf(ImportError); // still refused without the owner's yes
    const again = await commitImport(repo, actor, { ...file(bankCsv), allowReimport: true }, deps);
    expect(again.counts).toMatchObject({ staged: 2, duplicate: 1 });
    expect(await repo.records.list()).toHaveLength(3);
    expect(new Set((await repo.records.list()).map((r) => r.referenceId)).size).toBe(3);
    const batches = await repo.importBatches.list();
    expect(batches).toHaveLength(2);
    expect(batches.filter((b) => b.reimportOf).map((b) => b.reimportOf)).toEqual([batches.find((b) => !b.reimportOf)!.id]);
    expect((await repo.audit.list()).at(-1)!.summary).toMatch(/^RE-IMPORTED/);
  });

  it("confirming when everything is still there adds nothing", async () => {
    const repo = await setup();
    await commitImport(repo, actor, file(bankCsv), deps);
    const again = await commitImport(repo, actor, { ...file(bankCsv), allowReimport: true }, deps);
    expect(again.counts).toMatchObject({ staged: 0, duplicate: 3 });
    expect(await repo.records.list()).toHaveLength(3);
  });

  it("an overlapping statement skips rows already imported and adds only the new ones", async () => {
    const repo = await setup();
    await commitImport(repo, actor, file(bankCsv), deps);
    const overlap = bankCsv + "09/09/26,UPI-ZEPTO-zepto@yesb-987654321098-Order,0000987654321098,09/09/26,899.00,,\n";
    const res = await commitImport(repo, actor, file(overlap), deps);
    expect(res.counts).toMatchObject({ rows: 4, duplicate: 3, staged: 1 });
    expect(await repo.records.list()).toHaveLength(4);
    expect((await repo.importBatches.list()).map((b) => b.counts.skippedDuplicate).sort()).toEqual([0, 3]);
  });

  it("identical rows inside one file are both kept (two real purchases), while a re-upload of them is not duplicated", async () => {
    const repo = await setup();
    const twice = "Date,Narration,Debit,Credit\n03/09/2026,CCD KORAMANGALA,120.00,\n03/09/2026,CCD KORAMANGALA,120.00,\n";
    const first = await commitImport(repo, actor, file(twice, { accountId: "cc_hdfc" }), deps);
    expect(first.counts.staged).toBe(2);
    const other = twice + "04/09/2026,UBER INDIA,200.00,\n"; // different file, same two rows plus one new
    const second = await commitImport(repo, actor, file(other, { accountId: "cc_hdfc" }), deps);
    expect(second.counts).toMatchObject({ duplicate: 2, staged: 1 });
    expect(await repo.records.list()).toHaveLength(3);
  });

  it("flags, but still stages, a row that looks like an existing record with a different reference", async () => {
    const repo = await setup();
    await repo.records.put({ id: "old", date: "2026-09-01", merchant: "Swiggy", originalDescription: "typed", amountPaise: 61200, currency: "INR", accountId: "bank_hdfc", categoryId: "food_delivery", kind: "purchase", payerId: "u_u1", shared: false, split: { mode: "personal", participantIds: ["u_u1"] }, excluded: false, status: "reviewed", importSource: "Manual entry" });
    const res = await commitImport(repo, actor, file(bankCsv), deps);
    expect(res.counts).toMatchObject({ possible: 1, staged: 3 });
    const flagged = (await repo.records.list()).find((r) => r.duplicateOf === "old");
    expect(flagged).toBeTruthy();
    expect(flagged!.status).toBe("unreviewed");
  });

  it("falls back to Uncategorized when a default category was deleted, and reports unreadable rows without dropping silently", async () => {
    const repo = await setup();
    await repo.categories.remove("transfers");
    const csv = bankCsv + "garbage line,with,three cells\n";
    const res = await commitImport(repo, actor, file(csv), deps);
    expect(res.counts.unreadable).toBe(1);
    expect((await repo.records.list()).find((r) => r.kind === "cc_payment")!.categoryId).toBe("uncategorized");
    expect((await repo.importBatches.list())[0].counts.unreadable).toBe(1);
  });

  it("imported bank fields stay immutable after commit (the repository refuses edits to them)", async () => {
    const repo = await setup();
    await commitImport(repo, actor, file(bankCsv), deps);
    const r = (await repo.records.list())[0];
    await expect(repo.records.put({ ...r, amountPaise: r.amountPaise + 1 })).rejects.toThrow();
    await expect(repo.records.put({ ...r, categoryId: "shopping", status: "reviewed" })).resolves.toBeTruthy();
  });
});

describe("smart routing and text input", () => {
  const text = (rows: { description: string; amountPaise: number; direction?: "debit" | "credit" }[], over: Record<string, unknown> = {}) => ({
    accountId: "bank_hdfc", filename: "pasted text", fileHash: "e".repeat(64), format: "text" as const, readBy: "parser" as const,
    rows: rows.map((r, i) => ({ line: i + 1, date: "2026-09-10", description: r.description, amountPaise: r.amountPaise, direction: r.direction ?? "debit", raw: [r.description] })), ...over,
  });
  it("files a GPay payment inside a bank statement under GPay, funded by the bank", async () => {
    const repo = await setup();
    await repo.accounts.put({ id: "gpay", name: "GPay", type: "upi" });
    const p = await previewImport(repo, text([{ description: "UPI-GPAY-ZEPTO-9988", amountPaise: 45000 }]), deps);
    expect(p.rows[0]).toMatchObject({ accountId: "gpay", fundedBy: "bank_hdfc" });
  });
  it("stages text rows as unreviewed and records who read them", async () => {
    const repo = await setup();
    const actor = { uid: "u1", participantId: "p1" };
    await commitImport(repo, actor, text([{ description: "Swiggy order", amountPaise: 45000 }], { readBy: "ai", unverified: ["Fake 999"] }), deps);
    const [rec] = await repo.records.list();
    expect(rec).toMatchObject({ status: "unreviewed", amountPaise: 45000 });
    expect((await repo.importBatches.list())[0]).toMatchObject({ format: "text", readBy: "ai" });
  });
});

describe("duplicate decisions", () => {
  it("skips exact duplicates by default, shows what they match, and imports them anyway only when told to", async () => {
    const repo = await setup();
    const actor = { uid: "u1", participantId: "p1" };
    await commitImport(repo, actor, file(bankCsv), deps);
    const again = { ...file(bankCsv), fileHash: "f".repeat(64) }; // same rows, different file
    const p = await previewImport(repo, again, deps);
    expect(p.rows.every((r) => r.status === "duplicate" && r.action === "skip" && !!r.match)).toBe(true);
    expect(p.counts).toMatchObject({ duplicate: 3, toImport: 0 });
    const line = p.rows[0].line;
    const forced = await previewImport(repo, { ...again, decisions: { [String(line)]: "import" } }, deps);
    expect(forced.counts.toImport).toBe(1);
    const res = await commitImport(repo, actor, { ...again, decisions: { [String(line)]: "import" } }, deps);
    expect(res.counts).toMatchObject({ staged: 1, skipped: 2 });
    const staged = (await repo.records.list()).filter((r) => r.importSource.includes("hdfc_sep") && r.duplicateOf);
    expect(staged).toHaveLength(1); // the forced one is flagged as a duplicate of the existing entry
  });
  it("a possible duplicate is added (flagged) by default and can be skipped", async () => {
    const repo = await setup();
    await commitImport(repo, { uid: "u1", participantId: "p1" }, file(bankCsv), deps);
    const rows = [{ line: 1, date: "2026-09-01", description: "UPI-SWIGGY-OTHER", amountPaise: 61200, direction: "debit" as const, raw: ["x"] }];
    const input = { accountId: "bank_hdfc", filename: "t", fileHash: "9".repeat(64), format: "text" as const, readBy: "parser" as const, rows };
    const p = await previewImport(repo, input, deps);
    expect(p.rows[0]).toMatchObject({ status: "possible", action: "import" });
    expect((await previewImport(repo, { ...input, decisions: { "1": "skip" } }, deps)).counts.toImport).toBe(0);
  });
});

describe("monthly commitments", () => {
  const textInput = (rows: { description: string; amountPaise: number; recurringHint?: boolean }[]) => ({
    accountId: "bank_hdfc", filename: "t", fileHash: "7".repeat(64), format: "text" as const, readBy: "parser" as const,
    rows: rows.map((r, i) => ({ line: i + 1, date: "2026-09-05", description: r.description, amountPaise: r.amountPaise, direction: "debit" as const, raw: [r.description], recurringHint: r.recurringHint })),
  });
  it("flags EMIs and AI-sensed commitments, leaves ordinary purchases, and stages the hint for review", async () => {
    const repo = await setup();
    const input = textInput([{ description: "ACH D- HDFC BANK LTD-EMI 4471", amountPaise: 1850000 }, { description: "SWIGGY ORDER 991", amountPaise: 45000 }, { description: "CITY GYM", amountPaise: 300000, recurringHint: true }]);
    const p = await previewImport(repo, input, deps);
    expect(p.rows.map((r) => !!r.recurring)).toEqual([true, false, true]);
    await commitImport(repo, { uid: "u1", participantId: "p1" }, input, deps);
    const staged = await repo.records.list();
    expect(staged.filter((r) => r.recurringHint).map((r) => r.originalDescription).sort()).toEqual(["ACH D- HDFC BANK LTD-EMI 4471", "CITY GYM"]);
  });
  it("flags a payment that appeared at the same amount in two earlier months", async () => {
    const repo = await setup();
    for (const [i, date] of ["2026-07-05", "2026-08-05"].entries()) {
      await repo.records.put({ id: `h${i}`, date, merchant: "Gym", originalDescription: "CITY GYM CLUB", amountPaise: 300000, currency: "INR", accountId: "bank_hdfc", categoryId: "health", kind: "purchase", payerId: "p1", shared: false, split: { mode: "personal", participantIds: ["p1"] }, excluded: false, status: "reviewed", importSource: "x", referenceId: `H${i}` });
    }
    const p = await previewImport(repo, textInput([{ description: "CITY GYM CLUB", amountPaise: 300000 }]), deps);
    expect(p.rows[0].recurring).toBe(true);
  });
});


describe("voucher sellers", () => {
  const textInput = (description: string, over: Record<string, unknown> = {}) => ({
    accountId: "cc_hdfc", filename: "t", fileHash: "8".repeat(64), format: "text" as const, readBy: "parser" as const,
    rows: [{ line: 1, date: "2026-09-05", description, amountPaise: 1_000_000, direction: "debit" as const, raw: [description] }], ...over,
  });
  it("shows Shopwise for the CUST CAP SOLUTIONS descriptor, keeps the statement text, asks for the voucher at review, and never asks Claude about it", async () => {
    const repo = await setup();
    let asked = 0;
    const d: ImportDeps = { ...deps, suggest: async () => { asked++; return { suggestions: [], usage: { asked: 0, calls: 0, inputTokens: 0, outputTokens: 0 } }; } };
    const input = textInput("POS 4471 CUST CAP SOLUTIONS BANGALORE IN");
    const p = await previewImport(repo, input, d);
    expect(p.rows[0]).toMatchObject({ merchant: "Shopwise", kind: "purchase", voucher: true });
    expect(asked).toBe(0);
    await commitImport(repo, { uid: "u1", participantId: "p1" }, input, d);
    const [rec] = await repo.records.list();
    expect(rec).toMatchObject({ merchant: "Shopwise", originalDescription: "POS 4471 CUST CAP SOLUTIONS BANGALORE IN", status: "unreviewed", voucherPending: true });
    expect(rec.voucherBrandId).toBeUndefined();
  });
  it("a merchant you confirmed as a voucher seller asks every time, under your own name for it", async () => {
    const repo = await setup();
    await repo.merchantMemory.put({ id: "mm_gift_hub", key: "gift hub", name: "Gift Hub", categoryId: "shopping", kind: "purchase", source: "user", confident: true, confirmed: 2, lastSeen: "2026-09-01", voucherSeller: true });
    const p = await previewImport(repo, textInput("GIFT HUB MUMBAI"), deps);
    expect(p.rows[0]).toMatchObject({ merchant: "Gift Hub", voucher: true });
  });
  it("an ordinary merchant is not a voucher seller", async () => {
    const repo = await setup();
    expect((await previewImport(repo, textInput("SWIGGY ORDER"), deps)).rows[0].voucher).toBeFalsy();
  });
});
