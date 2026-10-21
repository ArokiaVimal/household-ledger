import { describe, expect, it } from "vitest";
import { detectDuplicate } from "../dedupe";
import { resolveChannel } from "./channel";
import { issuerKeys, senseAccount, statementType, type AccountLite } from "./sense";

const accounts: AccountLite[] = [
  { id: "bank_hdfc", name: "HDFC Bank", type: "bank" }, { id: "bank_icici", name: "ICICI Bank", type: "bank" },
  { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" }, { id: "cc_hdfc", name: "HDFC Credit Card", type: "credit_card" },
  { id: "cc_icici", name: "ICICI Coral Credit Card", type: "credit_card" }, { id: "upi_gpay", name: "GPay", type: "upi" }, { id: "upi_phonepe", name: "PhonePe", type: "upi" },
  { id: "upi_cred", name: "CRED", type: "upi" },
];

// Invented statement text that imitates how real ones read.
const amex = `American Express® Platinum Travel Credit Card\nStatement of Account\nOpening Balance Rs 10,000.00  New Credits Rs  New Debits Rs\nCredit Limit Rs 300,000.00\nMinimum Payment Due\nPayment Due Date 05/10/2026\n${"filler line\n".repeat(40)}Pay by NEFT: Beneficiary account at HDFC Bank, IFSC HDFC0001234`;
const hdfcBank = `HDFC BANK LTD\nAccount Statement\nAccount No : 50100000000000   IFSC: HDFC0001234  Branch: Koramangala\nDate Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance`;
const hdfcCard = `HDFC Bank Credit Cards\nCredit Card Statement\nCard No: 4111 11XX XXXX 4471\nPayment Due Date 05/10/2026\nMinimum Amount Due 2,410.00\nCredit Limit 300000`;

describe("issuer and statement type wording", () => {
  it("finds issuers by whole words only", () => {
    expect(issuerKeys("Payment from CRED Club via HDFC")).toEqual(expect.arrayContaining(["cred", "hdfc"]));
    expect(issuerKeys("credit card credited")).toEqual([]); // 'cred' inside 'credit' is not CRED
    expect(issuerKeys("AMERICAN EXPRESS")).toEqual(["amex"]);
  });
  it("tells card statements from bank statements", () => {
    expect(statementType(amex)).toBe("credit_card");
    expect(statementType(hdfcBank)).toBe("bank");
    expect(statementType(hdfcCard)).toBe("credit_card");
    expect(statementType("Hello world")).toBeNull();
  });
});

describe("senseAccount", () => {
  it("picks the Amex card even though its payment instructions mention HDFC", () => {
    const r = senseAccount(amex, accounts);
    expect(r).toMatchObject({ accountId: "cc_amex", confidence: "sure" });
    expect(r.reason).toMatch(/american express/i);
  });
  it("separates HDFC Bank from the HDFC credit card by what kind of statement it is", () => {
    expect(senseAccount(hdfcBank, accounts)).toMatchObject({ accountId: "bank_hdfc", confidence: "sure" });
    expect(senseAccount(hdfcCard, accounts)).toMatchObject({ accountId: "cc_hdfc", confidence: "sure" });
  });
  it("does not guess when nothing matches or the type contradicts the only candidate", () => {
    expect(senseAccount("Some Unknown Co statement 01/09/2026 100.00", accounts)).toMatchObject({ accountId: null, confidence: "none" });
    const onlyBank = senseAccount(hdfcCard, [{ id: "bank_hdfc", name: "HDFC Bank", type: "bank" }]);
    expect(onlyBank.accountId).toBeNull();
  });
  it("recognises a UPI app only when the statement names it", () => {
    expect(senseAccount("Google Pay\nTransaction history\nPaid to X", accounts).accountId).toBe("upi_gpay");
    expect(senseAccount(hdfcBank, accounts).candidates.some((c) => c.id === "upi_gpay")).toBe(false);
  });
});

const bank = accounts[0];
describe("resolveChannel", () => {
  it("files a UPI payment under the app the narration names, funded by the bank", () => {
    expect(resolveChannel("UPI/412345678901/Payment from PhonePe/SWIGGY", "purchase", bank, accounts)).toEqual({ accountId: "upi_phonepe", fundedBy: "bank_hdfc" });
    expect(resolveChannel("UPI-ZEPTO-GPAY-zepto@yesb", "purchase", bank, accounts)).toMatchObject({ accountId: "upi_gpay", fundedBy: "bank_hdfc" });
  });
  it("leaves the row on the bank when the app is not one of your methods or is not named", () => {
    expect(resolveChannel("UPI-ZEPTO-zepto@yesb-4123", "purchase", bank, accounts)).toEqual({ accountId: "bank_hdfc" });
    expect(resolveChannel("Payment from Slice", "purchase", bank, accounts.filter((a) => a.id !== "upi_phonepe"))).toEqual({ accountId: "bank_hdfc" });
  });
  it("names the card a bill payment went to, and never turns it into a UPI payment", () => {
    const r = resolveChannel("BILLPAY AMEX CARD 3782", "cc_payment", bank, accounts);
    expect(r).toMatchObject({ accountId: "bank_hdfc", merchant: "Payment to Amex Platinum Travel" });
    expect(r.paidCard?.id).toBe("cc_amex");
    expect(resolveChannel("CRED CLUB BILL PAYMENT", "cc_payment", bank, accounts)).toEqual({ accountId: "bank_hdfc" }); // which card is unknown: stay honest
  });
  it("does not name a card when two of your cards share the issuer's name", () => {
    const two = [...accounts, { id: "cc_hdfc2", name: "HDFC Regalia Credit Card", type: "credit_card" as const }];
    expect(resolveChannel("HDFC CREDIT CARD PAYMENT", "cc_payment", bank, two).paidCard).toBeUndefined();
  });
  it("a UPI app's own record gets the funding bank when it names one", () => {
    const gpay = accounts.find((a) => a.id === "upi_gpay")!;
    expect(resolveChannel("Paid to Swiggy from HDFC Bank 1234", "purchase", gpay, accounts)).toEqual({ accountId: "upi_gpay", fundedBy: "bank_hdfc" });
  });
});

describe("one payment seen in the app and in the bank is a possible duplicate, never an exact one", () => {
  const existing = [{ id: "g1", accountId: "upi_gpay", fundedBy: "bank_hdfc", date: "2026-09-01", amountPaise: 61200, merchant: "Swiggy", referenceId: "R1", kind: "purchase" as const }];
  it("flags it across the pair", () => {
    expect(detectDuplicate({ accountId: "bank_hdfc", date: "2026-09-01", amountPaise: 61200, merchant: "Swiggy Instamart", direction: "debit" }, existing)).toEqual({ status: "possible", matchId: "g1" });
    expect(detectDuplicate({ accountId: "upi_gpay", fundedBy: "bank_hdfc", date: "2026-09-01", amountPaise: 61200, merchant: "Swiggy" }, [{ ...existing[0], accountId: "bank_hdfc", fundedBy: undefined }]).status).toBe("possible");
  });
  it("does not treat the same reference in another account as exact, or unrelated accounts as the same trail", () => {
    expect(detectDuplicate({ accountId: "bank_hdfc", date: "2026-09-01", amountPaise: 61200, merchant: "x", referenceId: "R1" }, existing).status).not.toBe("exact");
    expect(detectDuplicate({ accountId: "bank_icici", date: "2026-09-01", amountPaise: 61200, merchant: "Swiggy" }, existing).status).toBe("none");
    expect(detectDuplicate({ accountId: "bank_hdfc", date: "2026-09-01", amountPaise: 99900, merchant: "Swiggy" }, existing).status).toBe("none");
  });
  it("a credit-card statement stays a credit-card statement despite cheque and IFSC small print", () => {
    const text = "American Express Platinum Travel Credit Card Statement of Account Opening Balance Minimum Payment Due Credit Limit Card Number XXXX\n" + "x ".repeat(3000) + "Make a crossed cheque payable. IFSC code. Account number. Branch.";
    expect(statementType(text)).toBe("credit_card");
  });
  it("never picks a UPI app for a statement the reader knows is a bank account, however often the app is named", () => {
    const accounts = [{ id: "bank_icici", name: "ICICI Bank", type: "bank" as const }, { id: "upi_paytm_icici", name: "Paytm ICICI UPI", type: "upi" as const }, { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" as const }];
    const text = "Statement of Transactions in Saving Account ICICI BANK LIMITED " + "UPI/Merchant/paytm-123@paytm/Payment from Paytm ".repeat(8);
    expect(senseAccount(text, accounts, "bank").accountId).toBe("bank_icici");
    expect(senseAccount(text, accounts, "credit_card").accountId).not.toBe("upi_paytm_icici");
  });
});
