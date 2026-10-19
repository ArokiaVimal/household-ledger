import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { undoableIds } from "@/domain/audit";
import { authorize } from "../import/shared";

/** The audit trail (newest first, capped) and the import history, for the Activity screen. Read only; undo and rollback go through /api/data. */
export async function POST() {
  const who = await authorize();
  if (!who.ok) return who.res;
  try {
    const repo = createFirestoreRepository(who.membership.household.id);
    const [events, batches, records] = await Promise.all([repo.audit.list(), repo.importBatches.list(), repo.records.list()]);
    const undoable = undoableIds(events);
    const imports = batches.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 50).map((b) => {
      const tag = `(import ${b.id.slice(0, 8)})`;
      const rows = records.filter((r) => r.batchId === b.id || r.importSource.endsWith(tag));
      return { id: b.id, filename: b.filename, uploadedAt: b.uploadedAt, rows: b.counts.rows, rolledBackAt: b.rolledBackAt ?? null, approved: rows.filter((r) => r.status === "reviewed").length, waiting: rows.filter((r) => r.status === "unreviewed").length };
    });
    const changes = events.slice(-200).reverse().map((e) => ({ id: e.id, at: e.at, actorId: e.actorId, action: e.action, entity: e.entity, entityId: e.entityId, summary: e.summary, undoable: undoable.has(e.id), undone: events.some((x) => x.undoes === e.id) }));
    return NextResponse.json({ ok: true, changes, imports });
  } catch (e) {
    console.error("activity failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Could not load the activity. Try again." }, { status: 500 });
  }
}
