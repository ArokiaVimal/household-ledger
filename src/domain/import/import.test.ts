import { describe, expect, it } from "vitest";
import { classifyRow, extractMerchant } from "./classify";
import { parseAmount } from "./amount";
import { detectLayout } from "./columns";
import { parseCsv } from "./csv";
import { detectDateOrder, parseStatementDate } from "./date";
import { extractRows } from "./rows";

describe("parseAmount", () => {
  it("reads Indian formats exactly, with no floating point", () => {
    expect(parseAmount("1,23,456.78")).toEqual({ paise: 12345678, negative: false, marker: null });
    expect(parseAmount("₹ 1,000")).toMatchObject({ paise: 100000 });
    expect(parseAmount("Rs. 500.5")).toMatchObject({ paise: 50050 });
    expect(parseAmount("INR 12.30")).toMatchObject({ paise: 1230 });
    expect(parseAmount("0.10")).toMatchObject({ paise: 10 });
    expect(parseAmount("19.99")).toMatchObject({ paise: 1999 }); // 19.99 * 100 is 1998.999… in floats
    expect(parseAmount(250)).toMatchObject({ paise: 25000 });
  });
  it("understands signs, brackets and Dr/Cr markers", () => {
    expect(parseAmount("-250")).toMatchObject({ paise: 25000, negative: true });
    expect(parseAmount("(1,000.00)")).toMatchObject({ paise: 100000, negative: true });
    expect(parseAmount("1000.00 Dr")).toMatchObject({ paise: 100000, marker: "dr" });
    expect(parseAmount("45 CR")).toMatchObject({ paise: 4500, marker: "cr" });
  });
  it("refuses blanks, junk and more than two decimals", () => {
    for (const bad of ["", "  ", "abc", "12.345", "1.2.3", "--5", null, undefined]) expect(parseAmount(bad as never)).toBeNull();
  });
});

describe("US-style dates", () => {
  const table = [["Date", "Description", "Amount"], ["10/17/2026", "SHOP A", "100.00"], ["10/02/2026", "SHOP B", "50.00"], ["10/11/2026", "SHOP C", "20.00"]];
  it("reads a month-first file as month-first, so 10/02 is 2 October", () => {
    const r = extractRows(table);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => x.date)).toEqual(["2026-10-17", "2026-10-02", "2026-10-11"]);
  });
  it("keeps day-first when a day above 12 shows it, and when all dates are ambiguous", () => {
    const r = extractRows([["Date", "Description", "Amount"], ["17/10/2026", "A", "1.00"], ["02/10/2026", "B", "2.00"]]);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => x.date)).toEqual(["2026-10-17", "2026-10-02"]);
    expect(detectDateOrder(["03/09/2026", "04/09/2026"])).toBe("dmy");
  });
});

describe("parseStatementDate", () => {
  it("is day-first for numeric dates and handles two-digit years", () => {
    expect(parseStatementDate("03/09/2026")).toBe("2026-09-03");
    expect(parseStatementDate("03-09-26")).toBe("2026-09-03");
    expect(parseStatementDate("13/01/2026")).toBe("2026-01-13");
    expect(parseStatementDate("2026-09-03")).toBe("2026-09-03");
  });
  it("reads month names, times and Excel serial numbers", () => {
    expect(parseStatementDate("3 Sep 2026")).toBe("2026-09-03");
    expect(parseStatementDate("03-Sep-26")).toBe("2026-09-03");
    expect(parseStatementDate("3 September, 2026")).toBe("2026-09-03");
    expect(parseStatementDate("03/09/2026 14:32")).toBe("2026-09-03");
    expect(parseStatementDate(46268)).toBe("2026-09-03");
  });
  it("rejects impossible and non-dates", () => {
    for (const bad of ["31/02/2026", "29/02/2025", "00/01/2026", "13/13/2026", "hello", "", "12345678"]) expect(parseStatementDate(bad)).toBeNull();
    expect(parseStatementDate("29/02/2028")).toBe("2028-02-29");
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const t = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n');
    expect(t).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "line1\nline2"]]);
  });
  it("detects semicolon and tab delimiters and skips blank rows", () => {
    expect(parseCsv("a;b\n1;2\n\n3;4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

const bank = `Account Statement
Customer ID : XXXXX
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,UPI-SWIGGY-swiggy@icici-123456789012-Order,0000123456789012,01/09/26,612.00,,45388.00
01/09/26,NEFT CR-ACME LTD-SALARY SEP,N123,01/09/26,,"1,85,000.00","2,30,388.00"
05/09/26,ECS AUTO LOAN EMI 4471,0000000000004471,05/09/26,"18,500.00",,"2,11,888.00"
Total,,,,"19,112.00","1,85,000.00",
`;

describe("detectLayout and extractRows on a bank statement", () => {
  const table = parseCsv(bank);
  it("skips the preamble and maps columns", () => {
    const l = detectLayout(table)!;
    expect(l.headerIndex).toBe(2);
    expect(l.columns).toMatchObject({ date: 0, description: 1, reference: 2, postedDate: 3, debit: 4, credit: 5, balance: 6 });
  });
  it("extracts exact paise, directions, references, balances and totals; the footer is not a transaction", () => {
    const r = extractRows(table);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(3);
    expect(r.data.rows[0]).toMatchObject({ date: "2026-09-01", amountPaise: 61200, direction: "debit", referenceId: "0000123456789012", balancePaise: 4538800, line: 4 });
    expect(r.data.rows[1]).toMatchObject({ amountPaise: 18500000, direction: "credit" });
    expect(r.data.totals).toEqual({ debitPaise: 61200 + 1850000, creditPaise: 18500000, debitCount: 2, creditCount: 1 });
    expect(r.data.skipped).toEqual([]);
  });
});

describe("single amount column conventions", () => {
  const card = "Date,Transaction Details,Amount (in Rs.)\n02/09/2026,SWIGGY BANGALORE IN,612.00\n13/09/2026,AMAZON REFUND,-1299.00\n20/09/2026,PAYMENT RECEIVED - THANK YOU,48210.00 Cr\n";
  it("card style: positive is money out, negative is money in, Cr marker wins", () => {
    const r = extractRows(parseCsv(card), { positiveIsDebit: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => [x.direction, x.amountPaise])).toEqual([["debit", 61200], ["credit", 129900], ["credit", 4821000]]);
  });
  it("bank style default is the opposite, so the user can flip it", () => {
    const r = extractRows(parseCsv(card.replace(" Cr", "")));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => x.direction)).toEqual(["credit", "debit", "credit"]);
  });
  it("a Dr/Cr column is honoured", () => {
    const r = extractRows(parseCsv("Date,Description,Amount,Dr/Cr\n01/09/2026,Shop,100.00,DR\n02/09/2026,Salary,500.00,CR"));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => x.direction)).toEqual(["debit", "credit"]);
  });
});

describe("rows that cannot be read are reported, never silently dropped", () => {
  it("reports bad dates, empty amounts and double-filled rows", () => {
    const t = parseCsv("Date,Narration,Debit,Credit\n01/09/2026,Good row,10.00,\nnot a date,Bad date row,5.00,\n02/09/2026,No amount,,\n03/09/2026,Both,1.00,2.00\n04/09/2026,Another good,3.00,");
    const r = extractRows(t);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.rows.map((x) => x.description)).toEqual(["Good row", "Another good"]);
    expect(r.data.skipped.map((x) => x.reason).sort()).toEqual(["Both debit and credit filled", "No readable amount", "No valid date"]);
  });
  it("gives a clear error when there is no transaction table", () => {
    const r = extractRows(parseCsv("hello,world\n1,2"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/transaction table/);
  });
});

describe("merchant extraction and classification", () => {
  it("pulls the merchant out of UPI and POS narrations", () => {
    expect(extractMerchant("UPI-SWIGGY-swiggy@icici-123456789012-Order")).toBe("Swiggy");
    expect(extractMerchant("UPI/412345678901/DR/ZEPTO MARKETPLACE/YESB/zepto@yesb")).toBe("Zepto Marketplace");
    expect(extractMerchant("POS 4821 STARBUCKS COFFEE BLR")).toBe("Starbucks Coffee Blr");
    expect(extractMerchant("Netflix Subscription")).toBe("Netflix Subscription");
  });
  it("never counts card bill payments, cash or fees as ordinary purchases", () => {
    expect(classifyRow("CREDIT CARD PAYMENT HDFC 4471", "debit", "bank").kind).toBe("cc_payment");
    expect(classifyRow("BILLPAY CRED CLUB", "debit", "bank").kind).toBe("cc_payment");
    expect(classifyRow("ATM CASH WDL KORAMANGALA", "debit", "bank").kind).toBe("transfer");
    expect(classifyRow("SMS CHARGES Q3", "debit", "bank").kind).toBe("fee");
    expect(classifyRow("UPI-ZEPTO-zepto@yesb", "debit", "bank").kind).toBe("purchase");
  });
  it("bank credits: salary is income, reversals are refunds", () => {
    expect(classifyRow("NEFT CR-ACME LTD-SALARY SEP", "credit", "bank").kind).toBe("income");
    expect(classifyRow("UPI REVERSAL SWIGGY", "credit", "bank").kind).toBe("refund");
  });
  it("card statements: purchases, fees, refunds and payments received", () => {
    expect(classifyRow("SWIGGY BANGALORE IN", "debit", "credit_card").kind).toBe("purchase");
    expect(classifyRow("ANNUAL FEE + GST", "debit", "credit_card").kind).toBe("fee");
    expect(classifyRow("AMAZON REFUND", "credit", "credit_card").kind).toBe("refund");
    expect(classifyRow("PAYMENT RECEIVED - THANK YOU", "credit", "credit_card").kind).toBe("cc_payment");
  });
});
