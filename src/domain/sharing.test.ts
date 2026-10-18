import { describe, expect, it } from "vitest";
import { buildShared, planShare, scopeRecords, SharingError, sharedToRecord } from "./sharing";
import { pairBalances } from "./balances";
import type { ExpenseRecord } from "./types";

const ctx = { meId: "u_me", partnerId: "u_wife", coupleActive: true };
const rec = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "r1", date: "2026-10-01", merchant: "Zepto", originalDescription: "ZEPTO MARKETPLACE BLR 5012345678", amountPaise: 64200, currency: "INR", accountId: "cc_amex", categoryId: "groceries",
  kind: "purchase", payerId: "u_me", shared: true, split: { mode: "equal", participantIds: ["u_me", "u_wife"] }, excluded: false, status: "reviewed", importSource: "amex.pdf", referenceId: "R1", notes: "for the party", ...o,
});

describe("planShare", () => {
  it("a reviewed split with the partner is shared", () => expect(planShare(rec(), ctx)).toEqual({ action: "share" }));
  it("private records and the review queue are never shared", () => {
    expect(planShare(rec({ shared: false, split: { mode: "personal", participantIds: ["u_me"] } }), ctx)).toEqual({ action: "none" });
    expect(planShare(rec({ status: "unreviewed" }), ctx)).toEqual({ action: "none" });
  });
  it("changing back to personal, excluding, or rejecting later withdraws an earlier share", () => {
    expect(planShare(rec({ sharedWithPartner: true, shared: false, split: { mode: "personal", participantIds: ["u_me"] } }), ctx)).toEqual({ action: "withdraw" });
    expect(planShare(rec({ sharedWithPartner: true, excluded: true }), ctx)).toEqual({ action: "withdraw" });
  });
  it("without a linked partner nothing is shared", () => expect(planShare(rec(), { ...ctx, coupleActive: false })).toEqual({ action: "none" }));
  it("refuses what cannot be shared, with a plain reason", () => {
    expect(() => planShare(rec({ kind: "cc_payment" }), ctx)).toThrow(SharingError);
    expect(() => planShare(rec({ kind: "income" }), ctx)).toThrow(/private/);
    expect(() => planShare(rec({ payerId: "u_wife" }), ctx)).toThrow(/paid/);
    expect(() => planShare(rec({ split: { mode: "equal", participantIds: ["u_me", "u_wife", "p_friend"] } }), ctx)).toThrow(/friend/);
  });
});

describe("buildShared", () => {
  const at = "2026-10-02T00:00:00.000Z";
  it("keeps only what the partner may see", () => {
    const s = buildShared(rec(), { ownerUid: "me", categoryName: "Groceries", now: at });
    const text = JSON.stringify(s);
    expect(text).not.toContain("ZEPTO MARKETPLACE");
    expect(text).not.toContain("cc_amex");
    expect(text).not.toContain("amex.pdf");
    expect(text).not.toContain("R1");
    expect(s.note).toBeUndefined();
    expect(s).toMatchObject({ id: "r1", merchant: "Zepto", amountPaise: 64200, categoryName: "Groceries", kind: "purchase" });
  });
  it("includes the note only when the owner opted in, and keeps the first share time", () => {
    const s = buildShared(rec({ shareNote: true }), { ownerUid: "me", categoryName: "Groceries", now: at, createdAt: "2026-09-01T00:00:00.000Z" });
    expect(s.note).toBe("for the party");
    expect(s.createdAt).toBe("2026-09-01T00:00:00.000Z");
    expect(s.updatedAt).toBe(at);
  });
  it("converts back to a ledger row for balances and reports", () => {
    const r = sharedToRecord(buildShared(rec(), { ownerUid: "me", categoryName: "Groceries", now: at }));
    expect(r).toMatchObject({ id: "r1", shared: true, status: "reviewed", excluded: false, payerId: "u_me" });
  });
});

describe("scopeRecords and balances", () => {
  const mineShared = rec({ id: "a", sharedWithPartner: true });
  const mineOnly = rec({ id: "b", shared: false, split: { mode: "personal", participantIds: ["u_me"] }, merchant: "Private" });
  const theirs = rec({ id: "c", payerId: "u_wife", merchant: "Theirs" });
  const shared = [mineShared, theirs].map((r) => ({ ...r, accountId: "shared", originalDescription: "", importSource: "Shared" }));
  const base = { own: [mineShared, mineOnly], shared, meId: "u_me", month: "2026-10" };
  it("Mine shows my records once plus my share of what my partner paid", () => {
    const rows = scopeRecords({ ...base, coupled: true, view: "personal" });
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("Together shows only shared expenses, never my private ones", () => {
    const rows = scopeRecords({ ...base, coupled: true, view: "household" });
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });
  it("solo: Mine and Everything are just my own records", () => {
    expect(scopeRecords({ ...base, shared: [], coupled: false, view: "personal" }).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
  it("balances come from shared expenses only: equal split of 642 means my partner owes 321", () => {
    const b = pairBalances(shared.filter((r) => r.id === "a"), []);
    expect(b).toEqual([{ from: "u_wife", to: "u_me", owed: 32100, settled: 0, outstanding: 32100 }]);
    const both = pairBalances(shared, []);
    expect(both).toEqual([]); // two equal expenses paid by each side cancel out
  });
});
