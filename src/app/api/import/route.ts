import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { ensureHouseholdReady, participantIdFor } from "@/lib/data/load";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { FileError, readTable, sniffKind } from "@/lib/import/files";
import { commitImport, ImportError, MAX_FILE_BYTES, previewImport, type ImportDeps } from "@/lib/import/service";

const deps: ImportDeps = { sha256: (s) => createHash("sha256").update(s).digest("hex"), now: () => Date.now(), newId: () => randomUUID() };
const status = { invalid: 400, not_found: 404, already_imported: 409, too_large: 413 } as const;
const cleanName = (n: string) => n.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "statement";

/**
 * Reads an uploaded statement. `mode=preview` only reports; `mode=commit` saves the batch and stages the rows for review.
 * The file is read in memory and not stored; only its SHA-256 is kept (to refuse a second upload of the same file).
 */
export async function POST(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 512 * 1024) return NextResponse.json({ error: "That file is too large. Export a shorter date range." }, { status: 413 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Could not read the upload." }, { status: 400 }); }
  const file = form.get("file");
  const accountId = String(form.get("accountId") ?? "");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const sign = form.get("positiveIsDebit");
  if (!(file instanceof File) || !accountId) return NextResponse.json({ error: "Choose a payment method and a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is larger than 4 MB. Export a shorter date range." }, { status: 413 });

  try {
    const membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
    if (!membership) return NextResponse.json({ error: "Create or join a household first." }, { status: 403 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffKind(file.name, bytes);
    const table = await readTable(kind, bytes);
    const input = {
      accountId, filename: cleanName(file.name), format: kind, fileHash: createHash("sha256").update(bytes).digest("hex"), table,
      positiveIsDebit: sign === "true" ? true : sign === "false" ? false : undefined,
    };
    const repo = createFirestoreRepository(membership.household.id);
    if (mode === "preview") return NextResponse.json({ ok: true, preview: await previewImport(repo, input, deps) });
    await ensureHouseholdReady(repo, membership.members);
    const result = await commitImport(repo, { uid: session.uid, participantId: participantIdFor(session.uid) }, input, deps);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof FileError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("import failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not read that file. Try again." }, { status: 500 });
  }
}
