import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRates } from "@/domain/ai-usage";
import { readAiUsage, readRates, writeRates } from "@/lib/ai-usage/store";
import { authorize } from "../import/shared";

/** The signed-in person's own AI usage: tokens per month and per feature, and the rates they set for the cost estimate. (POST, like the other reads, so the same-origin check applies.) */
export async function POST() {
  const who = await authorize();
  if (!who.ok) return who.res;
  try {
    const [months, rates] = await Promise.all([readAiUsage(who.session.uid, 6), readRates(who.session.uid)]);
    return NextResponse.json({ ok: true, months, rates, aiEnabled: !!process.env.ANTHROPIC_API_KEY?.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("ai usage read failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Could not load your AI usage. Try again." }, { status: 500 });
  }
}

const body = z.object({ rates: z.unknown().nullable() });

/** Saves (or, with null, clears) the model prices used for the cost estimate. Only sensible numbers are accepted. */
export async function PUT(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const rates = parsed.data.rates === null ? null : parseRates(parsed.data.rates);
  if (parsed.data.rates !== null && !rates) return NextResponse.json({ error: "Enter the prices as plain numbers (dollars per million tokens, and rupees per dollar)." }, { status: 400 });
  try {
    await writeRates(who.session.uid, rates);
    return NextResponse.json({ ok: true, rates });
  } catch (e) {
    console.error("ai rates save failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500 });
  }
}
