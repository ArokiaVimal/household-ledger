import "server-only";
import webpush from "web-push";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { cardViews, type CardView } from "@/domain/cardbills";
import type { Reminder } from "@/domain/reminders";
import type { PushSub } from "./store";

export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

/** The push keys from the server's settings, or null when push is not set up (the rest of the app works without it). */
export function vapidFromEnv(env: Record<string, string | undefined>): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim(), privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com" };
}

/** Sends one notification. Classifies the outcome so dead subscriptions are cleaned up. */
export function makeSender(cfg: VapidConfig) {
  return async (sub: PushSub, r: Pick<Reminder, "title" | "body" | "url" | "tag">): Promise<"ok" | "gone" | "failed"> => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.tag }), {
        vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey }, TTL: 60 * 60 * 12,
      });
      return "ok";
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return "gone";
      console.error("push failed", code ?? "", String((e as Error).message).split("\n")[0].slice(0, 120));
      return "failed";
    }
  };
}

/** A household's cards with their latest bill, as of `today`. */
export async function viewsFor(householdId: string, today: string): Promise<CardView[]> {
  const repo = createFirestoreRepository(householdId);
  const [accounts, bills, records] = await Promise.all([repo.accounts.list(), repo.cardBills.list(), repo.records.list()]);
  return cardViews(accounts, bills, records, today);
}
