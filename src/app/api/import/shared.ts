import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { ensureHouseholdReady, participantIdFor } from "@/lib/data/load";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { trackedClaude, trackedSuggest } from "@/lib/ai-usage/server";
import type { AiFeature } from "@/domain/ai-usage";
import { claudeFromEnv } from "@/lib/import/ai-extract";
import { FileError } from "@/lib/import/files";
import type { Intake, IntakeOpts } from "@/lib/import/intake";
import { commitImport, ImportError, previewImport, type ImportDeps } from "@/lib/import/service";

/** Your choices for lines that look like entries you already have: { "12": "skip", "13": "import" }. Anything else is ignored. */
export function parseDecisions(raw: unknown): Record<string, "import" | "skip"> | undefined {
  let v = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return undefined; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, "import" | "skip"> = {};
  for (const [k, d] of Object.entries(v as Record<string, unknown>).slice(0, 2000)) if (/^\d{1,7}$/.test(k) && (d === "import" || d === "skip")) out[k] = d;
  return out;
}

export const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const deps = (uid: string): ImportDeps => ({ sha256: (s) => sha256(s), now: () => Date.now(), newId: () => randomUUID(), suggest: trackedSuggest(process.env, uid, "categories") });
const status = { invalid: 400, not_found: 404, already_imported: 409, too_large: 413, check_failed: 422 } as const;

/** Same-origin, signed-in, member of a household. Returns a response to send back when any check fails. */
export async function authorize() {
  if (getAuthMode(process.env) === "off") return { ok: false as const, res: NextResponse.json({ error: "Not configured" }, { status: 404 }) };
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
  if (!membership) return { ok: false as const, res: NextResponse.json({ error: "Finish setting up your account first." }, { status: 403 }) };
  return { ok: true as const, session, membership };
}

/**
 * Runs an import: build the input (file or text), then preview or commit it. The AI is only given a key when the
 * request carried the person's consent (`ai=1`) and the server has a key.
 */
export async function runImport(
  who: { session: { uid: string }; membership: NonNullable<Awaited<ReturnType<typeof getMembership>>> },
  mode: "preview" | "commit", ai: boolean, build: (o: Pick<IntakeOpts, "accounts" | "ai" | "claude" | "today">) => Promise<Intake>,
  feature: AiFeature = "import",
) {
  try {
    const repo = createFirestoreRepository(who.membership.household.id);
    const intake = await build({ accounts: await repo.accounts.list(), ai, claude: ai ? trackedClaude(claudeFromEnv(process.env), who.session.uid, feature) : null, today: new Date().toISOString().slice(0, 10) });
    if (intake.kind === "need_account") {
      if (mode === "commit") return NextResponse.json({ error: "Choose which payment method this is for." }, { status: 400 });
      return NextResponse.json({ ok: true, needAccount: { reason: intake.reason, candidates: intake.candidates }, extraction: intake.ai });
    }
    if (mode === "preview") return NextResponse.json({ ok: true, preview: await previewImport(repo, intake.input, deps(who.session.uid)), extraction: intake.ai });
    await ensureHouseholdReady(repo, who.membership.members);
    const result = await commitImport(repo, { uid: who.session.uid, participantId: participantIdFor(who.session.uid) }, intake.input, deps(who.session.uid));
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof FileError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("import failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    // The statement may have been read fine and failed while being saved: say which, and that nothing was kept.
    const saving = mode === "commit";
    return NextResponse.json({ error: saving ? "The statement was read, but saving it failed, so nothing was added. Try again; if it keeps happening, tell the app owner." : "Could not read that. Try again." }, { status: 500 });
  }
}
