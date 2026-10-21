// Counts what each Claude answer reports, by wrapping the fetch the AI code already uses. Exact numbers from the API are used, never
// estimates. Pure (the recorder is passed in) so it can be tested without a database.

export interface TokenCounts { input: number; output: number; cacheWrite: number; cacheRead: number }

/** The four counts the Claude API puts in every answer's `usage`, or null when there are none. */
export function tokenCountsOf(body: unknown): TokenCounts | null {
  const u = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const t = { input: n(u.input_tokens), output: n(u.output_tokens), cacheWrite: n(u.cache_creation_input_tokens), cacheRead: n(u.cache_read_input_tokens) };
  return t.input + t.output + t.cacheWrite + t.cacheRead > 0 ? t : null;
}

/**
 * A fetch that behaves exactly like `base` but reports the token counts of every successful Claude answer to `record`. Reading the
 * numbers happens on a copy of the response, and a failure to record never changes or delays-to-failure the answer.
 */
export function trackedFetch(base: typeof fetch | undefined, record: (t: TokenCounts) => Promise<void>): typeof fetch {
  const f = base ?? fetch;
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await f(input, init);
    if (res.ok) {
      try {
        const counts = tokenCountsOf(await res.clone().json());
        if (counts) await record(counts);
      } catch { /* the usage count is a convenience; the answer still goes through */ }
    }
    return res;
  }) as typeof fetch;
}
