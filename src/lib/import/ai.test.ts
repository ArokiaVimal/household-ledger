import { describe, expect, it } from "vitest";
import type { Category, MerchantMemory } from "@/domain/types";
import { BATCH_SIZE, createClaudeSuggest, redact, suggesterFromEnv, validateAnswer, type AiItem } from "./ai";

const cats: Category[] = [{ id: "food", name: "Food" }, { id: "fees", name: "Fees" }];
const item = (n: number, direction: "debit" | "credit" = "debit"): AiItem => ({ key: `m${n}`, description: `STORE ${n} 9876543210`, amountPaise: 12345, direction });
const reply = (items: unknown[], usage = { input_tokens: 500, output_tokens: 60 }) => new Response(JSON.stringify({ content: [{ type: "tool_use", input: { items } }], usage }), { status: 200 });

describe("redact", () => {
  it("hides long digit runs and trims", () => {
    expect(redact("UPI 9876543210 to  Raj")).toBe("UPI ##### to Raj");
    expect(redact("x".repeat(200)).length).toBe(90);
  });
});

describe("validateAnswer", () => {
  const batch = [item(1), item(2, "credit")];
  it("keeps good answers and drops invented categories, kinds and impossible directions", () => {
    const out = validateAnswer({ items: [
      { n: 1, name: "Store One", category: "food", type: "purchase", sure: true },
      { n: 2, name: "Store Two", category: "food", type: "purchase", sure: true }, // credit cannot be a purchase
      { n: 1, name: "Dupe", category: "food", type: "purchase", sure: true },
      { n: 3, name: "Nobody", category: "food", type: "purchase", sure: true },
      { n: 1, name: "X", category: "made-up", type: "purchase", sure: true },
    ] }, batch, cats);
    expect(out).toEqual([{ key: "m1", name: "Store One", categoryId: "food", kind: "purchase", confident: true }]);
  });
  it("returns nothing for garbage", () => {
    expect(validateAnswer("hello", batch, cats)).toEqual([]);
    expect(validateAnswer({ items: "no" }, batch, cats)).toEqual([]);
  });
});

describe("createClaudeSuggest", () => {
  const known: MerchantMemory[] = [{ id: "a", key: "swiggy", name: "Swiggy", categoryId: "food", kind: "purchase", source: "user", confident: true, confirmed: 5, lastSeen: "2026-09-01" }];

  it("sends one compact request, redacted, with the key in a header only", async () => {
    let sent: { headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return reply([{ n: 1, name: "Store One", category: "food", type: "purchase", sure: true }]);
    }) as unknown as typeof fetch;
    const suggest = createClaudeSuggest({ apiKey: "sk-test", fetchImpl });
    const { suggestions, usage } = await suggest([item(1)], { categories: cats, known });
    expect(suggestions).toHaveLength(1);
    expect(usage).toMatchObject({ asked: 1, calls: 1, inputTokens: 500, outputTokens: 60 });
    expect(sent!.headers["x-api-key"]).toBe("sk-test");
    const body = sent!.body as { model: string; messages: { content: string }[]; system: { text: string; cache_control: unknown }[]; temperature: number; max_tokens: number };
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content).toBe("1|STORE 1 #####|123|dr");
    expect(JSON.stringify(body)).not.toContain("sk-test");
    expect(body.system[0].text).toContain("food=Food");
    expect(body.system[0].text).toContain("Swiggy=food");
    expect(body.system[0].cache_control).toBeTruthy();
    expect(body.max_tokens).toBeLessThan(400);
  });

  it("splits large lists into batches and stops after three", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return reply([]); }) as unknown as typeof fetch;
    const { usage } = await createClaudeSuggest({ apiKey: "k", fetchImpl })(Array.from({ length: BATCH_SIZE * 5 }, (_, i) => item(i + 1)), { categories: cats, known: [] });
    expect(calls).toBe(3);
    expect(usage.asked).toBe(BATCH_SIZE * 3);
  });

  it("reports a failure and keeps going without throwing", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 529 })) as unknown as typeof fetch;
    const out = await createClaudeSuggest({ apiKey: "k", fetchImpl })([item(1)], { categories: cats, known: [] });
    expect(out.suggestions).toEqual([]);
    expect(out.usage.error).toContain("529");
    const boom = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect((await createClaudeSuggest({ apiKey: "k", fetchImpl: boom })([item(1)], { categories: cats, known: [] })).usage.error).toBe("Could not reach Claude");
  });
});

describe("suggesterFromEnv", () => {
  it("is off without a key", () => {
    expect(suggesterFromEnv({})).toBeNull();
    expect(suggesterFromEnv({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(suggesterFromEnv({ ANTHROPIC_API_KEY: "sk-x" })).toBeTypeOf("function");
  });
});
