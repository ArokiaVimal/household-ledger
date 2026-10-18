// Invented statement layouts shared by the PDF tests. Positions imitate the printed Amex India layout (PDF points, y grows upward).
// No real statement data is ever used here.
import type { PdfItem, PdfPage } from "./types";

export const t = (x: number, y: number, text: string): PdfItem => ({ x, y, text });

export function header(period = "From September 9 to October 9, 2026", sums = ["10,000.00", "1,500.00", "3,000.00", "11,500.00", "575.00"]): PdfItem[] {
  return [
    t(71, 794, "American Express® Platinum Travel Credit Card"), t(71, 779, "Statement of Account"),
    t(48, 705, "Opening Balance Rs"), t(167, 705, "New Credits Rs"), t(276, 705, "New Debits Rs"), t(370, 705, "Closing Balance Rs"), t(469, 705, "Minimum Payment Rs"),
    t(55, 687, sums[0]), t(112, 687, "-"), t(163, 687, sums[1]), t(217, 687, "+"), t(273, 687, sums[2]), t(324, 687, "="), t(379, 687, sums[3]), t(485, 687, sums[4]),
    t(14, 573, "Statement Period"), t(158, 573, period),
    t(14, 494, "Details"), t(344, 494, "Foreign Currency"), t(490, 494, "Amount Rs"),
  ];
}
export const row = (y: number, date: string, desc: string, amount: string, opts: { cr?: boolean; foreign?: string; extra?: string } = {}): PdfItem[] => [
  t(14, y, date), t(86, y, desc), ...(opts.extra ? [t(211, y, opts.extra)] : []), ...(opts.foreign ? [t(344, y, opts.foreign)] : []), t(530 - amount.length * 4.5, y, amount), ...(opts.cr ? [t(512, y - 10, "CR")] : []),
];
export const page = (n: number, items: PdfItem[]): PdfPage => ({ number: n, items });

export const standard = (): PdfPage[] => [
  page(1, [
    ...header(),
    ...row(478, "September 10", "TEST MART BANGALORE", "1,000.00"),
    ...row(460, "September 12", "SAMPLE CAFE", "500.00"),
    ...row(442, "September 14", "REFUND SAMPLE SHOP", "1,500.00", { cr: true }),
    ...row(424, "September 20", "DEMO TRAVEL", "1,500.00"),
  ]),
];

