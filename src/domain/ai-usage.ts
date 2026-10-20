// What the app's AI use adds up to, per profile. Pure helpers: counting happens on the server (src/lib/ai-usage), this only
// describes the numbers, turns them into an estimated cost and checks the rates a person types in.

export type AiFeature = "import" | "paste" | "screenshot" | "categories" | "icons" | "notes" | "insights" | "bill" | "messages";

export const FEATURE_LABEL: Record<AiFeature, string> = {
  import: "Reading statements", paste: "Pasted text", screenshot: "Screenshots", categories: "Merchant names and categories", icons: "Icons and logos",
  notes: "Notes", insights: "Insights", bill: "Card bills", messages: "Emails and texts",
};

/**
 * Exactly what the Claude API reports for each answer. The dashboard's "Token volume" is the sum of all four, so the totals here
 * match it. Cache writes and reads are billed differently from plain input, so they are kept apart.
 */
export interface UsageBucket { calls: number; inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
export interface MonthUsage extends UsageBucket { month: string; by: Partial<Record<AiFeature, UsageBucket>> }

/** What the model costs: US dollars per million tokens, and rupees per dollar. Typed in by the person, because prices change. */
export interface Rates { inputUsdPerMTok: number; outputUsdPerMTok: number; inrPerUsd: number }

export const emptyBucket = (): UsageBucket => ({ calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 });
/** The same total as the dashboard's "Token volume": input, output, cache writes and cache reads. */
export const totalTokens = (b: UsageBucket) => b.inputTokens + b.outputTokens + b.cacheWriteTokens + b.cacheReadTokens;

/** Anthropic's published prompt-caching prices, as multiples of the plain input price: a cache write costs 1.25x, a cache read 0.1x. */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/** YYYY-MM in India time (the app's month), so a late-night call counts in the right month. */
export const monthOf = (now: number): string => new Date(now + 330 * 60_000).toISOString().slice(0, 7);

/** Estimated cost in rupees, or null when no rates are set. */
export function estimateInr(b: UsageBucket, rates: Rates | null): number | null {
  if (!rates) return null;
  const usd = ((b.inputTokens + b.cacheWriteTokens * CACHE_WRITE_MULTIPLIER + b.cacheReadTokens * CACHE_READ_MULTIPLIER) / 1_000_000) * rates.inputUsdPerMTok + (b.outputTokens / 1_000_000) * rates.outputUsdPerMTok;
  return Math.round(usd * rates.inrPerUsd * 100) / 100;
}

/** Accepts only sensible, finite, non-negative numbers; anything else is refused rather than guessed. */
export function parseRates(raw: unknown): Rates | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const inp = n(o.inputUsdPerMTok), out = n(o.outputUsdPerMTok), fx = n(o.inrPerUsd);
  const ok = (x: number, max: number) => Number.isFinite(x) && x >= 0 && x <= max;
  if (!ok(inp, 1000) || !ok(out, 1000) || !ok(fx, 1000) || fx === 0) return null;
  return { inputUsdPerMTok: inp, outputUsdPerMTok: out, inrPerUsd: fx };
}

/** One bucket per feature, biggest first, with the share of the month's tokens. */
export function featureRows(m: MonthUsage): { feature: AiFeature; label: string; bucket: UsageBucket; share: number }[] {
  const all = totalTokens(m) || 1;
  return (Object.entries(m.by) as [AiFeature, UsageBucket][])
    .filter(([f]) => f in FEATURE_LABEL)
    .map(([feature, bucket]) => ({ feature, label: FEATURE_LABEL[feature], bucket, share: totalTokens(bucket) / all }))
    .sort((a, b) => totalTokens(b.bucket) - totalTokens(a.bucket));
}
