import { describe, expect, it } from "vitest";
import { parseStatementPdf } from ".";
import { detectIciciCard } from "./icici-card";
import { page, t } from "./test-fixtures";
import type { PdfItem } from "./types";

// An invented statement in the printed layout. Page 1 carries the summary, so its table sits further right than on later pages.
const row = (x0: number, y: number, date: string, ser: string, desc: string, pts: string, amount: string): PdfItem[] => [t(x0, y, date), t(x0 + 44, y, ser), t(x0 + 97, y, desc), t(x0 + 245, y, pts), t(x0 + 330, y, amount)];
const first = (): PdfItem[] => [
  t(14, 790, "CREDIT CARD STATEMENT"), t(14, 770, "Invented Bank Credit Card GST Number: 00AAAAA0000A0ZZ — ICICI Bank"),
  t(79, 649, "STATEMENT DATE"), t(75, 619, "PAYMENT DUE DATE"), t(75, 600, "November 4, 2026"),
  t(14, 580, "Statement period : September 18, 2026 to October 17, 2026"),
  t(83, 568, "Total Amount due"), t(221, 568, "Previous Balance"), t(306, 568, "Purchases / Charges"), t(404, 568, "Cash Advances"), t(488, 568, "Payments / Credits"),
  t(87, 553, "`"), t(92, 553, "5,000.00"),
  t(231, 550, "`"), t(235, 550, "2,000.00"), t(318, 550, "`"), t(322, 550, "4,000.00"), t(418, 550, "`"), t(422, 550, "0.00"), t(496, 550, "`1,000.00"),
  t(89, 514, "Minimum Amount due"), t(92, 500, "`"), t(97, 500, "250.00"),
  t(208, 468, "Date"), t(252, 468, "SerNo."), t(305, 468, "Transaction Details"),
  ...row(208, 430, "21/09/2026", "11111111111", "UPI-111111111111-Sample Tea Sho p IN", "10", "535.00"),
  ...row(208, 417, "06/10/2026", "22222222222", "THANK YOU PAYMENT RECEIVED", "0", "1,000.00 CR"),
  ...row(208, 404, "08/10/2026", "33333333333", "UPI-222222222222-DEMO NEWS AND", "2", "100.00"),
  t(305, 397, "MAGS IN"),
];
const second = (): PdfItem[] => [
  t(35, 778, "Date"), t(123, 778, "SerNo."), t(181, 778, "Transaction Details"),
  ...row(35, 763, "14/10/2026", "44444444444", "SampleTravel", "1560", "3,365.00").map((i, k) => ({ ...i, x: [35, 113, 181, 398, 533][k] })),
];

describe("ICICI Bank credit card statement", () => {
  it("is recognised and read, row by row, with wrapped merchant text joined", () => {
    const pages = [page(1, first()), page(2, second())];
    expect(detectIciciCard(pages)).toBe(true);
    const r = parseStatementPdf(pages);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({ accountType: "credit_card", periodStart: "2026-09-18", periodEnd: "2026-10-17", dueDate: "2026-11-04", openingPaise: 200000, newDebitsPaise: 400000, newCreditsPaise: 100000, closingPaise: 500000, minimumDuePaise: 25000 });
    expect(r.rows.map((x) => [x.date, x.direction, x.amountPaise, x.description])).toEqual([
      ["2026-09-21", "debit", 53500, "UPI-111111111111-Sample Tea Sho p"],
      ["2026-10-06", "credit", 100000, "THANK YOU PAYMENT RECEIVED"],
      ["2026-10-08", "debit", 10000, "UPI-222222222222-DEMO NEWS AND MAGS"],
      ["2026-10-14", "debit", 336500, "SampleTravel"],
    ]);
    expect(r.rows.map((x) => x.index)).toEqual([1, 2, 3, 4]);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("flags a statement whose rows do not add up to its own totals", () => {
    const pages = [page(1, first().map((i) => (i.text === "535.00" ? { ...i, text: "536.00" } : i))), page(2, second())];
    const r = parseStatementPdf(pages);
    expect(r.ok && r.checks.some((c) => !c.ok)).toBe(true);
  });

  it("is not mistaken for another bank's statement", () => {
    expect(detectIciciCard([page(1, [t(10, 10, "Statement of Account"), t(10, 30, "American Express")])])).toBe(false);
  });
});
