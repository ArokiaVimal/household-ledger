import { NextResponse } from "next/server";
import { intakeFile } from "@/lib/import/intake";
import { MAX_FILE_BYTES } from "@/lib/import/service";
import { authorize, parseDecisions, runImport, sha256 } from "./shared";

// Claude may be asked to read an unfamiliar layout, which can take a while on a long statement.
export const maxDuration = 60;
const cleanName = (n: string) => n.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "statement";

/**
 * Reads an uploaded statement. `mode=preview` only reports; `mode=commit` saves the batch and stages the rows for review.
 * The payment method is optional: it is sensed from the statement, and the reply asks (`needAccount`) when unclear.
 * `ai=1` is the person's consent to send redacted text to Claude. The file is read in memory and not stored.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 512 * 1024) return NextResponse.json({ error: "That file is too large. Export a shorter date range." }, { status: 413 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Could not read the upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is larger than 4 MB. Export a shorter date range." }, { status: 413 });
  const sign = form.get("positiveIsDebit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const accountId = String(form.get("accountId") ?? "") || undefined;
  return runImport(who, form.get("mode") === "commit" ? "commit" : "preview", form.get("ai") === "1", (o) => intakeFile(bytes, file.name, {
    ...o, accountId,
    base: { filename: cleanName(file.name), fileHash: sha256(bytes), acceptMismatch: form.get("acceptMismatch") === "1", allowReimport: form.get("reimport") === "1", decisions: parseDecisions(form.get("decisions")), positiveIsDebit: sign === "true" ? true : sign === "false" ? false : undefined },
  }));
}
