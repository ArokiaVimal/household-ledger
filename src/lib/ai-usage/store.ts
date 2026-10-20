import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { emptyBucket, monthOf, parseRates, type AiFeature, type MonthUsage, type Rates, type UsageBucket } from "@/domain/ai-usage";
import { getAdminDb } from "@/lib/firebase/admin";
import type { TokenCounts } from "./track";

// Per profile: users/{uid}/aiUsage/{YYYY-MM}. Written only by server code that has verified the session; the browser cannot touch it.
const usageDoc = (uid: string, month: string) => getAdminDb().collection("users").doc(uid).collection("aiUsage").doc(month);
const userDoc = (uid: string) => getAdminDb().collection("users").doc(uid);

const increments = (t: TokenCounts) => ({ calls: FieldValue.increment(1), inputTokens: FieldValue.increment(t.input), outputTokens: FieldValue.increment(t.output), cacheWriteTokens: FieldValue.increment(t.cacheWrite), cacheReadTokens: FieldValue.increment(t.cacheRead) });

/** Adds one answer's tokens to this month's total and to the feature that asked for it. */
export async function recordAiUsage(uid: string, feature: AiFeature, t: TokenCounts): Promise<void> {
  const month = monthOf(Date.now());
  await usageDoc(uid, month).set({ month, ...increments(t), by: { [feature]: increments(t) }, updatedAt: new Date().toISOString() }, { merge: true });
}

const bucketOf = (d: Record<string, unknown> | undefined): UsageBucket => {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return d ? { calls: n(d.calls), inputTokens: n(d.inputTokens), outputTokens: n(d.outputTokens), cacheWriteTokens: n(d.cacheWriteTokens), cacheReadTokens: n(d.cacheReadTokens) } : emptyBucket();
};

/** The latest months, newest first. */
export async function readAiUsage(uid: string, limit = 6): Promise<MonthUsage[]> {
  const snap = await getAdminDb().collection("users").doc(uid).collection("aiUsage").orderBy("month", "desc").limit(limit).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const by: MonthUsage["by"] = {};
    for (const [k, v] of Object.entries((d.by ?? {}) as Record<string, Record<string, unknown>>)) by[k as AiFeature] = bucketOf(v);
    return { month: typeof d.month === "string" ? d.month : doc.id, ...bucketOf(d), by };
  });
}

export async function readRates(uid: string): Promise<Rates | null> {
  const snap = await userDoc(uid).get();
  return parseRates(snap.exists ? snap.data()?.aiRates : null);
}

/** `null` clears the rates. */
export async function writeRates(uid: string, rates: Rates | null): Promise<void> {
  await userDoc(uid).set({ aiRates: rates ?? FieldValue.delete(), updatedAt: new Date().toISOString() }, { merge: true });
}
