import { describe, expect, it } from "vitest";
import type { Category, ExpenseRecord } from "@/domain/types";
import { categoriseFromNotes, maskNote, notesToRead, validateProposals } from "./ai";

const cats: Category[] = [{ id: "gifts", name: "Gifts" }, { id: "food", name: "Food" }, { id: "uncategorized", name: "Uncategorized" }];
const rec = (id: string, date: string, notes: string | undefined, categoryId = "uncategorized"): ExpenseRecord => ({
  id, date, merchant: `M${id}`, originalDescription: "SECRET BANK TEXT 9876543210", amountPaise: 123400, currency: "INR", accountId: "a", categoryId, kind: "purchase", payerId: "me", shared: false,
  split: { mode: "personal", participantIds: ["me"] }, excluded: false, status: "reviewed", importSource: "m", notes,
});

describe("notesToRead", () => {
  it("takes only transactions with a real note, newest first", () => {
    const r = notesToRead([rec("a", "2026-09-01", "gift for dad"), rec("b", "2026-09-03", "  "), rec("c", "2026-09-02", undefined), rec("d", "2026-09-05", "ok"), rec("e", "2026-09-04", "team lunch")]);
    expect(r.map((x) => x.id)).toEqual(["e", "a"]);
  });
});

describe("maskNote", () => {
  it("hides long numbers, emails and phones and flattens the text", () => {
    const m = maskNote("sent to a/c 50100123456789\nvia me@x.com call 9876543210 | gift");
    expect(m).not.toMatch(/50100123456789|me@x\.com|9876543210|\n|\|/);
    expect(m).toMatch(/gift/);
  });
});

describe("validateProposals", () => {
  const batch = [{ n: 1, record: rec("a", "2026-09-01", "gift") }, { n: 2, record: rec("b", "2026-09-02", "lunch", "food") }];
  it("keeps answers about real lines that use your own categories, once each", () => {
    const out = validateProposals({ items: [
      { n: 1, category: "gifts", sure: true, why: "gift for dad" }, { n: 1, category: "food", sure: true, why: "dup" },
      { n: 2, category: "made-up", sure: true, why: "x" }, { n: 9, category: "gifts", sure: true, why: "x" }, { n: 2, category: "", sure: false, why: "unclear" },
    ] }, batch, cats);
    expect(out).toEqual([{ id: "a", fromCategoryId: "uncategorized", toCategoryId: "gifts", confident: true, why: "gift for dad" }]);
  });
  it("returns nothing for garbage", () => { expect(validateProposals("x", batch, cats)).toEqual([]); });
});

describe("categoriseFromNotes", () => {
  const reply = (items: unknown[]) => new Response(JSON.stringify({ content: [{ type: "tool_use", input: { items } }], usage: { input_tokens: 200, output_tokens: 40 } }), { status: 200 });
  it("sends masked notes only (no bank text), with the key in a header, and returns proposals", async () => {
    let sent = { headers: {} as Record<string, string>, text: "" };
    const fetchImpl = (async (_u: string, init: RequestInit) => { sent = { headers: init.headers as Record<string, string>, text: String(init.body) }; return reply([{ n: 1, category: "gifts", sure: true, why: "gift" }]); }) as typeof fetch;
    const r = await categoriseFromNotes({ apiKey: "sk-test", fetchImpl }, [rec("a", "2026-09-01", "gift for dad, call 9876543210")], cats);
    expect(r.proposals).toHaveLength(1);
    expect(r.read).toBe(1);
    expect(sent.headers["x-api-key"]).toBe("sk-test");
    expect(sent.text).not.toMatch(/SECRET BANK TEXT|9876543210/);
    expect(sent.text).toMatch(/gift for dad/);
    expect(r.usage).toMatchObject({ calls: 1, asked: 1 });
  });
  it("retries once after a 400, reports Claude's reason, and never throws", async () => {
    let calls = 0;
    const picky = (async (_u: string, init: RequestInit) => { calls++; return "temperature" in JSON.parse(String(init.body)) ? new Response("{}", { status: 400 }) : reply([]); }) as typeof fetch;
    await categoriseFromNotes({ apiKey: "k", fetchImpl: picky }, [rec("a", "2026-09-01", "gift")], cats);
    expect(calls).toBe(2);
    const bad = (async () => new Response(JSON.stringify({ error: { message: "credit balance is too low" } }), { status: 400 })) as typeof fetch;
    expect((await categoriseFromNotes({ apiKey: "k", fetchImpl: bad }, [rec("a", "2026-09-01", "gift")], cats)).usage.error).toBe("Claude answered 400 (credit balance is too low)");
    const down = (async () => { throw new Error("x"); }) as typeof fetch;
    expect((await categoriseFromNotes({ apiKey: "k", fetchImpl: down }, [rec("a", "2026-09-01", "gift")], cats)).usage.error).toBe("Could not reach Claude");
  });
  it("does not call Claude when there are no notes", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return reply([]); }) as typeof fetch;
    expect((await categoriseFromNotes({ apiKey: "k", fetchImpl }, [rec("a", "2026-09-01", undefined)], cats)).read).toBe(0);
    expect(calls).toBe(0);
  });
});
