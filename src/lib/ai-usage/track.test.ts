import { describe, expect, it } from "vitest";
import { tokenCountsOf, trackedFetch, type TokenCounts } from "./track";

const answer = (usage: unknown, status = 200) => new Response(JSON.stringify({ content: [], usage }), { status });

describe("tokenCountsOf", () => {
  it("reads all four counts exactly as the API reports them", () => {
    expect(tokenCountsOf({ usage: { input_tokens: 120, output_tokens: 30, cache_creation_input_tokens: 400, cache_read_input_tokens: 1000 } })).toEqual({ input: 120, output: 30, cacheWrite: 400, cacheRead: 1000 });
  });
  it("treats missing or odd numbers as zero, and no usage at all as nothing to record", () => {
    expect(tokenCountsOf({ usage: { input_tokens: 5, output_tokens: "x" } })).toEqual({ input: 5, output: 0, cacheWrite: 0, cacheRead: 0 });
    expect(tokenCountsOf({ usage: {} })).toBeNull();
    expect(tokenCountsOf({})).toBeNull();
    expect(tokenCountsOf(null)).toBeNull();
  });
});

describe("trackedFetch", () => {
  it("records a successful answer and hands the same answer back, still readable", async () => {
    const seen: TokenCounts[] = [];
    const f = trackedFetch((async () => answer({ input_tokens: 10, output_tokens: 4 })) as unknown as typeof fetch, async (t) => { seen.push(t); });
    const res = await f("https://api.anthropic.com/v1/messages", { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { usage: { input_tokens: number } }).usage.input_tokens).toBe(10);
    expect(seen).toEqual([{ input: 10, output: 4, cacheWrite: 0, cacheRead: 0 }]);
  });
  it("records nothing for a failed call, and never breaks the answer when recording fails", async () => {
    const seen: TokenCounts[] = [];
    const failed = trackedFetch((async () => answer({ input_tokens: 10 }, 400)) as unknown as typeof fetch, async (t) => { seen.push(t); });
    expect((await failed("x")).status).toBe(400);
    expect(seen).toEqual([]);
    const broken = trackedFetch((async () => answer({ input_tokens: 10, output_tokens: 1 })) as unknown as typeof fetch, async () => { throw new Error("db down"); });
    expect((await broken("x")).status).toBe(200);
  });
});
