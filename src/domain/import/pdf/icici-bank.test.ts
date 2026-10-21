import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createMemoryRepository } from "@/data/memory-repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { commitImport } from "@/lib/import/service";
import { parseStatementPdf } from ".";
import { detectIciciBank } from "./icici-bank";
import { page, t } from "./test-fixtures";
import type { PdfItem } from "./types";

// An invented ICICI-style statement. Positions imitate the printed layout (PDF points, y grows upward); no real data.
const head = (): PdfItem[] => [
  t(59, 737, "Statement of Transactions in Saving Account no. 123456789012 in INR for the period August 1, 2026 - August 31, 2026"),
  t(60, 619, "Transaction"), t(399, 619, "Withdrawal"), t(474, 619, "Deposit"), t(532, 619, "Balance"),
  t(24, 614, "S No."), t(122, 614, "Cheque Number"), t(247, 614, "Transaction Remarks"),
  t(74, 609, "Date"), t(396, 609, "Amount (INR)"), t(462, 609, "Amount (INR)"), t(538, 609, "(INR)"),
];
const amt = (right: number, text: string) => t(right - text.length * 5.2, 0, text);
/** One transaction: the first remark line is printed 5 points above the line that carries the date and amounts. */
function txn(y: number, sno: number, date: string, remarks: string[], opts: { out?: string; inn?: string; bal: string }): PdfItem[] {
  const at = (it: PdfItem, yy: number): PdfItem => ({ ...it, y: yy });
  return [
    t(30, y, String(sno)), t(61, y, date),
    ...(opts.out ? [at(amt(458, opts.out), y)] : []), ...(opts.inn ? [at(amt(524, opts.inn), y)] : []), at(amt(577, opts.bal), y),
    ...remarks.map((r, i) => t(192, y + 5 - i * 10, r)),
  ];
}
const footer = (): PdfItem[] => [t(230, 64, "www.icici.bank.in"), t(192, 50, "Never share your OTP, CVV or passwords with anyone")];

const standard = () => [page(1, [
  ...head(),
  ...txn(589, 1, "01.08.2026", ["UPI/Test Mart/shop@bank/Payment", "from PhonePe/ICI/1234"], { out: "250.00", bal: "9,750.00" }),
  ...txn(559, 2, "03.08.2026", ["NEFT-DEMO SALARY-ACME LTD"], { inn: "20,000.00", bal: "29,750.00" }),
  ...txn(539, 3, "05.08.2026", ["ACH/Sample Insurance/9999", "Policy"], { out: "1,750.50", bal: "27,999.50" }),
  ...footer(),
])];

describe("ICICI Bank statement reader", () => {
  it("recognises the layout and reads every row, its direction and its wrapped remarks", () => {
    expect(detectIciciBank(standard())).toBe(true);
    const r = parseStatementPdf(standard());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.date, x.direction, x.amountPaise])).toEqual([["2026-08-01", "debit", 25000], ["2026-08-03", "credit", 2000000], ["2026-08-05", "debit", 175050]]);
    expect(r.rows[0].description).toBe("UPI/Test Mart/shop@bank/Payment from PhonePe/ICI/1234");
    expect(r.rows[2].description).toBe("ACH/Sample Insurance/9999 Policy");
    expect(r.summary).toMatchObject({ issuer: "ICICI Bank", periodStart: "2026-08-01", periodEnd: "2026-08-31", openingPaise: 1000000, closingPaise: 2799950 });
  });
  it("checks every balance against the one before and finds nothing wrong in a clean statement", () => {
    const r = parseStatementPdf(standard());
    expect(r.ok && r.checks.every((c) => c.ok)).toBe(true);
  });
  it("flags a row that does not follow from the previous balance", () => {
    const bad = [page(1, [...head(), ...txn(589, 1, "01.08.2026", ["UPI/A"], { out: "250.00", bal: "9,750.00" }), ...txn(559, 2, "03.08.2026", ["UPI/B"], { out: "100.00", bal: "9,000.00" }), ...footer()])];
    const r = parseStatementPdf(bad);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.checks.find((x) => x.name.startsWith("Each balance"))!;
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("S No. 2");
  });
  it("flags a missing row number", () => {
    const gap = [page(1, [...head(), ...txn(589, 1, "01.08.2026", ["UPI/A"], { out: "250.00", bal: "9,750.00" }), ...txn(559, 3, "03.08.2026", ["UPI/C"], { out: "50.00", bal: "9,700.00" }), ...footer()])];
    const r = parseStatementPdf(gap);
    expect(r.ok && r.checks.find((x) => x.name === "No row is missing")?.ok).toBe(false);
  });
  it("still refuses a layout it does not know", () => {
    const r = parseStatementPdf([page(1, [t(10, 700, "Some other bank statement")])]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ICICI");
  });
});

describe("ICICI statement all the way into the review queue", () => {
  it("numbers its rows from 1 (the saved raw rows require it) and saves every row", async () => {
    const r = parseStatementPdf(standard());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.index)).toEqual([1, 2, 3]);
    const repo = createMemoryRepository("h");
    for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
    await repo.accounts.put({ id: "bank_icici", name: "ICICI Bank", type: "bank" });
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const res = await commitImport(repo, { uid: "u1", participantId: "u_u1" }, { accountId: "bank_icici", filename: "OpTransactionHistory.pdf", fileHash: sha("statement"), format: "pdf", pdf: r }, { sha256: sha, now: () => Date.parse("2026-10-21T00:00:00Z"), newId: () => crypto.randomUUID() });
    expect(res.counts.staged).toBe(3);
    expect(await repo.records.list()).toHaveLength(3);
    expect(await repo.rawTransactions.list()).toHaveLength(3);
  });
});
