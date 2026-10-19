import { describe, expect, it } from "vitest";
import { undoableIds } from "./audit";
import type { AuditEvent } from "./types";

const ev = (id: string, entityId: string, extra: Partial<AuditEvent> = {}): AuditEvent => ({ id, at: "2026-10-01T00:00:00.000Z", actorId: "u", action: "edit", entity: "record", entityId, summary: id, change: { before: { a: 1 }, after: { a: 2 } }, ...extra });

describe("undoable changes", () => {
  it("only the newest change of a record that was not undone", () => {
    const events = [ev("1", "r1"), ev("2", "r1"), ev("3", "r2"), ev("4", "r3", { change: undefined }), ev("5", "r3", { entity: "settlement" })];
    expect([...undoableIds(events)].sort()).toEqual(["2", "3"]);
  });
  it("an undone change is not offered again, and the undo itself can be undone", () => {
    const events = [ev("1", "r1"), ev("2", "r1", { undoes: "1" })];
    expect([...undoableIds(events)]).toEqual(["2"]);
  });
});
