import { trackedClaude } from "@/lib/ai-usage/server";
import { NextResponse } from "next/server";
import { parseBillDataUrl, readBill } from "@/lib/import/bill-extract";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { authorize } from "../import/shared";

export const maxDuration = 60;
const MAX_BODY = 5 * 1024 * 1024;

/** Reads one bill (photo, screenshot or PDF) when the person clicks Scan. Saves nothing; the picture is not kept. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "That file is too large. Try a smaller one." }, { status: 413 });
  const claude = trackedClaude(claudeFromEnv(process.env), who.session.uid, "bill");
  if (!claude) return NextResponse.json({ error: "AI is off. Add an Anthropic API key to the server to scan bills." }, { status: 400 });
  let b: { file?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const file = typeof b.file === "string" ? parseBillDataUrl(b.file) : null;
  if (!file) return NextResponse.json({ error: "Use a photo (PNG, JPG, WebP) or a PDF under 3 MB." }, { status: 400 });
  const r = await readBill(claude, file, new Date().toISOString().slice(0, 10));
  if (!r.bill) return NextResponse.json({ error: r.usage.error ?? "Could not find a bill in that file." }, { status: r.usage.error ? 502 : 422 });
  return NextResponse.json({ ok: true, bill: r.bill, warnings: r.warnings });
}
