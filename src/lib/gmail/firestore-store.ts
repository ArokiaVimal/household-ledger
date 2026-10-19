import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { GmailLink, GmailStore } from "./store";

/** gmailLinks/{uid}. Closed to clients by the default rule; only server routes read it. */
export function createFirestoreGmailStore(): GmailStore {
  const col = () => getAdminDb().collection("gmailLinks");
  return {
    async get(uid) { const s = await col().doc(uid).get(); return s.exists ? (s.data() as GmailLink) : null; },
    async put(l) { await col().doc(l.uid).set(JSON.parse(JSON.stringify(l))); },
    async remove(uid) { await col().doc(uid).delete(); },
    async list(limit) { return (await col().limit(limit).get()).docs.map((d) => d.data() as GmailLink); },
  };
}
