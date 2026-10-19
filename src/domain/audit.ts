// Reading the audit trail: which changes can still be undone. Pure.
import type { AuditEvent } from "./types";

/** Entities whose changes record before/after values and can be undone one step at a time. */
const UNDOABLE_ENTITIES = new Set<AuditEvent["entity"]>(["record", "split_group"]);

/**
 * A change can be undone when it recorded what changed, has not been undone already, and nothing newer has changed the same
 * transaction or group (so undo always walks back one step at a time). `events` must be oldest first, as the repository returns them.
 */
export function undoableIds(events: AuditEvent[]): Set<string> {
  const undone = new Set(events.map((e) => e.undoes).filter((x): x is string => !!x));
  const lastChange = new Map<string, string>();
  const key = (e: AuditEvent) => `${e.entity}:${e.entityId}`;
  for (const e of events) if (UNDOABLE_ENTITIES.has(e.entity) && e.change) lastChange.set(key(e), e.id);
  return new Set(events.filter((e) => UNDOABLE_ENTITIES.has(e.entity) && e.change && !undone.has(e.id) && lastChange.get(key(e)) === e.id).map((e) => e.id));
}
