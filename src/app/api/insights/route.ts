import { trackedClaude } from "@/lib/ai-usage/server";
import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { loadHouseholdData, participantIdFor } from "@/lib/data/load";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { analyzeMonth } from "@/lib/insights/ai";
import { buildFacts } from "@/lib/insights/facts";
import { authorize } from "../import/shared";

export const maxDuration = 60;

/**
 * Analyses one month of the signed-in person's own entries with Claude. Only runs when the person asks (Analyse or Refresh):
 * the body is `{ month: "YYYY-MM" }`. Claude is sent totals and names, never bank text, notes or account numbers.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  let month = "";
  try { month = String(((await req.json()) as { month?: unknown }).month ?? ""); } catch { /* invalid below */ }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Pick a month." }, { status: 400 });
  const claude = trackedClaude(claudeFromEnv(process.env), who.session.uid, "insights");
  if (!claude) return NextResponse.json({ error: "AI is off on this server. Add an Anthropic API key to switch it on." }, { status: 400 });
  try {
    const data = await loadHouseholdData(createFirestoreRepository(who.membership.household.id));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const facts = buildFacts({
      month, today, meId: participantIdFor(who.session.uid), records: data.records, staged: data.records.filter((r) => r.status === "unreviewed").length,
      categories: data.categories, accounts: data.accounts, recurringItems: data.recurring, cardBills: data.cardBills,
    });
    if (facts.totals.transactions === 0) return NextResponse.json({ error: "There are no approved transactions in that month yet, so there is nothing to analyze." }, { status: 400 });
    const { analysis, usage } = await analyzeMonth(claude, facts);
    if (!analysis) return NextResponse.json({ error: usage.error ?? "Could not analyze that." }, { status: 502 });
    return NextResponse.json({ ok: true, analysis, generatedAt: new Date().toISOString(), tokens: usage.inputTokens + usage.outputTokens });
  } catch (e) {
    console.error("insights failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not analyze that. Try again." }, { status: 500 });
  }
}
