import { describe, expect, it } from "vitest";
import { parseStatementPdf } from ".";
import { detectHdfcCard } from "./hdfc-card";
import { page, t } from "./test-fixtures";
import type { PdfItem } from "./types";

// An invented statement in the printed layout (positions imitate the real one). No real data.
const dated = (y: number, date: string, desc: string, amount: string, o: { x?: number; credit?: boolean; descY?: number; more?: string; moreY?: number } = {}): PdfItem[] => {
  const x = o.x ?? 251;
  return [
    t(170, y, `${date}| 12:00`), ...(o.descY === undefined ? [t(x, y, desc)] : [t(x, o.descY, desc)]), ...(o.more ? [t(x, o.moreY ?? y - 5, o.more)] : []),
    ...(o.credit ? [t(522, y, "+")] : []), t(528, y, "C"), t(533, y, amount), t(568, y, "l"),
  ];
};
const first = (): PdfItem[] => [
  t(27, 778, "Test Credit Card Statement"), t(102, 767, "HDFC Bank Credit Cards GSTIN: 00AAAAA0000A0Z0"), t(192, 715, "Statement Date"), t(341, 715, "19 Oct, 2026"), t(192, 701, "Billing Period"), t(299, 701, "20 Sep, 2026 - 19 Oct, 2026"),
  t(40, 615, "PREVIOUS STATEMENT DUES"), t(156, 620, "PAYMENTS/CREDITS"), t(446, 615, "TOTAL AMOUNT DUE"),
  t(67, 592, "1,000.00"), t(171, 592, "300.00"), t(271, 592, "700.50"), t(376, 592, "0.00"), t(453, 592, "1,400.00"),
  t(446, 564, "MINIMUM DUE"), t(512, 564, "DUE DATE"), t(450, 544, "100.00"), t(512, 544, "13 Nov, 2026"),
  t(170, 148, "DATE & TIME"), t(251, 148, "TRANSACTION DESCRIPTION"), t(468, 148, "REWARDS"), t(530, 148, "AMOUNT"),
  t(251, 133, "A B CARDHOLDER [CKYC ID : 00000000000000 ]"),
  ...dated(118, "19/09/2026", "CGST-TEST-RATE 9.0 (Ref#", "10.00", { descY: 122, more: "9999 11)" }),
  ...dated(56, "21/09/2026", "PAYMENT THANKYOU (Ref# 1)", "300.00", { credit: true }),
];
const second = (): PdfItem[] => [
  t(26, 570, "DATE & TIME"), t(136, 570, "TRANSACTION DESCRIPTION"), t(442, 570, "REWARDS"), t(525, 570, "AMOUNT"),
  ...dated(556, "22/09/2026", "SAMPLE SHOP CHENNAI", "290.50", { x: 136 }).map((i) => (i.x === 170 ? { ...i, x: 26 } : i)),
  ...dated(542, "24/09/2026", "TEST CAFE", "400.00", { x: 136 }).map((i) => (i.x === 170 ? { ...i, x: 26 } : i)),
  t(26, 283, "Rewards Program Points Summary"),
];

describe("HDFC Bank credit card statement", () => {
  const pages = [page(1, first()), page(2, second())];
  it("is recognised and read with a + meaning money in, and wrapped description lines joined", () => {
    expect(detectHdfcCard(pages)).toBe(true);
    const r = parseStatementPdf(pages);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({ accountType: "credit_card", periodStart: "2026-09-20", periodEnd: "2026-10-19", dueDate: "2026-11-13", openingPaise: 100000, newDebitsPaise: 70050, newCreditsPaise: 30000, closingPaise: 140000, minimumDuePaise: 10000 });
    expect(r.rows.map((x) => [x.date, x.direction, x.amountPaise, x.description])).toEqual([
      ["2026-09-19", "debit", 1000, "CGST-TEST-RATE 9.0 (Ref# 9999 11)"],
      ["2026-09-21", "credit", 30000, "PAYMENT THANKYOU (Ref# 1)"],
      ["2026-09-22", "debit", 29050, "SAMPLE SHOP CHENNAI"],
      ["2026-09-24", "debit", 40000, "TEST CAFE"],
    ]);
  });
  it("flags a statement whose rows do not add up to its own totals", () => {
    const bad = [page(1, first().map((i) => (i.text === "10.00" ? { ...i, text: "11.00" } : i))), page(2, second())];
    const r = parseStatementPdf(bad);
    expect(r.ok && r.checks.some((c) => !c.ok)).toBe(true);
  });
  it("is not mistaken for another bank's card", () => {
    expect(detectHdfcCard([page(1, [t(10, 10, "Statement of Account"), t(10, 30, "American Express")])])).toBe(false);
  });
});
