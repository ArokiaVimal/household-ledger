import { NextResponse } from "next/server";
import { trackedClaude } from "@/lib/ai-usage/server";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { MAX_TRANSCRIPT, understandExpense } from "@/lib/voice/ai";
import { authorize } from "../import/shared";

export const maxDuration = 30;
const MAX_BODY = 8 * 1024;

/**
 * Understands one spoken expense when the person taps the microphone. It sends Claude only the words that were said, today's date and
 * the person's category names. It returns the facts it heard; the browser matches them to contacts and cards. Nothing is saved.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "That was too long. Say one expense at a time." }, { status: 413 });
  const claude = trackedClaude(claudeFromEnv(process.env), who.session.uid, "voice");
  if (!claude) return NextResponse.json({ error: "AI is off on this server. Add an Anthropic API key to use voice." }, { status: 400 });
  let b: { transcript?: unknown; categories?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const transcript = typeof b.transcript === "string" ? b.transcript.trim() : "";
  if (transcript.length < 3) return NextResponse.json({ error: "I did not hear anything. Try again." }, { status: 400 });
  if (transcript.length > MAX_TRANSCRIPT * 2) return NextResponse.json({ error: "That was too long. Say one expense at a time." }, { status: 413 });
  const categoryNames = Array.isArray(b.categories) ? b.categories.filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 60)).slice(0, 60) : [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const r = await understandExpense(claude, transcript, { today, categoryNames });
  if (r.usage.error) return NextResponse.json({ error: r.usage.error }, { status: 502 });
  return NextResponse.json({ ok: true, facts: r.facts, warnings: r.warnings });
}
