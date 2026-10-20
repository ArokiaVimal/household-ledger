import "server-only";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";

/** A browser's push address for one signed-in person on one device. Server-only collection (the Firestore rules keep it closed). */
export interface PushSub {
  id: string; uid: string; householdId: string; endpoint: string; keys: { p256dh: string; auth: string };
  createdAt: string;
  /** The date (YYYY-MM-DD) a reminder was last sent, so there is at most one a day. */
  lastSent?: string;
}

export const subId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
const col = () => getAdminDb().collection("pushSubscriptions");

export async function putSub(s: Omit<PushSub, "id" | "createdAt">): Promise<void> {
  const id = subId(s.endpoint);
  const cur = await col().doc(id).get();
  await col().doc(id).set({ ...s, id, createdAt: (cur.data() as PushSub | undefined)?.createdAt ?? new Date().toISOString(), ...(cur.exists ? { lastSent: (cur.data() as PushSub).lastSent ?? null } : {}) });
}
export async function removeSub(endpoint: string, uid: string): Promise<void> {
  const ref = col().doc(subId(endpoint));
  const snap = await ref.get();
  if (snap.exists && (snap.data() as PushSub).uid === uid) await ref.delete();
}
export async function removeById(id: string): Promise<void> { await col().doc(id).delete(); }
export async function listSubs(limit = 500): Promise<PushSub[]> { return (await col().limit(limit).get()).docs.map((d) => d.data() as PushSub); }
export async function subsFor(uid: string): Promise<PushSub[]> { return (await col().where("uid", "==", uid).limit(10).get()).docs.map((d) => d.data() as PushSub); }
export async function markSent(id: string, day: string): Promise<void> { await col().doc(id).update({ lastSent: day }); }
