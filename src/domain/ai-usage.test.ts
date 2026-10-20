import { describe, expect, it } from "vitest";
import { estimateInr, featureRows, monthOf, parseRates, totalTokens, type MonthUsage } from "./ai-usage";

describe("AI usage numbers", () => {
  it("counts the month in India time", () => {
    expect(monthOf(Date.parse("2026-10-31T19:00:00Z"))).toBe("2026-11"); // 00:30 on 1 Nov in India
    expect(monthOf(Date.parse("2026-10-31T17:00:00Z"))).toBe("2026-10");
  });
  it("estimates the cost in rupees from the rates, and says nothing without rates", () => {
    const b = { calls: 3, inputTokens: 2_000_000, outputTokens: 500_000 };
    expect(estimateInr(b, { inputUsdPerMTok: 1, outputUsdPerMTok: 5, inrPerUsd: 80 })).toBe(360); // ($2 + $2.5) × 80
    expect(estimateInr(b, null)).toBeNull();
    expect(totalTokens(b)).toBe(2_500_000);
  });
  it("accepts sensible rates and refuses nonsense", () => {
    expect(parseRates({ inputUsdPerMTok: "1", outputUsdPerMTok: 5, inrPerUsd: "83.5" })).toEqual({ inputUsdPerMTok: 1, outputUsdPerMTok: 5, inrPerUsd: 83.5 });
    expect(parseRates({ inputUsdPerMTok: -1, outputUsdPerMTok: 5, inrPerUsd: 83 })).toBeNull();
    expect(parseRates({ inputUsdPerMTok: 1, outputUsdPerMTok: "abc", inrPerUsd: 83 })).toBeNull();
    expect(parseRates({ inputUsdPerMTok: 1, outputUsdPerMTok: 5, inrPerUsd: 0 })).toBeNull();
    expect(parseRates({ inputUsdPerMTok: 1e9, outputUsdPerMTok: 5, inrPerUsd: 83 })).toBeNull();
    expect(parseRates(null)).toBeNull();
  });
  it("lists features biggest first with their share, ignoring unknown ones", () => {
    const m = { month: "2026-10", calls: 3, inputTokens: 800, outputTokens: 200, by: { icons: { calls: 1, inputTokens: 100, outputTokens: 0 }, import: { calls: 2, inputTokens: 700, outputTokens: 200 }, mystery: { calls: 9, inputTokens: 9, outputTokens: 9 } } } as unknown as MonthUsage;
    const rows = featureRows(m);
    expect(rows.map((r) => r.feature)).toEqual(["import", "icons"]);
    expect(rows[0].share).toBeCloseTo(0.9);
  });
});
