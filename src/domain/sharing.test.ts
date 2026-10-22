import { describe, expect, it } from "vitest";
import { buildShared, planShare, SharingError, sharedToRecord } from "./sharing";
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

describe("shared balances", () => {
  const mineShared = rec({ id: "a", sharedWithPartner: true });
  const theirs = rec({ id: "c", payerId: "u_wife", merchant: "Theirs" });
  const shared = [mineShared, theirs].map((r) => ({ ...r, accountId: "shared", originalDescription: "", importSource: "Shared" }));
  it("balances come from shared expenses only: equal split of 642 means my partner owes 321", () => {
    const b = pairBalances(shared.filter((r) => r.id === "a"), []);
    expect(b).toEqual([{ from: "u_wife", to: "u_me", owed: 32100, settled: 0, outstanding: 32100 }]);
    const both = pairBalances(shared, []);
    expect(both).toEqual([]); // two equal expenses paid by each side cancel out
  });
});

describe("sharing with a partner and others in one expense", () => {
  const at = "2026-10-02T00:00:00.000Z";
  const withFriend = (o: Partial<ExpenseRecord> = {}) => rec({ split: { mode: "equal", participantIds: ["u_me", "u_wife", "p_meera"] }, ...o });
  it("is allowed: the whole split is shared, like a group expense", () => {
    expect(planShare(withFriend(), ctx)).toEqual({ action: "share" });
  });
  it("the shared copy keeps the full split and carries the other people's names, never anything more", () => {
    const names = { u_me: "Vimal", u_wife: "Sri", p_meera: "Meera Iyer", p_secret: "Not in this expense" };
    const s = buildShared(withFriend({ notes: "private note" }), { ownerUid: "me", categoryName: "Groceries", now: at, meId: "u_me", partnerId: "u_wife", names });
    expect(s.split.participantIds).toEqual(["u_me", "u_wife", "p_meera"]);
    expect(s.people).toEqual({ p_meera: "Meera Iyer" });
    expect(JSON.stringify(s)).not.toMatch(/p_secret|Not in this expense|private note|cc_amex|ZEPTO MARKETPLACE|amex\.pdf|R1"/);
  });
  it("has no names map when it is only the two partners, and uses 'Someone' for a person with no name", () => {
    expect(buildShared(rec(), { ownerUid: "me", categoryName: "G", now: at, meId: "u_me", partnerId: "u_wife", names: { u_me: "V" } }).people).toBeUndefined();
    expect(buildShared(withFriend(), { ownerUid: "me", categoryName: "G", now: at, meId: "u_me", partnerId: "u_wife", names: {} }).people).toEqual({ p_meera: "Someone" });
  });
  it("your partner's balance with you counts only their own share of a three-way split", () => {
    const row = { ...sharedToRecord(buildShared(withFriend({ amountPaise: 64200 }), { ownerUid: "me", categoryName: "G", now: at, meId: "u_me", partnerId: "u_wife", names: { p_meera: "Meera" } })) };
    const b = pairBalances([row], []);
    expect(b.find((x) => x.from === "u_wife" && x.to === "u_me")).toMatchObject({ owed: 21400, outstanding: 21400 }); // 642 / 3
    expect(sharedToRecord(buildShared(withFriend(), { ownerUid: "me", categoryName: "G", now: at, meId: "u_me", partnerId: "u_wife", names: {} })).split.participantIds).toContain("p_meera");
  });
  it("includes people who only appear in an item-wise split, and a friend who paid is not shareable", () => {
    const items = rec({ split: { mode: "items", participantIds: ["u_me", "u_wife"], items: [{ id: "i1", name: "Cake", amountPaise: 64200, participantIds: ["u_wife", "p_kid"] }] } });
    expect(buildShared(items, { ownerUid: "me", categoryName: "G", now: at, meId: "u_me", partnerId: "u_wife", names: { p_kid: "Kid" } }).people).toEqual({ p_kid: "Kid" });
    expect(() => planShare(withFriend({ payerId: "p_meera" }), ctx)).toThrow(/paid/);
  });
});

