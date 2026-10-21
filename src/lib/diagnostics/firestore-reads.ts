import "server-only";
import { DocumentReference, Firestore, Query, Transaction } from "firebase-admin/firestore";
import { readLoggingOn, recordRead } from "./read-tally";

type Loose = (this: unknown, ...a: unknown[]) => Promise<unknown>;
const done = globalThis as { __fsReadsPatched?: boolean };

/** Best-effort collection name for a query ("records", "settlements"...). Internal field, so it falls back to "query". */
const queryLabel = (q: unknown) => (q as { _queryOptions?: { collectionId?: string } })._queryOptions?.collectionId ?? "query";
const countOf = (r: unknown): number => {
  const x = r as { size?: number; length?: number; exists?: boolean } | null;
  if (x && typeof x.size === "number") return Math.max(1, x.size); // an empty query still costs one read
  if (Array.isArray(r)) return r.length;
  return 1;
};

/**
 * When LOG_FIRESTORE_READS=1, wraps the Admin SDK's read calls once so every read is counted (see `read-tally.ts`).
 * Does nothing otherwise. Remove when the read optimisation work is finished.
 */
export function installReadCounter(): void {
  if (!readLoggingOn() || done.__fsReadsPatched) return;
  done.__fsReadsPatched = true;
  const wrap = (proto: object, key: string, label: (self: unknown) => string) => {
    const original = (proto as Record<string, Loose>)[key];
    (proto as Record<string, Loose>)[key] = async function (this: unknown, ...a: unknown[]) {
      const r = await original.apply(this, a);
      recordRead(label(this), countOf(r));
      return r;
    };
  };
  wrap(Query.prototype, "get", queryLabel);
  wrap(DocumentReference.prototype, "get", (d) => `${(d as { parent?: { id?: string } }).parent?.id ?? "doc"} (doc)`);
  wrap(Firestore.prototype, "getAll", () => "getAll");
  wrap(Transaction.prototype, "get", () => "transaction");
}
