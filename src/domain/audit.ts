// Reading the audit trail: which changes can still be undone. Pure.
import type { AuditEvent } from "./types";

/**
 * A change can be undone when it recorded what changed, has not been undone already, and nothing newer has changed the same
 * transaction (so undo always walks back one step at a time). `events` must be oldest first, as the repository returns them.
 */
export function undoableIds(events: AuditEvent[]): Set<string> {
  const undone = new Set(events.map((e) => e.undoes).filter((x): x is string => !!x));
  const lastChange = new Map<string, string>();
  for (const e of events) if (e.entity === "record" && e.change) lastChange.set(e.entityId, e.id);
  return new Set(events.filter((e) => e.entity === "record" && e.change && !undone.has(e.id) && lastChange.get(e.entityId) === e.id).map((e) => e.id));
}
