import "server-only";
import type { AiFeature } from "@/domain/ai-usage";
import { createClaudeSuggest, type ClaudeConfig, type Suggest } from "@/lib/import/ai";
import { recordAiUsage } from "./store";
import { trackedFetch } from "./track";

/** The same Claude settings, but every answer's tokens are counted against this profile and feature. `null` stays `null` (AI off). */
export function trackedClaude(cfg: ClaudeConfig | null, uid: string, feature: AiFeature): ClaudeConfig | null {
  return cfg ? { ...cfg, fetchImpl: trackedFetch(cfg.fetchImpl, (t) => recordAiUsage(uid, feature, t)) } : null;
}

/** The merchant-labelling AI with the same counting. */
export function trackedSuggest(env: Record<string, string | undefined>, uid: string, feature: AiFeature): Suggest | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  return apiKey ? createClaudeSuggest(trackedClaude({ apiKey, model: env.ANTHROPIC_MODEL?.trim() || undefined }, uid, feature)!) : null;
}
