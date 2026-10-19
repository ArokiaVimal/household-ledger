import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { categoriseFromNotes, notesToRead } from "@/lib/notes/ai";
import { authorize } from "../import/shared";

export const maxDuration = 60;

/**
 * Reads the notes on your transactions and PROPOSES categories. It never changes anything: the page shows the proposals
 * and you choose which to apply. Runs only when you press the button. Claude sees merchant, amount, current category and
 * the masked note, never the bank text.
 */
export async function POST() {
  const who = await authorize();
  if (!who.ok) return who.res;
  const claude = claudeFromEnv(process.env);
  if (!claude) return NextResponse.json({ error: "AI is off on this server. Add an Anthropic API key to switch it on." }, { status: 400 });
  try {
    const repo = createFirestoreRepository(who.membership.household.id);
    const [records, categories] = await Promise.all([repo.records.list(), repo.categories.list()]);
    if (notesToRead(records).length === 0) return NextResponse.json({ ok: true, read: 0, proposals: [], message: "No transactions have a note yet." });
    const { proposals, read, usage } = await categoriseFromNotes(claude, records, categories);
    if (usage.error && proposals.length === 0) return NextResponse.json({ error: usage.error }, { status: 502 });
    const byId = new Map(records.map((r) => [r.id, r]));
    // Only real changes, and never to a row that was edited since (the client re-checks too).
    const changes = proposals.filter((p) => p.toCategoryId !== p.fromCategoryId).map((p) => {
      const r = byId.get(p.id)!;
      return { ...p, merchant: r.merchant, date: r.date, amountPaise: r.amountPaise, note: (r.notes ?? "").slice(0, 300), status: r.status };
    });
    return NextResponse.json({ ok: true, read, proposals: changes, tokens: usage.inputTokens + usage.outputTokens, partial: usage.error ?? null });
  } catch (e) {
    console.error("notes read failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not read the notes. Try again." }, { status: 500 });
  }
}
