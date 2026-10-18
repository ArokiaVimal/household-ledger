import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { parseStatementPdf } from "@/domain/import/pdf";
import { header, page, row, standard } from "@/domain/import/pdf/test-fixtures";
import type { PdfPage } from "@/domain/import/pdf/types";
import { commitImport, ImportError, previewImport, type ImportDeps, type ImportInput } from "./service";

let n = 0;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const deps: ImportDeps = { sha256: sha, now: () => Date.parse("2026-10-18T10:00:00Z"), newId: () => `id${++n}` };
const actor = { uid: "u1", participantId: "u_u1" };
const pdfInput = (pages: PdfPage[], over: { accountId?: string; acceptMismatch?: boolean; hash?: string } = {}): ImportInput => ({
  accountId: over.accountId ?? "cc_amex", filename: "amex_sep.pdf", format: "pdf", fileHash: over.hash ?? sha(JSON.stringify(pages)), pdf: parseStatementPdf(pages), acceptMismatch: over.acceptMismatch,
});

async function setup(): Promise<Repository> {
  const repo = createMemoryRepository("h");
  for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
  await repo.accounts.put({ id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" });
  await repo.accounts.put({ id: "bank_hdfc", name: "HDFC Bank", type: "bank" });
  await repo.rules.put({ id: "r_test_mart", merchant: "Test Mart", categoryId: "groceries" });
  return repo;
}

// 4 rows from the shared invented statement, plus a payment received (a credit that is NOT a refund) and totals to match.
const withPayment = (): PdfPage[] => [page(1, [
  ...header(undefined, ["10,000.00", "2,000.00", "3,000.00", "11,000.00", "550.00"]),
  ...row(496, "September 5", "PAYMENT RECEIVED. THANK YOU", "500.00", { cr: true }),
  ...row(478, "September 10", "TEST MART BANGALORE", "1,000.00"),
  ...row(460, "September 12", "SAMPLE CAFE", "500.00"),
  ...row(442, "September 14", "REFUND SAMPLE SHOP", "1,500.00", { cr: true }),
  ...row(424, "September 20", "DEMO TRAVEL", "1,500.00"),
])];

describe("PDF statement import", () => {
  it("previews rows, kinds and categories, and every self-check passes", async () => {
    const repo = await setup();
    const p = await previewImport(repo, pdfInput(withPayment()), deps);
    expect(p.format).toBe("pdf");
    expect(p.summary).toMatchObject({ issuer: "American Express (India)", periodStart: "2026-09-09", closingPaise: 1100000 });
    expect(p.checks.every((c) => c.ok)).toBe(true);
    expect(p.checks.map((c) => c.name)).toContain("Payment method matches the statement's issuer");
    expect(p.rows.map((r) => [r.merchant, r.direction, r.kind])).toEqual([
      ["Payment Received. Thank You", "credit", "cc_payment"], ["Test Mart Bangalore", "debit", "purchase"], ["Sample Cafe", "debit", "purchase"], ["Refund Sample Shop", "credit", "refund"], ["Demo Travel", "debit", "purchase"],
    ]);
    expect(p.rows[0].categoryId).toBe("transfers");
    expect(p.rows[3].categoryId).toBe("refunds");
    expect(p.counts).toMatchObject({ rows: 5, new: 5, duplicate: 0, unreadable: 0 });
    expect(p.totals).toMatchObject({ debitPaise: 300000, creditPaise: 200000 });
    expect(await repo.records.list()).toEqual([]); // preview writes nothing
  });

  it("commit stages unreviewed records, keeps raw rows (with the page), and records that checks passed", async () => {
    const repo = await setup();
    const res = await commitImport(repo, actor, pdfInput(withPayment()), deps);
    expect(res.counts).toMatchObject({ rows: 5, staged: 5 });
    const records = await repo.records.list();
    expect(records.every((r) => r.status === "unreviewed" && r.accountId === "cc_amex")).toBe(true);
    expect(records.find((r) => r.merchant === "Sample Cafe")).toMatchObject({ amountPaise: 50000, date: "2026-09-12", kind: "purchase" });
    const raws = await repo.rawTransactions.list();
    expect(raws).toHaveLength(5);
    expect(raws[0].cells[0]).toMatch(/^page 1$/);
    expect((await repo.importBatches.list())[0]).toMatchObject({ format: "pdf", checksPassed: true, acceptedMismatch: false });
  });

  it("a failed totals check blocks the import and writes nothing", async () => {
    const repo = await setup();
    const pages = withPayment();
    pages[0].items = pages[0].items.filter((i) => !(i.y >= 459 && i.y <= 461)); // lose the SAMPLE CAFE row
    const p = await previewImport(repo, pdfInput(pages), deps);
    expect(p.checks.some((c) => !c.ok)).toBe(true);
    await expect(commitImport(repo, actor, pdfInput(pages), deps)).rejects.toMatchObject({ code: "check_failed" });
    expect(await repo.records.list()).toEqual([]);
    expect(await repo.rawTransactions.list()).toEqual([]);
    expect(await repo.importBatches.list()).toEqual([]);
  });

  it("acceptMismatch lets a person import anyway, and the batch and audit trail say so", async () => {
    const repo = await setup();
    const pages = withPayment();
    pages[0].items = pages[0].items.filter((i) => !(i.y >= 459 && i.y <= 461));
    const res = await commitImport(repo, actor, pdfInput(pages, { acceptMismatch: true }), deps);
    expect(res.counts.staged).toBe(4);
    expect((await repo.importBatches.list())[0]).toMatchObject({ checksPassed: false, acceptedMismatch: true });
    expect((await repo.audit.list())[0].summary).toMatch(/IMPORTED DESPITE FAILED CHECKS/);
  });

  it("importing an Amex statement into the wrong payment method is blocked like any failed check", async () => {
    const repo = await setup();
    const p = await previewImport(repo, pdfInput(withPayment(), { accountId: "bank_hdfc" }), deps);
    const bad = p.checks.find((c) => !c.ok)!;
    expect(bad.name).toMatch(/Payment method/);
    expect(bad.detail).toContain("HDFC Bank");
    await expect(commitImport(repo, actor, pdfInput(withPayment(), { accountId: "bank_hdfc" }), deps)).rejects.toMatchObject({ code: "check_failed" });
  });

  it("the same file is refused twice; an overlapping statement only adds what is new", async () => {
    const repo = await setup();
    await commitImport(repo, actor, pdfInput(withPayment()), deps);
    await expect(commitImport(repo, actor, pdfInput(withPayment()), deps)).rejects.toMatchObject({ code: "already_imported" });

    const next: PdfPage[] = [page(1, [
      ...header("From September 18 to October 18, 2026", ["11,000.00", "0.00", "2,300.00", "13,300.00", "665.00"]),
      ...row(478, "September 20", "DEMO TRAVEL", "1,500.00"), // already imported
      ...row(460, "October 2", "NEW OCTOBER SHOP", "800.00"),
    ])];
    const res = await commitImport(repo, actor, pdfInput(next), deps);
    expect(res.counts).toMatchObject({ rows: 2, duplicate: 1, staged: 1 });
    expect(await repo.records.list()).toHaveLength(6);
  });

  it("an unreadable or unsupported PDF is a clear error", async () => {
    const repo = await setup();
    await expect(previewImport(repo, pdfInput([page(1, [])]), deps)).rejects.toBeInstanceOf(ImportError);
    await expect(previewImport(repo, pdfInput(standard().map((p) => ({ ...p, items: p.items.filter((i) => !/american express/i.test(i.text)) }))), deps)).rejects.toMatchObject({ code: "invalid" });
  });
});
