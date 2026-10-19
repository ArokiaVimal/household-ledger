import { describe, expect, it } from "vitest";
import { readDueDate } from "./amex-india";
import { parseStatementPdf } from "./index";
import { toLines } from "./lines";
import type { PdfPage } from "./types";

import { header, page, row, standard, t } from "./test-fixtures";

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

describe("readDueDate", () => {
  const due = (...items: ReturnType<typeof t>[]) => readDueDate(toLines([page(1, items)]));
  it("reads a printed payment due date in the usual formats, on the same line or the next", () => {
    expect(due(t(14, 600, "Payment Due Date"), t(158, 600, "October 29, 2026"))).toBe("2026-10-29");
    expect(due(t(14, 600, "Payment Due Date"), t(14, 585, "29 Oct 2026"))).toBe("2026-10-29");
    expect(due(t(14, 600, "Due Date: 29/10/2026"))).toBe("2026-10-29");
  });
  it("returns nothing when no due date is printed", () => {
    expect(due(t(14, 600, "Statement of Account"), t(14, 585, "October 9, 2026"))).toBeUndefined();
  });
});
