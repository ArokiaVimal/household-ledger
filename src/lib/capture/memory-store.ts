import type { CaptureStore, CaptureToken } from "./types";

export function createMemoryCaptureStore(): CaptureStore {
  const m = new Map<string, CaptureToken>();
  return {
    async get(h) { return m.get(h) ? structuredClone(m.get(h)!) : null; },
    async put(h, t) { m.set(h, structuredClone(t)); },
    async listByUser(uid) { return [...m].filter(([, t]) => t.uid === uid).map(([hash, token]) => ({ hash, token: structuredClone(token) })); },
    async remove(h) { m.delete(h); },
  };
}
