// Opt-in, LOCAL ONLY: parses a real statement PDF you point it at and asserts the parser's own checks pass.
// It prints counts and pass/fail only, never descriptions or amounts. The PDF is never committed.
//   STATEMENT_FIXTURE_AMEX=/path/to/statement.pdf node node_modules/vitest/vitest.mjs run tests/integration/pdf-real-statement.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createMemoryRepository } from "@/data/memory-repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { parseStatementPdf } from "@/domain/import/pdf";
import { commitImport, previewImport } from "@/lib/import/service";
import { readPdfPages } from "@/lib/import/pdf";

const path = process.env.STATEMENT_FIXTURE_AMEX;

describe.skipIf(!path)("real Amex India statement (local)", () => {
  it("reads and passes its own totals checks", async () => {
    const pages = await readPdfPages(new Uint8Array(readFileSync(path!)));
    const r = parseStatementPdf(pages);
    if (!r.ok) throw new Error(`parser refused: ${r.error}`);
    const debits = r.rows.filter((x) => x.direction === "debit").length;
    console.log(JSON.stringify({ pages: pages.length, rows: r.rows.length, debits, credits: r.rows.length - debits, warnings: r.warnings.length, summaryFields: Object.keys(r.summary).sort(), checks: r.checks.map((c) => ({ name: c.name, ok: c.ok })), periodYears: [r.summary.periodStart?.slice(0, 4), r.summary.periodEnd?.slice(0, 4)] }));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.warnings).toEqual([]);
  }, 60_000);

  it("runs through the whole import service: preview, commit, and re-upload refusal", async () => {
    const bytes = new Uint8Array(readFileSync(path!));
    const pdf = parseStatementPdf(await readPdfPages(bytes));
    const repo = createMemoryRepository("local");
    for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
    await repo.accounts.put({ id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" });
    const deps = { sha256: (x: string) => createHash("sha256").update(x).digest("hex"), now: () => Date.now(), newId: () => crypto.randomUUID() };
    const input = { accountId: "cc_amex", filename: "statement.pdf", format: "pdf" as const, fileHash: createHash("sha256").update(bytes).digest("hex"), pdf };
    const p = await previewImport(repo, input, deps);
    const kinds: Record<string, number> = {};
    for (const r of p.rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
    console.log(JSON.stringify({ previewRows: p.rows.length, kinds, newRows: p.counts.new, checksOk: p.checks.every((c) => c.ok), unreadable: p.counts.unreadable }));
    expect(p.checks.every((c) => c.ok)).toBe(true);
    const res = await commitImport(repo, { uid: "u", participantId: "u_u" }, input, deps);
    expect(res.counts.staged).toBe(p.rows.length);
    await expect(commitImport(repo, { uid: "u", participantId: "u_u" }, input, deps)).rejects.toMatchObject({ code: "already_imported" });
  }, 60_000);
});
