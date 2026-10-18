import { describe, expect, it } from "vitest";
import type { Account } from "@/domain/types";
import { intakeFile, intakeText, type IntakeOpts } from "./intake";

const accounts: Account[] = [{ id: "bank_hdfc", name: "HDFC Bank", type: "bank" }, { id: "cc_amex", name: "Amex Platinum", type: "credit_card" }, { id: "gpay", name: "GPay", type: "upi" }];
const opts = (over: Partial<IntakeOpts> = {}): IntakeOpts => ({ accounts, ai: false, claude: null, today: "2026-10-19", base: { filename: "x.csv", fileHash: "a".repeat(64) }, ...over });
const bytes = (s: string) => new TextEncoder().encode(s);
const CSV = "HDFC Bank Account Statement\nDate,Narration,Withdrawal Amt.,Deposit Amt.\n02/10/2026,UPI-SWIGGY-123,450.00,\n03/10/2026,NEFT SALARY,,85000.00\n";

describe("intakeFile", () => {
  it("senses the payment method from the statement when none is chosen", async () => {
    const r = await intakeFile(bytes(CSV), "x.csv", opts());
    expect(r.kind).toBe("ready");
    if (r.kind === "ready") expect(r.input).toMatchObject({ accountId: "bank_hdfc", detected: { chosen: false } });
  });
  it("uses the chosen payment method over the sensed one", async () => {
    const r = await intakeFile(bytes(CSV), "x.csv", opts({ accountId: "gpay" }));
    if (r.kind === "ready") expect(r.input).toMatchObject({ accountId: "gpay", detected: { chosen: true } });
  });
  it("asks when the statement does not say which account it is", async () => {
    const r = await intakeFile(bytes("Date,Narration,Withdrawal Amt.,Deposit Amt.\n02/10/2026,SHOP,450.00,\n"), "x.csv", opts());
    expect(r.kind).toBe("need_account");
  });
});

describe("intakeText", () => {
  const table = "Date,Description,Amount\n02/10/2026,Swiggy,450\n";
  it("reads a pasted table without AI", async () => {
    const r = await intakeText(table, "table", opts({ accountId: "bank_hdfc" }));
    expect(r.kind).toBe("ready");
  });
  it("refuses free text without consent or a key, and never calls Claude", async () => {
    await expect(intakeText("paid 450 at Swiggy", "ai", opts({ accountId: "bank_hdfc", ai: false, claude: null }))).rejects.toThrow(/needs Claude/);
  });
  it("reads free text with Claude and asks for the account when it is not named", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ content: [{ type: "tool_use", input: { items: [{ date: "2026-10-18", description: "Swiggy", amount: "450", direction: "dr" }] } }], usage: {} }), { status: 200 })) as typeof fetch;
    const r = await intakeText("paid 450 at Swiggy yesterday", "ai", opts({ ai: true, claude: { apiKey: "k", fetchImpl } }));
    expect(r.kind).toBe("need_account");
  });
});
