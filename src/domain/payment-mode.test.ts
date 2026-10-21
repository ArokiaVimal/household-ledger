import { describe, expect, it } from "vitest";
import { isUpiPayment, sourceOf } from "./payment-mode";
import type { Account } from "./types";

const accounts: Account[] = [
  { id: "bank", name: "ICICI Bank", type: "bank" }, { id: "upi_gpay", name: "GPay ICICI UPI", type: "upi", parentId: "bank" },
  { id: "card", name: "ICICI Coral", type: "credit_card" }, { id: "cash", name: "Cash", type: "cash" },
];
const r = (originalDescription: string, accountId = "bank") => ({ originalDescription, accountId });

describe("UPI or not", () => {
  it("reads each bank's wording", () => {
    expect(isUpiPayment(r("UPI/SASI KADAI/paytm.s1x5109@/parotta vl/YES BANK P/621395732857/YCD"), accounts)).toBe(true);
    expect(isUpiPayment(r("UPI-CRED-CRED.CLUB@AXISB-UTIB0000114-658291587320-PAYMENT ON"), accounts)).toBe(true);
    expect(isUpiPayment(r("UPI-663096426370-Shri Bal aajee Bhavan", "card"), accounts)).toBe(true);
    expect(isUpiPayment(r("NACH trxn ACH/KOTAK MAHINDRA BANK/7801784"), accounts)).toBe(false);
    expect(isUpiPayment(r("BIL/INFT/FJA2686353/CC BillPay-6002/Self"), accounts)).toBe(false);
    expect(isUpiPayment(r("FlipkartTravel", "card"), accounts)).toBe(false);
  });
  it("does not mistake a word that merely contains the letters", () => {
    expect(isUpiPayment(r("SUPIN STORES PUPIL"), accounts)).toBe(false);
  });
  it("counts a payment filed under a UPI app", () => {
    expect(isUpiPayment(r("Coffee", "upi_gpay"), accounts)).toBe(true);
  });
  it("tells a bank from a card, with UPI apps counting as the bank behind them", () => {
    expect(sourceOf(r("x", "bank"), accounts)).toBe("bank");
    expect(sourceOf(r("x", "upi_gpay"), accounts)).toBe("bank");
    expect(sourceOf(r("x", "card"), accounts)).toBe("card");
    expect(sourceOf(r("x", "cash"), accounts)).toBe("other");
  });
});
