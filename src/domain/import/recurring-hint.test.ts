import { describe, expect, it } from "vitest";
import { looksRecurring, repeatsMonthly } from "./recurring-hint";

describe("looksRecurring", () => {
  it("recognises EMIs, rent, premiums, SIPs and auto-debits", () => {
    for (const d of ["ACH D- HDFC BANK LTD-EMI 4471", "NACH DR LIC OF INDIA PREMIUM", "NEFT-RENT SEP-SIS SAFA", "UPI-ZERODHA SIP", "SI HDFC LIFE", "Netflix subscription"]) expect(looksRecurring(d, "purchase", "debit")).toBe(true);
  });
  it("never flags card-bill payments, income, refunds or credits", () => {
    expect(looksRecurring("CREDIT CARD PAYMENT HDFC EMI", "cc_payment", "debit")).toBe(false);
    expect(looksRecurring("SALARY RENT REFUND", "refund", "credit")).toBe(false);
    expect(looksRecurring("EMI REVERSAL", "purchase", "credit")).toBe(false);
  });
  it("ignores ordinary purchases", () => {
    expect(looksRecurring("SWIGGY ORDER 12345", "purchase", "debit")).toBe(false);
  });
});

describe("repeatsMonthly", () => {
  const h = (date: string, amountPaise = 1_850_000, originalDescription = "ACH D- HDFC BANK LTD-LOAN 9988") => ({ originalDescription, amountPaise, date, kind: "purchase" as const });
  it("needs the same merchant and about the same amount in two earlier months", () => {
    expect(repeatsMonthly("ACH D- HDFC BANK LTD-LOAN 9988", 1_850_000, "2026-09-05", [h("2026-07-05"), h("2026-08-05")])).toBe(true);
    expect(repeatsMonthly("ACH D- HDFC BANK LTD-LOAN 9988", 1_850_000, "2026-09-05", [h("2026-08-05")])).toBe(false);
    expect(repeatsMonthly("ACH D- HDFC BANK LTD-LOAN 9988", 1_850_000, "2026-09-05", [h("2026-07-05", 500_000), h("2026-08-05", 500_000)])).toBe(false);
  });
  it("does not count the same month twice or other merchants", () => {
    expect(repeatsMonthly("ACH D- HDFC BANK LTD-LOAN 9988", 1_850_000, "2026-09-05", [h("2026-08-05"), h("2026-08-20")])).toBe(false);
    expect(repeatsMonthly("ACH D- HDFC BANK LTD-LOAN 9988", 1_850_000, "2026-09-05", [h("2026-07-05", 1_850_000, "SWIGGY"), h("2026-08-05", 1_850_000, "SWIGGY")])).toBe(false);
  });
});
