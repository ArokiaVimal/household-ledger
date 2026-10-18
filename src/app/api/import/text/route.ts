import { NextResponse } from "next/server";
import { intakeText } from "@/lib/import/intake";
import { authorize, runImport, sha256 } from "../shared";

export const maxDuration = 60;
const MAX_CHARS = 100_000;

/** Reads pasted or typed transactions (JSON: text, mode "table" | "ai", ai consent, optional accountId). Same review rules as a file. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CHARS * 4) return NextResponse.json({ error: "That is too much text." }, { status: 413 });
  let b: { text?: unknown; mode?: unknown; ai?: unknown; accountId?: unknown; action?: unknown; reimport?: unknown; positiveIsDebit?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim() || text.length > MAX_CHARS) return NextResponse.json({ error: text.trim() ? "That is too much text. Paste a smaller part." : "Paste or type some transactions first." }, { status: 400 });
  const accountId = typeof b.accountId === "string" && b.accountId ? b.accountId : undefined;
  return runImport(who, b.action === "commit" ? "commit" : "preview", b.ai === true, (o) => intakeText(text, b.mode === "ai" ? "ai" : "table", {
    ...o, accountId, base: { filename: "Pasted text", fileHash: sha256(text), allowReimport: b.reimport === true, positiveIsDebit: typeof b.positiveIsDebit === "boolean" ? b.positiveIsDebit : undefined },
  }));
}
