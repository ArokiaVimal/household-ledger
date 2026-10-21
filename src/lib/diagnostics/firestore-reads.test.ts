import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); delete (globalThis as { __fsReadsPatched?: boolean }).__fsReadsPatched; });

describe("installReadCounter", () => {
  it("counts documents per collection for queries, single documents and getAll, and an empty query as one", async () => {
    vi.stubEnv("LOG_FIRESTORE_READS", "1");
    const { Query, DocumentReference, Firestore } = await import("firebase-admin/firestore");
    // Swap the real network calls for fakes before the counter wraps them.
    const origQ = Query.prototype.get, origD = DocumentReference.prototype.get, origA = Firestore.prototype.getAll;
    (Query.prototype as unknown as { get: () => Promise<unknown> }).get = async function (this: unknown) { return { size: (this as { fake: number }).fake }; };
    (DocumentReference.prototype as unknown as { get: () => Promise<unknown> }).get = async () => ({ exists: true });
    (Firestore.prototype as unknown as { getAll: () => Promise<unknown[]> }).getAll = async () => [{}, {}, {}];
    try {
      const { installReadCounter } = await import("./firestore-reads");
      const { measureReads } = await import("./read-tally");
      installReadCounter();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await measureReads("test", async () => {
        await Query.prototype.get.call({ fake: 120, _queryOptions: { collectionId: "records" } } as never);
        await Query.prototype.get.call({ fake: 0, _queryOptions: { collectionId: "receipts" } } as never);
        await DocumentReference.prototype.get.call({ parent: { id: "users" } } as never);
        await Firestore.prototype.getAll.call({} as never);
      });
      expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ name: "test", total: 125, top: { records: 120, getAll: 3, "users (doc)": 1, receipts: 1 } });
    } finally {
      Query.prototype.get = origQ; DocumentReference.prototype.get = origD; Firestore.prototype.getAll = origA;
    }
  });
  it("does nothing when logging is off", async () => {
    const { Query } = await import("firebase-admin/firestore");
    const before = Query.prototype.get;
    const { installReadCounter } = await import("./firestore-reads");
    installReadCounter();
    expect(Query.prototype.get).toBe(before);
  });
});
