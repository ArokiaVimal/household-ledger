import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import type { Repository } from "@/data/repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import { captureMessage, type CaptureDeps } from "./service";

let n = 0;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const deps = (over: Partial<CaptureDeps> = {}): CaptureDeps => ({ sha256: sha, now: () => Date.parse("2026-10-19T10:00:00Z"), newId: () => `id${++n}`, claude: null, today: "2026-10-19", ...over });
const who = { uid: "u1", participantId: "u_u1", defaultAccountId: "bank_hdfc" };

async function setup(): Promise<Repository> {
  const repo = createMemoryRepository("h");
  for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
  await repo.accounts.put({ id: "bank_hdfc", name: "HDFC Bank", type: "bank" });
  await repo.accounts.put({ id: "cc_icici", name: "ICICI Coral Credit Card", type: "credit_card" });
  await repo.accounts.put({ id: "gpay", name: "GPay", type: "upi" });
  return repo;
}
const UPI = "Rs 450.00 debited from HDFC Bank a/c XX1234 on 19-10-26 to VPA swiggy@icici (UPI Ref 628811223344). Not you? Call 1800";

describe("captureMessage", () => {
  it("adds a bank debit to the review queue, unreviewed, under the bank the message names", async () => {
    const repo = await setup();
    const r = await captureMessage(repo, who, UPI, deps());
    expect(r.result).toBe("added");
    const [rec] = await repo.records.list();
    expect(rec).toMatchObject({ status: "unreviewed", amountPaise: 45000, accountId: "bank_hdfc", referenceId: expect.stringContaining("628811223344") });
    expect(rec.originalDescription.toLowerCase()).toContain("swiggy");
  });
  it("senses a credit card from the message, and files under the default account when it names none", async () => {
    const repo = await setup();
    await captureMessage(repo, who, "INR 2,350.50 spent on ICICI Bank Card XX4321 on 18-Oct-26 at AMAZON PAY INDIA. Avl Limit INR 1,00,000.00", deps());
    await captureMessage(repo, who, "Rs 99.00 debited from a/c XX1234 to PAYTM", deps());
    const recs = (await repo.records.list()).sort((a, b) => a.amountPaise - b.amountPaise);
    expect(recs.map((r) => r.accountId)).toEqual(["bank_hdfc", "cc_icici"]);
  });
  it("marks a message that names no card as needing one, and leaves a named one alone", async () => {
    const repo = await setup();
    await captureMessage(repo, who, "INR 2,350.50 spent on ICICI Bank Card XX4321 on 18-Oct-26 at AMAZON PAY INDIA. Avl Limit INR 1,00,000.00", deps());
    await captureMessage(repo, who, "Rs 99.00 debited from a/c XX1234 to PAYTM", deps());
    const recs = (await repo.records.list()).sort((a, b) => b.amountPaise - a.amountPaise);
    expect(recs.map((r) => !!r.needsCard)).toEqual([false, true]);
  });
  it("the same message twice, or the same reference, is added once", async () => {
    const repo = await setup();
    expect((await captureMessage(repo, who, UPI, deps())).result).toBe("added");
    expect((await captureMessage(repo, who, UPI, deps())).result).toBe("duplicate");
    expect((await captureMessage(repo, who, UPI.replace("Not you? Call 1800", "Thanks"), deps())).result).toBe("duplicate");
    expect(await repo.records.list()).toHaveLength(1);
  });
  it("skips OTPs and offers, and says so", async () => {
    const repo = await setup();
    expect((await captureMessage(repo, who, "123456 is your OTP for Rs 450.00 payment. Do not share.", deps())).result).toBe("ignored");
    expect((await captureMessage(repo, who, "Get Rs 500 cashback when you spend Rs 5000. Apply now!", deps())).result).toBe("ignored");
    expect(await repo.records.list()).toEqual([]);
  });
  it("a card-due message creates the bill with the full amount and due date, once, and no transaction", async () => {
    const repo = await setup();
    const msg = "ICICI Bank Credit Card XX4321: Total Amt Due Rs 41,250.00, Min Amt Due Rs 2,060.00, Due Date 05-Nov-26.";
    const r = await captureMessage(repo, who, msg, deps());
    expect(r.result).toBe("bill");
    expect(await repo.cardBills.list()).toMatchObject([{ accountId: "cc_icici", totalDuePaise: 4125000, dueDate: "2026-11-05", source: "message" }]);
    expect(await repo.records.list()).toEqual([]);
    expect((await captureMessage(repo, who, msg, deps())).result).toBe("duplicate");
  });
  it("a dry run reports what would happen and saves nothing", async () => {
    const repo = await setup();
    const r = await captureMessage(repo, who, UPI, deps(), { dryRun: true });
    expect(r).toMatchObject({ result: "added", preview: { amountPaise: 45000, direction: "debit", account: "HDFC Bank" } });
    expect(await repo.records.list()).toEqual([]);
    expect(await repo.importBatches.list()).toEqual([]);
  });
  it("asks Claude only for money messages it cannot read, and only keeps what the message supports", async () => {
    const repo = await setup();
    const odd = "Txn alert: Rs 780 gone from your wallet at MYSTERY SHOP 17-10-2026";
    expect((await captureMessage(repo, who, odd, deps())).result).toBe("unreadable");
    const reply = (items: unknown[]) => (async () => new Response(JSON.stringify({ content: [{ type: "tool_use", input: { items } }], usage: {} }), { status: 200 })) as typeof fetch;
    const good = await captureMessage(repo, who, odd, deps({ claude: { apiKey: "k", fetchImpl: reply([{ date: "2026-10-17", description: "MYSTERY SHOP", amount: "780", direction: "dr" }]) } }));
    expect(good.result).toBe("added");
    const repo2 = await setup();
    const bad = await captureMessage(repo2, who, odd, deps({ claude: { apiKey: "k", fetchImpl: reply([{ date: "2026-10-17", description: "MYSTERY SHOP", amount: "9,999", direction: "dr" }]) } }));
    expect(bad.result).toBe("unreadable");
    expect(await repo2.records.list()).toEqual([]);
  });
  it("tells you to add a payment method when there is none", async () => {
    const repo = createMemoryRepository("h");
    for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
    expect((await captureMessage(repo, who, UPI, deps())).result).toBe("unreadable");
  });
});
