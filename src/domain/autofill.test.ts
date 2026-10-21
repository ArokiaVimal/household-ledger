import { describe, expect, it } from "vitest";
import { amountIn, dateIn, readNote, usualFor } from "./autofill";
import type { Account, ExpenseRecord, Participant } from "./types";

const TODAY = "2026-10-19"; // a Monday
const accounts: Account[] = [{ id: "cc_hdfc", name: "HDFC BizGrow Card", type: "credit_card" }, { id: "cc_amex", name: "Amex Platinum Travel", type: "credit_card" }, { id: "bank_hdfc", name: "HDFC Bank", type: "bank" }, { id: "gpay_hdfc", name: "GPay HDFC UPI", type: "upi", parentId: "bank_hdfc" }, { id: "cash", name: "Cash", type: "cash" }];
const people: Participant[] = [{ id: "me", name: "Vimal", userId: "u1" }, { id: "wife", name: "Varalakshmi", nickname: "Varu", userId: null }, { id: "k", name: "Karthik", userId: null }];
const ctx = { today: TODAY, accounts, participants: people, meId: "me" };

describe("reading a note", () => {
  it("finds an amount only when it clearly is money", () => {
    expect(amountIn("paid 450 at Swiggy")).toBe(45000);
    expect(amountIn("Dinner ₹1,250.50 with friends")).toBe(125050);
    expect(amountIn("rs 99 recharge")).toBe(9900);
    expect(amountIn("4 people on 12 oct")).toBeUndefined();
    expect(amountIn("bought 3 items")).toBeUndefined();
    expect(amountIn("nothing here")).toBeUndefined();
  });
  it("finds a date, never in the future", () => {
    expect(dateIn("coffee yesterday", TODAY)).toBe("2026-10-18");
    expect(dateIn("dinner day before yesterday", TODAY)).toBe("2026-10-17");
    expect(dateIn("lunch last friday", TODAY)).toBe("2026-10-16");
    expect(dateIn("lunch on monday", TODAY)).toBe("2026-10-12"); // the Monday before today
    expect(dateIn("paid on 12 oct", TODAY)).toBe("2026-10-12");
    expect(dateIn("Oct 5 groceries", TODAY)).toBe("2026-10-05");
    expect(dateIn("trip on 25 dec", TODAY)).toBe("2025-12-25");
    expect(dateIn("31 feb", TODAY)).toBeUndefined();
    expect(dateIn("hello", TODAY)).toBeUndefined();
  });
  it("finds the payment method, the people and the kind", () => {
    expect(readNote("Swiggy dinner 450 on gpay yesterday", ctx)).toMatchObject({ amountPaise: 45000, accountId: "gpay_hdfc", date: "2026-10-18" });
    expect(readNote("paid with amex", ctx).accountId).toBe("cc_amex");
    expect(readNote("hdfc card movie", ctx).accountId).toBe("cc_hdfc");
    expect(readNote("cash for auto", ctx).accountId).toBe("cash");
    expect(readNote("dinner with Varu and Karthik", ctx).withIds).toEqual(["wife", "k"]);
    expect(readNote("gift for Karthik", ctx).withIds).toBeUndefined(); // a name alone is not a split
    expect(readNote("Varu paid for the cab", ctx)).toMatchObject({ payerId: "wife", withIds: ["wife"] });
    expect(readNote("refund from amazon", ctx).kind).toBe("refund");
    expect(readNote("salary credited", ctx).kind).toBe("income");
    expect(readNote("netflix every month", ctx).monthly).toBe(true);
  });
  it("returns nothing for a short or empty note", () => {
    expect(readNote("", ctx)).toEqual({});
    expect(readNote("ok", ctx)).toEqual({});
  });
});

describe("what you usually do with a merchant", () => {
  const rec = (id: string, date: string, accountId: string, split: ExpenseRecord["split"]): ExpenseRecord => ({ id, date, merchant: "Zepto", accountId, kind: "purchase", status: "reviewed", split } as ExpenseRecord);
  const together = { mode: "equal" as const, participantIds: ["me", "wife"] };
  it("takes the most used payment method and a split repeated twice", () => {
    const u = usualFor("zepto", [rec("1", "2026-10-01", "cc_hdfc", together), rec("2", "2026-10-05", "cc_hdfc", together), rec("3", "2026-09-01", "cc_amex", { mode: "personal", participantIds: ["me"] })]);
    expect(u.accountId).toBe("cc_hdfc");
    expect(u.split).toEqual(together);
  });
  it("does not guess a split from one shared purchase or from custom amounts", () => {
    expect(usualFor("Zepto", [rec("1", "2026-10-01", "cc_hdfc", together), rec("2", "2026-10-05", "cc_hdfc", { mode: "personal", participantIds: ["me"] })]).split).toBeUndefined();
    expect(usualFor("Zepto", [rec("1", "2026-10-01", "cc_hdfc", { mode: "custom", participantIds: ["me", "wife"], values: { me: 1, wife: 1 } }), rec("2", "2026-10-05", "cc_hdfc", { mode: "custom", participantIds: ["me", "wife"], values: { me: 1, wife: 1 } })]).split).toBeUndefined();
    expect(usualFor("Unknown", [])).toEqual({});
  });
  it("reads a card-bill payment: the card it pays and the bank it comes from", () => {
    const f = readNote("paid amex bill 48210 from hdfc bank yesterday", ctx);
    expect(f).toMatchObject({ kind: "cc_payment", paidCardId: "cc_amex", amountPaise: 4821000 });
    expect(f.accountId).toBe("bank_hdfc");
    expect(readNote("electricity bill 1200", ctx).kind).toBeUndefined();
  });
});
