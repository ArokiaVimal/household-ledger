import { describe, expect, it } from "vitest";
import { parseStatementPdf } from "./index";
import type { PdfItem, PdfPage } from "./types";

// Invented data that imitates the printed layout: positions in PDF points, y grows upward.
const t = (x: number, y: number, text: string): PdfItem => ({ x, y, text });

function header(period = "From September 9 to October 9, 2026", sums = ["10,000.00", "1,500.00", "3,000.00", "11,500.00", "575.00"]): PdfItem[] {
  return [
    t(71, 794, "American Express® Platinum Travel Credit Card"), t(71, 779, "Statement of Account"),
    t(48, 705, "Opening Balance Rs"), t(167, 705, "New Credits Rs"), t(276, 705, "New Debits Rs"), t(370, 705, "Closing Balance Rs"), t(469, 705, "Minimum Payment Rs"),
    t(55, 687, sums[0]), t(112, 687, "-"), t(163, 687, sums[1]), t(217, 687, "+"), t(273, 687, sums[2]), t(324, 687, "="), t(379, 687, sums[3]), t(485, 687, sums[4]),
    t(14, 573, "Statement Period"), t(158, 573, period),
    t(14, 494, "Details"), t(344, 494, "Foreign Currency"), t(490, 494, "Amount Rs"),
  ];
}
const row = (y: number, date: string, desc: string, amount: string, opts: { cr?: boolean; foreign?: string; extra?: string } = {}): PdfItem[] => [
  t(14, y, date), t(86, y, desc), ...(opts.extra ? [t(211, y, opts.extra)] : []), ...(opts.foreign ? [t(344, y, opts.foreign)] : []), t(530 - amount.length * 4.5, y, amount), ...(opts.cr ? [t(512, y - 10, "CR")] : []),
];
const page = (n: number, items: PdfItem[]): PdfPage => ({ number: n, items });

const standard = (): PdfPage[] => [
  page(1, [
    ...header(),
    ...row(478, "September 10", "TEST MART BANGALORE", "1,000.00"),
    ...row(460, "September 12", "SAMPLE CAFE", "500.00"),
    ...row(442, "September 14", "REFUND SAMPLE SHOP", "1,500.00", { cr: true }),
    ...row(424, "September 20", "DEMO TRAVEL", "1,500.00"),
  ]),
];

describe("Amex India statement parser", () => {
  it("reads rows, directions, years and exact paise; every self-check passes", () => {
    const r = parseStatementPdf(standard());
    if (!r.ok) throw new Error(r.error);
    expect(r.rows.map((x) => [x.date, x.description, x.amountPaise, x.direction])).toEqual([
      ["2026-09-10", "TEST MART BANGALORE", 100000, "debit"], ["2026-09-12", "SAMPLE CAFE", 50000, "debit"],
      ["2026-09-14", "REFUND SAMPLE SHOP", 150000, "credit"], ["2026-09-20", "DEMO TRAVEL", 150000, "debit"],
    ]);
    expect(r.summary).toMatchObject({ periodStart: "2026-09-09", periodEnd: "2026-10-09", openingPaise: 1000000, newCreditsPaise: 150000, newDebitsPaise: 300000, closingPaise: 1150000, minimumDuePaise: 57500 });
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.checks).toHaveLength(3);
  });

  it("a CR marker belongs to the row just above it, never to the next row", () => {
    const r = parseStatementPdf(standard());
    if (!r.ok) throw new Error(r.error);
    expect(r.rows.filter((x) => x.direction === "credit").map((x) => x.description)).toEqual(["REFUND SAMPLE SHOP"]);
    expect(r.rows[3].direction).toBe("debit");
  });

  it("a missing row makes the totals check fail and says by how much", () => {
    const pages = standard();
    pages[0].items = pages[0].items.filter((i) => !(i.y >= 459 && i.y <= 461)); // drop the SAMPLE CAFE row
    const r = parseStatementPdf(pages);
    if (!r.ok) throw new Error(r.error);
    const bad = r.checks.find((c) => !c.ok)!;
    expect(bad.name).toMatch(/Debits/);
    expect(bad.detail).toContain("₹3000.00");
    expect(bad.detail).toContain("₹2500.00");
  });

  it("works across pages and takes the year from the period when it spans New Year", () => {
    const pages: PdfPage[] = [
      page(1, [...header("From December 9 to January 9, 2027", ["0.00", "0.00", "300.00", "300.00", "15.00"]), ...row(478, "December 20", "YEAR END SHOP", "100.00")]),
      page(2, [...row(671, "January 2", "NEW YEAR SHOP", "200.00")]),
    ];
    const r = parseStatementPdf(pages);
    if (!r.ok) throw new Error(r.error);
    expect(r.rows.map((x) => [x.date, x.page])).toEqual([["2026-12-20", 1], ["2027-01-02", 2]]);
    expect(r.summary.periodStart).toBe("2026-12-09");
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("joins extra description runs, ignores the foreign-currency column, and appends continuation lines", () => {
    const pages: PdfPage[] = [page(1, [
      ...header(undefined, ["0.00", "0.00", "950.00", "950.00", "47.50"]),
      ...row(478, "September 3", "SAMPLE STORE", "700.00", { extra: "MUMBAI", foreign: "USD 8.00" }),
      ...row(460, "September 4", "VERY LONG MERCHANT NAME", "250.00"),
      t(86, 452, "SECOND LINE OF NAME"),
    ])];
    const r = parseStatementPdf(pages);
    if (!r.ok) throw new Error(r.error);
    expect(r.rows[0]).toMatchObject({ description: "SAMPLE STORE MUMBAI", amountPaise: 70000 });
    expect(r.rows[0].raw).toContain("foreign: USD 8.00");
    expect(r.rows[1].description).toBe("VERY LONG MERCHANT NAME SECOND LINE OF NAME");
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("warns about a dated line with no readable amount instead of dropping it silently", () => {
    const pages = standard();
    pages[0].items.push(t(14, 406, "September 25"), t(86, 406, "NO AMOUNT HERE"));
    const r = parseStatementPdf(pages);
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings.join(" ")).toMatch(/September 25/);
    expect(r.rows).toHaveLength(4);
  });

  it("reads a credit (CR) closing balance as negative", () => {
    const items = header(undefined, ["100.00", "1,000.00", "0.00", "900.00", "0.00"]);
    items.push(t(415, 687, "CR"));
    const r = parseStatementPdf([page(1, [...items, ...row(478, "September 10", "REFUND ONLY", "1,000.00", { cr: true })])]);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary.closingPaise).toBe(-90000);
  });

  it("refuses other layouts and files without a statement period; never guesses", () => {
    const other = parseStatementPdf([page(1, [t(14, 700, "Some Other Bank Credit Card Statement"), ...row(600, "September 10", "SHOP", "100.00")])]);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toMatch(/not supported yet/);
    const noPeriod = parseStatementPdf([page(1, [t(71, 794, "American Express Card"), t(71, 779, "Statement of Account"), ...row(478, "September 10", "SHOP", "100.00")])]);
    expect(noPeriod.ok).toBe(false);
    if (!noPeriod.ok) expect(noPeriod.error).toMatch(/statement period/);
  });
});
