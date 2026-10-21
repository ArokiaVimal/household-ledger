import { NextResponse } from "next/server";
import { z } from "zod";
import { createFirestoreRepository, deleteHouseholdData } from "@/data/firestore-repository";
import { buildBackup, restoreBackup, verifyBackup } from "@/lib/backup/backup";
import { createLinkDeps } from "@/lib/links/server";
import { removeAccountLinks } from "@/lib/links/service";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getCouple } from "@/lib/households/couple";
import { withdrawOwnShares } from "@/lib/data/withdraw";
import { authorize } from "../import/shared";

export const maxDuration = 300;
const MAX_BODY = 30_000_000;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("export") }),
  z.object({ action: z.literal("verify"), backup: z.unknown() }),
  z.object({ action: z.literal("restore"), backup: z.unknown(), confirm: z.string() }),
  z.object({ action: z.literal("delete"), confirm: z.string() }),
]);

/**
 * Backup, verified restore and permanent deletion of the signed-in person's own space. Same-origin and signed-in only. Restore needs a
 * backup that verifies AND the typed word RESTORE; deletion needs the typed words DELETE MY DATA. Restore keeps a safety copy of the
 * current data in memory and puts it back if the restore fails part way.
 */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* validation below */ }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const hid = who.membership.household.id;
  const repo = createFirestoreRepository(hid);
  const a = parsed.data;
  try {
    if (a.action === "export") return NextResponse.json({ ok: true, backup: await buildBackup(repo) });
    if (a.action === "verify") {
      const v = await verifyBackup(a.backup);
      return v.ok ? NextResponse.json({ ok: true, exportedAt: v.backup.exportedAt, counts: v.backup.counts, warnings: v.warnings }) : NextResponse.json({ ok: false, errors: v.errors }, { status: 422 });
    }
    if (a.action === "restore") {
      if (a.confirm !== "RESTORE") return NextResponse.json({ error: "Type RESTORE to confirm." }, { status: 400 });
      const v = await verifyBackup(a.backup);
      if (!v.ok) return NextResponse.json({ ok: false, errors: v.errors }, { status: 422 });
      const safety = await buildBackup(repo);
      const wipe = () => deleteHouseholdData(hid);
      try {
        await restoreBackup(repo, v.backup, wipe);
      } catch (e) {
        console.error("restore failed, putting the previous data back", String((e as Error).message).split("\n")[0].slice(0, 160));
        try { await restoreBackup(repo, safety, wipe); } catch { /* reported below */ }
        return NextResponse.json({ error: "The restore did not finish, so your previous data was put back. Nothing was lost." }, { status: 500 });
      }
      await repo.audit.append({ actorId: who.session.uid, action: "create", entity: "household", entityId: "backup", summary: `Restored a backup from ${v.backup.exportedAt}: ${v.backup.counts.records} transactions, ${v.backup.counts.settlements} settlements` });
      return NextResponse.json({ ok: true, counts: v.backup.counts });
    }
    // delete
    if (a.confirm !== "DELETE MY DATA") return NextResponse.json({ error: "Type DELETE MY DATA to confirm." }, { status: 400 });
    // The expenses you shared with your partner are withdrawn first, so nobody is left owing money for transactions that no longer exist.
    const couple = await getCouple(createFirestoreHouseholdStore(), who.session.uid).catch(() => null);
    if (couple) await withdrawOwnShares(createFirestoreRepository(couple.household.id), who.session.uid, "all data deleted");
    await removeAccountLinks(createLinkDeps(), who.session.uid);
    await deleteHouseholdData(hid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("backup action failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Something went wrong. Nothing was changed unless this message says otherwise." }, { status: 500 });
  }
}
