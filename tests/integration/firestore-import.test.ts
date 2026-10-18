// Opt-in: the statement import against the REAL Firestore (dev project only), including re-upload and overlap protection.
// RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enabled = process.env.RUN_FIRESTORE_TESTS === "1" && !!process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.APP_ENV !== "production";
const hid = `itest-import-${Math.random().toString(36).slice(2, 8)}`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const csv = `Account Statement
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,UPI-SWIGGY-swiggy@icici-123456789012-Order,0000123456789012,01/09/26,612.00,,45388.00
01/09/26,NEFT CR-ACME LTD-SALARY SEP,N123,01/09/26,,"1,85,000.00","2,30,388.00"
05/09/26,CREDIT CARD PAYMENT HDFC 4471,REF5,05/09/26,"18,500.00",,"2,11,888.00"
`;

describe.skipIf(!enabled)("statement import on Firestore", () => {
  afterAll(async () => {
    const { deleteHouseholdData } = await import("@/data/firestore-repository");
    await deleteHouseholdData(hid);
  }, 60_000);

  it("commit, re-upload refused, overlap deduplicated, raw rows immutable", async () => {
    const { createFirestoreRepository } = await import("@/data/firestore-repository");
    const { ensureHouseholdReady, loadHouseholdData, participantIdFor } = await import("@/lib/data/load");
    const { commitImport } = await import("@/lib/import/service");
    const { parseCsv } = await import("@/domain/import/csv");
    const repo = createFirestoreRepository(hid);
    await ensureHouseholdReady(repo, [{ uid: "itest-u1", displayName: "Vimal" }]);
    await repo.accounts.put({ id: "bank_hdfc", name: "HDFC Bank", type: "bank" });
    await repo.rules.put({ id: "r_swiggy", merchant: "Swiggy", categoryId: "food_delivery" });
    const deps = { sha256: sha, now: () => Date.now(), newId: () => randomUUID() };
    const actor = { uid: "itest-u1", participantId: participantIdFor("itest-u1") };
    const input = (text: string) => ({ accountId: "bank_hdfc", filename: "hdfc_sep.csv", format: "csv" as const, fileHash: sha(text), table: parseCsv(text) });

    const first = await commitImport(repo, actor, input(csv), deps);
    expect(first.counts).toMatchObject({ rows: 3, staged: 3, duplicate: 0 });
    await expect(commitImport(repo, actor, input(csv), deps)).rejects.toMatchObject({ code: "already_imported" });

    const overlap = csv + "09/09/26,UPI-ZEPTO-zepto@yesb-987654321098-Order,0000987654321098,09/09/26,899.00,,\n";
    const second = await commitImport(repo, actor, input(overlap), deps);
    expect(second.counts).toMatchObject({ rows: 4, duplicate: 3, staged: 1 });

    const data = await loadHouseholdData(repo);
    expect(data.records).toHaveLength(4);
    expect(data.records.every((r) => r.status === "unreviewed")).toBe(true);
    expect(data.records.find((r) => r.merchant === "Swiggy")).toMatchObject({ amountPaise: 61200, categoryId: "food_delivery", kind: "purchase" });
    expect(data.records.find((r) => r.kind === "cc_payment")).toMatchObject({ categoryId: "transfers" });
    expect(data.importBatches).toHaveLength(2);

    const raws = await repo.rawTransactions.list();
    expect(raws).toHaveLength(7); // 3 + 4: every row of each file is kept as read
    await expect(repo.rawTransactions.put({ ...raws[0], cells: ["tampered"] })).rejects.toThrow();
    const r = data.records[0];
    await expect(repo.records.put({ ...r, amountPaise: r.amountPaise + 1 })).rejects.toThrow();
    expect((await repo.audit.list()).filter((e) => e.action === "import")).toHaveLength(2);
  }, 120_000);
});
