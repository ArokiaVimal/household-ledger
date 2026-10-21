import { describe, expect, it } from "vitest";
import { analyzeMonth, validateAnalysis } from "./ai";
import type { InsightFacts } from "./facts";

const facts: InsightFacts = { month: "2026-09", daysIntoMonth: 30, totals: { spent: 4400, myShare: 4400, refunds: 100, transactions: 3, waitingForReview: 0 }, earlier: [], categories: [], merchants: [], recurring: [], cardBills: [], notes: [], worthALook: [] };
const answer = { summary: "You spent ₹4,400.", highlights: [{ title: "Fuel", detail: "₹3,000 on fuel." }], tips: [{ title: "Plan fuel", detail: "Try one weekly fill.", saveRupees: 400 }], watch: ["HDFC bill due in 5 days"] };

describe("validateAnalysis", () => {
  it("keeps known fields, clips them and drops empty items", () => {
    const a = validateAnalysis({ ...answer, tips: [...answer.tips, { title: "", detail: "x" }, { title: "No save", detail: "d", saveRupees: -5 }], extra: "ignored" })!;
    expect(a.tips).toEqual([{ title: "Plan fuel", detail: "Try one weekly fill.", saveRupees: 400 }, { title: "No save", detail: "d" }]);
    expect(a).not.toHaveProperty("extra");
  });
  it("needs a summary", () => {
    expect(validateAnalysis({ highlights: [] })).toBeNull();
    expect(validateAnalysis("hello")).toBeNull();
  });
});

describe("analyzeMonth", () => {
  const ok = () => new Response(JSON.stringify({ content: [{ type: "tool_use", input: answer }], usage: { input_tokens: 700, output_tokens: 300 } }), { status: 200 });
  it("sends only the figures, with the key in a header, and returns the analysis", async () => {
    let sent = { headers: {} as Record<string, string>, body: {} as { messages: { content: string }[]; system: { text: string }[] } };
    const fetchImpl = (async (_u: string, init: RequestInit) => { sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }; return ok(); }) as typeof fetch;
    const r = await analyzeMonth({ apiKey: "sk-test", fetchImpl }, facts);
    expect(r.analysis!.summary).toBe("You spent ₹4,400.");
    expect(sent.headers["x-api-key"]).toBe("sk-test");
    expect(JSON.parse(sent.body.messages[0].content)).toMatchObject({ month: "2026-09" });
    expect(sent.body.system[0].text).toMatch(/never the minimum due/);
    expect(r.usage).toMatchObject({ calls: 1, inputTokens: 700, outputTokens: 300 });
  });
  it("never sends temperature and reports Claude's reason if it still fails", async () => {
    let calls = 0;
    const plain = (async (_u: string, init: RequestInit) => { calls++; return "temperature" in JSON.parse(String(init.body)) ? new Response("{}", { status: 400 }) : ok(); }) as typeof fetch;
    expect((await analyzeMonth({ apiKey: "k", fetchImpl: plain }, facts)).analysis).not.toBeNull();
    expect(calls).toBe(1);
    const bad = (async () => new Response(JSON.stringify({ error: { message: "credit balance is too low" } }), { status: 400 })) as typeof fetch;
    expect((await analyzeMonth({ apiKey: "k", fetchImpl: bad }, facts)).usage.error).toBe("Claude answered 400 (credit balance is too low)");
  });
  it("never throws on a network failure", async () => {
    const r = await analyzeMonth({ apiKey: "k", fetchImpl: (async () => { throw new Error("x"); }) as typeof fetch }, facts);
    expect(r.analysis).toBeNull();
    expect(r.usage.error).toBe("Could not reach Claude.");
  });
});
