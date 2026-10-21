import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Optional diagnostics: counts the Firestore documents one server request reads, so we can see what a page load or a save really costs
 * against the free quota. Off unless LOG_FIRESTORE_READS=1. Logs only collection names and counts, never document contents.
 * Pure (no Firebase imports) so it can be tested; the Firestore hook lives in `firestore-reads.ts`.
 */
interface Tally { name: string; total: number; by: Record<string, number> }
const store = new AsyncLocalStorage<Tally>();

export const readLoggingOn = (env: Record<string, string | undefined> = process.env) => env.LOG_FIRESTORE_READS === "1";

/** Records `n` document reads under `label`. Inside `measureReads` it adds to that request's tally; outside it logs one line. */
export function recordRead(label: string, n: number): void {
  if (!readLoggingOn() || n <= 0) return;
  const t = store.getStore();
  if (t) { t.total += n; t.by[label] = (t.by[label] ?? 0) + n; return; }
  console.log(JSON.stringify({ t: "fs-read", label, n }));
}

/** Names the request being measured (for example the save action), once it is known. */
export function nameReads(name: string): void {
  const t = store.getStore();
  if (t) t.name = name;
}

/** Runs `fn`, and when logging is on prints one summary line: the request name, total reads and the biggest collections. */
export async function measureReads<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!readLoggingOn()) return fn();
  const t: Tally = { name, total: 0, by: {} };
  try {
    return await store.run(t, fn);
  } finally {
    const top = Object.entries(t.by).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(JSON.stringify({ t: "fs-reads", name: t.name, total: t.total, top: Object.fromEntries(top) }));
  }
}
