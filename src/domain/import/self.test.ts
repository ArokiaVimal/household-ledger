import { describe, expect, it } from "vitest";
import { classifyRow } from "./classify";
import { isSelfTransfer, selfIdentityOf } from "./self";

// An invented person: Asha Rao, asharao@example.com.
const me = selfIdentityOf([{ name: "Rao Asha K", email: "asharao@example.com" }, { name: "Asha", email: null }]);

describe("payments to your own accounts", () => {
  it("are recognised by your name, in each bank's wording and even when the bank cuts the name short", () => {
    expect(isSelfTransfer("UPI/ASHA RAO/asharao@okhdfcbank/UPI/HDFC BANK/658623/ICI9f", me)).toBe(true);
    expect(isSelfTransfer("UPI-ASHA RAO K-9444000000@INHDFC-FDRL0007001-621774295583-TOWARDS US STOCKS", me)).toBe(true);
    expect(isSelfTransfer("UPI/RAO ASHA/someone@ybl/note/YES BANK/1", me)).toBe(true);
  });
  it("are recognised by your UPI id when the name is not printed in full", () => {
    expect(isSelfTransfer("UPI/A R/asharao@okicici/UPI/ICICI Bank/1", me)).toBe(true);
  });
  it("never match another person, one shared word, or a shop", () => {
    expect(isSelfTransfer("UPI/ASHA KUMAR/asha.kumar@ybl/UPI/YES BANK/1", me)).toBe(false);
    expect(isSelfTransfer("UPI/ASHA/asha@ybl/x/YES BANK/1", me)).toBe(false);
    expect(isSelfTransfer("UPI/ZEPTO/zepto@kotakpa/NO REMARK/KOTAK/1", me)).toBe(false);
    expect(isSelfTransfer("NACH trxn ACH/KOTAK MAHINDRA BANK/7801784", me)).toBe(false);
  });
  it("need to know who you are", () => {
    expect(isSelfTransfer("UPI/ASHA RAO/asharao@okhdfcbank/UPI/HDFC BANK/1")).toBe(false);
  });
  it("are filed as transfers, in either direction, and never as spending or income", () => {
    expect(classifyRow("UPI/ASHA RAO/asharao@okhdfcbank/UPI/HDFC BANK/1", "debit", "bank", me)).toMatchObject({ kind: "transfer", merchant: "Own account transfer" });
    expect(classifyRow("UPI/ASHA RAO/asharao@okhdfcbank/UPI/HDFC BANK/1", "credit", "bank", me).kind).toBe("transfer");
    expect(classifyRow("UPI/ASHA RAO/asharao@okhdfcbank/UPI/HDFC BANK/1", "debit", "bank").kind).toBe("purchase"); // unknown identity: no guess
  });
});

describe("card bills paid from a bank", () => {
  const bank = (d: string) => classifyRow(d, "debit", "bank").kind;
  it("are recognised in each bank's wording, including UPI to a card issuer", () => {
    expect(bank("BIL/INFT/FJA2686353/CC BillPay-6002/Self")).toBe("cc_payment");
    expect(bank("IB BILLPAY DR-HDFCEL-457704XXXXXX8224")).toBe("cc_payment");
    expect(bank("FUND TRF CC-457704XXXXXX8224")).toBe("cc_payment");
    expect(bank("UPI-INDMONEY CREDIT CARD-***********BDPG@HDFCBANK-HDFC0MERUPI-629051564266")).toBe("cc_payment");
    expect(bank("UPI/American E/XX3007@sc/Paid via I/Standard C/629051505147")).toBe("cc_payment");
  });
  it("leave ordinary payments alone", () => {
    expect(bank("UPI/SASI KADAI/paytm.s1x5109@/parotta vl/YES BANK P/621395732857")).toBe("purchase");
    expect(bank("ACH D- BOB LOAN COLLECTION-9000000000000")).toBe("purchase");
  });
});
