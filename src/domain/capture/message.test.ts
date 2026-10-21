import { describe, expect, it } from "vitest";
import { looksFinancial, parseMessage } from "./message";

const TODAY = "2026-10-19";
const tx = (t: string) => { const r = parseMessage(t, TODAY); if (r.kind !== "transaction") throw new Error(`not a transaction: ${JSON.stringify(r)}`); return r; };

describe("transactions", () => {
  it("UPI debit from a bank", () => {
    const r = tx("Rs 450.00 debited from a/c XX1234 on 19-10-26 to VPA swiggy@icici (UPI Ref 628811223344). Not you? Call 1800 000 000");
    expect(r).toMatchObject({ amountPaise: 45000, direction: "debit", date: "2026-10-19", referenceId: "628811223344" });
    expect(r.description.toLowerCase()).toContain("swiggy");
  });
  it("card spend", () => {
    const r = tx("INR 2,350.50 spent on ICICI Bank Card XX4321 on 18-Oct-26 at AMAZON PAY INDIA. Avl Limit INR 1,00,000.00");
    expect(r).toMatchObject({ amountPaise: 235050, direction: "debit", date: "2026-10-18" });
    expect(r.description).toMatch(/AMAZON/i);
  });
  it("sent via a bank app", () => {
    const r = tx("Sent Rs.1,200.00 From HDFC Bank A/c *1234 To ZEPTO On 17/10/26 Ref 628800112233 Not You? Call 18002586161");
    expect(r).toMatchObject({ amountPaise: 120000, direction: "debit", date: "2026-10-17", referenceId: "628800112233" });
    expect(r.description).toMatch(/ZEPTO/i);
  });
  it("credits: salary, refund, UPI received", () => {
    expect(tx("Rs 85,000.00 credited to a/c XX1234 on 01-10-26 by NEFT-ACME LTD-SALARY. Avl Bal Rs 90,210.00")).toMatchObject({ amountPaise: 8500000, direction: "credit" });
    expect(tx("Refund of Rs 499.00 credited to your card XX4321 on 16-Oct-26 for FLIPKART")).toMatchObject({ direction: "credit", amountPaise: 49900 });
    expect(tx("You have received Rs 600.00 from VARRU via UPI on 15-10-2026. UPI Ref 628811009988")).toMatchObject({ direction: "credit", amountPaise: 60000 });
  });
  it("uses today's date when none is printed", () => {
    expect(tx("Rs 99.00 debited from a/c XX1234 to PAYTM").date).toBe(TODAY);
  });
  it("takes the transaction amount, not the balance", () => {
    expect(tx("Rs 100.00 debited from a/c XX1234 to CHAI POINT. Avl Bal Rs 5,000.00").amountPaise).toBe(10000);
  });
});

describe("card bills", () => {
  it("reads the total amount due and the due date, ignoring the minimum", () => {
    const r = parseMessage("HDFC Bank Credit Card XX4321: Total Amt Due Rs 41,250.00, Min Amt Due Rs 2,060.00, Due Date 05-Nov-26. Pay now to avoid late fee.", TODAY);
    expect(r).toEqual({ kind: "bill", totalDuePaise: 4125000, dueDate: "2026-11-05" });
  });
  it("reads 'statement ... amount due ... pay by'", () => {
    const r = parseMessage("Your SBI Card statement dated 15/10/26 is generated. Total amount due Rs 9,300.00. Pay by 05/11/26.", TODAY);
    expect(r).toMatchObject({ kind: "bill", totalDuePaise: 930000, dueDate: "2026-11-05", statementDate: "2026-10-15" });
  });
});

describe("what to leave alone", () => {
  it("OTPs, offers and balance-only messages", () => {
    expect(parseMessage("123456 is your OTP for transaction of Rs 450.00 at AMAZON. Do not share it.", TODAY)).toMatchObject({ kind: "ignore" });
    expect(parseMessage("Get Rs 500 cashback when you spend Rs 5000 this week. Apply now!", TODAY)).toMatchObject({ kind: "ignore" });
    expect(parseMessage("Your a/c XX1234 balance is Rs 5,000.00 as on 19-10-26", TODAY)).toMatchObject({ kind: "ignore" });
    expect(parseMessage("Happy Diwali from your bank!", TODAY)).toMatchObject({ kind: "ignore" });
    expect(parseMessage("", TODAY)).toMatchObject({ kind: "ignore" });
  });
  it("ignores a bank's balance update notice, even though it mentions credits, debits and an amount", () => {
    const t = "Your balance update. Balance Update Dear CUSTOMER, This communication is being sent to inform you about the balance on your Card account (including credit balance), along with recent credits and debits. Total balance Rs 47,513.81 debit";
    expect(parseMessage(t, TODAY)).toEqual({ kind: "ignore", reason: "balance notice" });
    expect(parseMessage("Rs 450.00 debited from your card. Avl balance Rs 5,000", TODAY)).toMatchObject({ kind: "transaction" });
  });
  it("looksFinancial is a cheap pre-check for asking Claude about unreadable ones", () => {
    expect(looksFinancial("Txn of Rs 450 at X was debited")).toBe(true);
    expect(looksFinancial("123456 is your OTP, Rs 450 debit")).toBe(false);
    expect(looksFinancial("See you at 5")).toBe(false);
    expect(looksFinancial("Autopay of Rs 649 for NETFLIX successful on your card")).toBe(true);
    expect(looksFinancial("Your a/c XX1234 balance is Rs 5,000.00")).toBe(false);
  });
});
