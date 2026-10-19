import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CaptureStore, CaptureToken } from "./types";

/** captureTokens/{sha256(token)}. Only the hash is stored, so a database leak does not leak working links. Closed to clients by the default rule. */
export function createFirestoreCaptureStore(): CaptureStore {
  const col = () => getAdminDb().collection("captureTokens");
  return {
    async get(h) { const s = await col().doc(h).get(); return s.exists ? (s.data() as CaptureToken) : null; },
    async put(h, t) { await col().doc(h).set(JSON.parse(JSON.stringify(t))); },
    async listByUser(uid) { const q = await col().where("uid", "==", uid).get(); return q.docs.map((d) => ({ hash: d.id, token: d.data() as CaptureToken })); },
    async remove(h) { await col().doc(h).delete(); },
  };
}
