import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import type { Intake } from "@/lib/import/intake";
import { parseImageDataUrl, readScreenshot } from "@/lib/import/vision-extract";
import type { ParsedRow } from "@/domain/import/rows";
import { authorize, runImport, sha256 } from "../shared";

export const maxDuration = 60;
const MAX_BODY = 5 * 1024 * 1024;

type AddRow = { date: string; merchant: string; amountPaise: number; orderId?: string; voucherBrandId?: string; note?: string };

/**
 * Screenshots of payments. Two steps, both started by a click:
 *  - action "read": Claude reads the picture and returns what it saw. Nothing is saved and the picture is not kept.
 *  - action "add": saves the rows you confirmed to the review queue (nothing counts until approved), with their voucher brand and note.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "That screenshot is too large. Try a smaller one." }, { status: 413 });
  let b: { action?: unknown; image?: unknown; source?: unknown; accountId?: unknown; rows?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const today = new Date().toISOString().slice(0, 10);

  if (b.action === "read") {
    const claude = claudeFromEnv(process.env);
    if (!claude) return NextResponse.json({ error: "AI is off. Add an Anthropic API key to the server to read screenshots." }, { status: 400 });
    const image = typeof b.image === "string" ? parseImageDataUrl(b.image) : null;
    if (!image) return NextResponse.json({ error: "Use a PNG, JPG or WebP screenshot under 3 MB." }, { status: 400 });
    const source = typeof b.source === "string" ? b.source.slice(0, 80) : undefined;
    const r = await readScreenshot(claude, image, { today, source });
    if (r.usage.error && r.items.length === 0) return NextResponse.json({ error: r.usage.error }, { status: 502 });
    return NextResponse.json({ ok: true, items: r.items, unreadable: r.unreadable, warnings: r.warnings });
  }

  if (b.action === "add") {
    const accountId = typeof b.accountId === "string" ? b.accountId : "";
    const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 60).filter((r): r is AddRow => !!r && typeof r === "object" && typeof (r as AddRow).merchant === "string" && Number.isInteger((r as AddRow).amountPaise) && (r as AddRow).amountPaise > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String((r as AddRow).date)));
    if (!accountId || rows.length === 0) return NextResponse.json({ error: "Choose a payment method and at least one payment." }, { status: 400 });
    const parsed: ParsedRow[] = rows.map((r, i) => ({
      line: i + 1, date: r.date, description: r.merchant.slice(0, 120), amountPaise: r.amountPaise, direction: "debit", raw: ["from screenshot", r.merchant.slice(0, 120)],
      ...(r.orderId ? { referenceId: String(r.orderId).slice(0, 60) } : {}),
    }));
    const res = await runImport(who, "commit", false, async () => ({
      kind: "ready", input: {
        filename: "Screenshot", fileHash: sha256(JSON.stringify(parsed)), accountId, allowReimport: true,
        detected: { chosen: true, confidence: "sure", reason: "You chose it" }, format: "text", rows: parsed, readBy: "ai",
      },
    }) as Intake);
    // Tag the new rows with their voucher brand and note. Only these two editable fields change; the imported text and amounts do not.
    try {
      const body = (await res.clone().json()) as { ok?: boolean; result?: { batchId?: string } };
      const batchId = body.result?.batchId;
      if (body.ok && batchId) {
        const repo = createFirestoreRepository(who.membership.household.id);
        const added = (await repo.records.list()).filter((r) => r.batchId === batchId);
        const used = new Set<string>();
        for (const row of rows) {
          if (!row.voucherBrandId && !row.note) continue;
          const rec = added.find((r) => !used.has(r.id) && r.date === row.date && r.amountPaise === row.amountPaise && (!row.orderId || !r.referenceId || r.referenceId === row.orderId));
          if (!rec) continue;
          used.add(rec.id);
          await repo.records.put({ ...rec, ...(row.voucherBrandId && (await repo.voucherBrands.get(row.voucherBrandId)) ? { voucherBrandId: row.voucherBrandId } : {}), ...(row.note ? { notes: row.note.slice(0, 1000) } : {}) });
        }
      }
    } catch { /* the rows are saved; tagging can be done in review */ }
    return res;
  }
  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
