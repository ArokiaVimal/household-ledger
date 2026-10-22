import { describe, expect, it, vi } from "vitest";
import { maskTranscript, understandExpense } from "./ai";

const ctx = { today: "2026-10-22", categoryNames: ["Restaurants & cafes", "Groceries"] };
const transcript = "I had breakfast with Varru and Meera at A2B for 365 rupees, split this by 3, I used Amex";
const input = { merchant: "A2B", amount: 365, date: null, category: "Restaurants & cafes", note: "Breakfast", people: ["Varru", "Meera"], paidBy: null, splitCount: 3, paymentMethod: "Amex" };
const ok = (i: unknown) => new Response(JSON.stringify({ content: [{ type: "tool_use", input: i }], usage: { input_tokens: 300, output_tokens: 60 } }), { status: 200 });

describe("maskTranscript", () => {
  it("hides phone and account numbers but keeps normal amounts", () => {
    expect(maskTranscript("paid 12500 to 9876543210 account 50100123456789")).toBe("paid 12500 to # account #");
  });
  it("trims and caps the length", () => { expect(maskTranscript(`  ${"a ".repeat(500)} `).length).toBeLessThanOrEqual(600); });
});

describe("understandExpense", () => {
  it("sends only the words, the date and the category names, and returns validated facts", async () => {
    const fetchImpl = vi.fn(async () => ok(input));
    const r = await understandExpense({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }, transcript, ctx);
    expect(r.usage.error).toBeUndefined();
    expect(r.facts).toMatchObject({ merchant: "A2B", amount: 365, category: "Restaurants & cafes", people: ["Varru", "Meera"], splitCount: 3, paymentMethod: "Amex" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_expense" });
    expect(JSON.stringify(body)).toContain("Today is 2026-10-22 (Thursday)");
    expect(body.messages[0].content).toBe(`Transcript: ${transcript}`);
    expect(r.usage).toMatchObject({ calls: 1, inputTokens: 300, outputTokens: 60 });
  });
  it("retries once without a forced tool when the model refuses forcing", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "tool_choice not supported" } }), { status: 400 })).mockResolvedValueOnce(ok(input));
    const r = await understandExpense({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }, transcript, ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).tool_choice).toEqual({ type: "auto" });
    expect(r.facts.merchant).toBe("A2B");
  });
  it("drops an amount Claude invented that was never said", async () => {
    const r = await understandExpense({ apiKey: "k", fetchImpl: (async () => ok({ ...input, amount: 999 })) as unknown as typeof fetch }, transcript, ctx);
    expect(r.facts.amount).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/amount/i);
  });
  it("reports a failure without throwing", async () => {
    const r = await understandExpense({ apiKey: "k", fetchImpl: (async () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529 })) as unknown as typeof fetch }, transcript, ctx);
    expect(r.usage.error).toMatch(/529/);
    expect(r.facts.merchant).toBeNull();
    const net = await understandExpense({ apiKey: "k", fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch }, transcript, ctx);
    expect(net.usage.error).toMatch(/reach Claude/);
  });
  it("says so when Claude answers without the tool", async () => {
    const r = await understandExpense({ apiKey: "k", fetchImpl: (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }], usage: {} }), { status: 200 })) as unknown as typeof fetch }, transcript, ctx);
    expect(r.usage.error).toMatch(/did not understand/);
  });
});
