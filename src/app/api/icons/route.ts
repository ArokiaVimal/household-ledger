import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { iconByName } from "@/domain/icons";
import { logoFor } from "@/lib/logos";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { pickIcons, type IconWant } from "@/lib/icons/ai";
import { authorize } from "../import/shared";

export const maxDuration = 60;

/**
 * Proposes icons for categories, payment methods and merchants that have none yet and that the name matcher / brand logos do
 * not already cover. Only names go to Claude. Nothing is changed here: the page shows the proposals and the person applies them.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  const claude = claudeFromEnv(process.env);
  if (!claude) return NextResponse.json({ error: "AI is off on this server. Add an Anthropic API key to switch it on." }, { status: 400 });
  try {
    // `all`: ask again about everything (a refresh), not only what has nothing yet.
    const all = ((await req.json().catch(() => null)) as { all?: boolean } | null)?.all === true;
    const repo = createFirestoreRepository(who.membership.household.id);
    const [categories, accounts, memories] = await Promise.all([repo.categories.list(), repo.accounts.list(), repo.merchantMemory.list()]);
    const wants: IconWant[] = [
      ...categories.filter((c) => all || (!c.icon && !iconByName(c.name))).map((c) => ({ kind: "category" as const, ref: c.id, name: c.name })),
      ...accounts.filter((a) => all ? !logoFor(a.name) : !a.icon && !logoFor(a.name)).map((a) => ({ kind: "account" as const, ref: a.id, name: a.name })),
      ...[...new Map(memories.filter((m) => (all || (!m.icon && !m.logo)) && !logoFor(m.name)).map((m) => [m.name.toLowerCase(), m])).values()].map((m) => ({ kind: "merchant" as const, ref: m.name, name: m.name })),
    ];
    if (wants.length === 0) return NextResponse.json({ ok: true, picks: [], message: "Everything already has an icon." });
    const { picks, usage } = await pickIcons(claude, wants);
    if (usage.error && picks.length === 0) return NextResponse.json({ error: usage.error }, { status: 502 });
    return NextResponse.json({ ok: true, picks, asked: wants.length, tokens: usage.inputTokens + usage.outputTokens, partial: usage.error ?? null });
  } catch (e) {
    console.error("icons failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not pick icons. Try again." }, { status: 500 });
  }
}
