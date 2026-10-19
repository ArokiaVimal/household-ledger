import { describe, expect, it } from "vitest";
import { applySharedPatch, buildLinkShared, checkSharedEdit, chooseContact, fromSharedId, otherUid, pairKey, planLinkSettlement, planLinkShare, proposalsFor, recordFromShared, settlementToOwner, sharedDiff, toSharedId, type ContactLink, type LinkContext } from "./links";
import { pairBalances } from "./balances";
import { sharedToRecord } from "./sharing";
import type { ExpenseRecord, Participant, Settlement, SharedExpense } from "./types";

const c = (id: string, email?: string, extra: Partial<Participant> = {}): Participant => ({ id, name: id, userId: null, ...(email ? { email } : {}), ...extra });
const acct = (o: Partial<{ uid: string; email: string | null; emailVerified: boolean }> = {}) => ({ uid: "B", email: "b@x.com", emailVerified: true, ...o });
const found = (ownerUid: string, contacts: Participant[]) => ({ ownerUid, householdId: `h_${ownerUid}`, contacts });
const side = (status: "proposed" | "active" | "declined" | "ended") => ({ householdId: "h_A", contactIds: ["c1"], email: "b@x.com", status, proposedAt: "2026-10-19T00:00:00.000Z" });
const link = (a: string, b: string, status: "proposed" | "active" | "declined" | "ended"): ContactLink => ({ id: pairKey(a, b), uids: [a, b].sort() as [string, string], sides: { [a]: side(status) }, createdAt: "", updatedAt: "" });

describe("proposals: who is asked to link", () => {
  it("never proposes from an unverified or missing email", () => {
    const f = [found("A", [c("c1", "b@x.com")])];
    expect(proposalsFor(acct({ emailVerified: false }), f, {})).toEqual([]);
    expect(proposalsFor(acct({ email: null }), f, {})).toEqual([]);
  });
  it("proposes one unique contact per owner, matching case-insensitively", () => {
    const out = proposalsFor(acct(), [found("A", [c("c1", "B@X.com")]), found("D", [c("c9", "b@x.com")]), found("E", [c("c2", "other@x.com")])], {});
    expect(out.map((p) => [p.ownerUid, p.contactIds, p.conflict])).toEqual([["A", ["c1"], false], ["D", ["c9"], false]]);
  });
  it("a conflict (two contacts, one email) needs a human choice: nothing is picked", () => {
    const [p] = proposalsFor(acct(), [found("A", [c("c1", "b@x.com"), c("c2", "b@x.com")])], {});
    expect(p).toMatchObject({ conflict: true, contactIds: ["c1", "c2"] });
    expect(chooseContact(p, undefined)).toBeNull();
    expect(chooseContact(p, "c3")).toBeNull(); // not a stored candidate
    expect(chooseContact(p, "c2")).toBe("c2");
  });
  it("skips linked contacts, the account's own contacts, active couple partners, and pairs already handled", () => {
    expect(proposalsFor(acct(), [found("A", [c("c1", "b@x.com", { linkId: "A__B" })])], {})).toEqual([]);
    expect(proposalsFor(acct(), [found("B", [c("c1", "b@x.com")])], {})).toEqual([]);
    expect(proposalsFor(acct(), [found("A", [c("c1", "b@x.com")])], {}, (o) => o === "A")).toEqual([]);
    for (const s of ["proposed", "active", "declined"] as const) expect(proposalsFor(acct(), [found("A", [c("c1", "b@x.com")])], { [pairKey("A", "B")]: link("A", "B", s) })).toEqual([]);
    expect(proposalsFor(acct(), [found("A", [c("c1", "b@x.com")])], { [pairKey("A", "B")]: link("A", "B", "ended") })).toHaveLength(1);
  });
  it("the pair key is symmetric", () => {
    expect(pairKey("A", "B")).toBe(pairKey("B", "A"));
    expect(otherUid(link("A", "B", "active"), "A")).toBe("B");
  });
});

const ctx: LinkContext = { meId: "u_A", contactId: "p_c", ownerUid: "A", otherUid: "B" };
const rec = (o: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "r1", date: "2026-10-01", merchant: "Dinner", originalDescription: "SECRET BANK TEXT", amountPaise: 100000, currency: "INR", accountId: "acc_private", categoryId: "food", kind: "purchase",
  payerId: "u_A", shared: true, split: { mode: "equal", participantIds: ["u_A", "p_c"] }, excluded: false, status: "reviewed", importSource: "HDFC.csv", notes: "private note", ...o,
});

const NOW = "2026-10-19T00:00:00.000Z";
const names = { p_friend: "Divya", p_c: "Chitra" };
const build = (r: ExpenseRecord, version = 1) => buildLinkShared(r, ctx, { categoryName: "Food", names, now: NOW, version });
const opts = { canEditBankFields: true, noteShared: false, ownerUid: "A", otherUid: "B" };

describe("what a link shares: the full expense", () => {
  it("shares when both of you are in it, however the split is made, with the real total", () => {
    expect(planLinkShare(rec(), ctx).action).toBe("share");
    const s = build(rec());
    expect(s).toMatchObject({ id: "r1", ownerUid: "A", payerId: "u_A", amountPaise: 100000, merchant: "Dinner", categoryName: "Food", version: 1, split: { mode: "equal", participantIds: ["u_A", "u_B"] } });
  });
  it("shows the full group split with the other people by name only", () => {
    const s = build(rec({ amountPaise: 90000, split: { mode: "equal", participantIds: ["u_A", "p_c", "p_friend"] } }));
    expect(s.split.participantIds).toEqual(["u_A", "u_B", "p_friend"]);
    expect(s.people).toEqual({ p_friend: "Divya" });
    expect(s.amountPaise).toBe(90000);
  });
  it("includes an expense a third person paid, as long as both of you are in it", () => {
    const r = rec({ payerId: "p_friend", split: { mode: "equal", participantIds: ["u_A", "p_c", "p_friend"] } });
    expect(planLinkShare(r, ctx).action).toBe("share");
    expect(build(r).payerId).toBe("p_friend");
  });
  it("copies no bank text, account, import details, receipts or (without opt-in) notes", () => {
    const text = JSON.stringify(build(rec({ receiptId: "rcpt", fundedBy: "acc_upi" })));
    for (const secret of ["SECRET BANK TEXT", "acc_private", "private note", "HDFC.csv", "rcpt", "acc_upi", "Manual entry"]) expect(text).not.toContain(secret);
    expect(build(rec({ shareNote: true })).note).toBe("private note");
  });
  it("shares nothing that does not involve both of you, is private, unreviewed, excluded or not spending", () => {
    for (const r of [
      rec({ split: { mode: "equal", participantIds: ["u_A", "p_other"] } }),
      rec({ payerId: "p_c", split: { mode: "equal", participantIds: ["p_c", "p_other"] } }), // you are not in it
      rec({ split: { mode: "personal", participantIds: ["u_A"] } }),
      rec({ status: "unreviewed" }), rec({ excluded: true }), rec({ kind: "income" }), rec({ kind: "transfer" }), rec({ kind: "cc_payment" }),
    ]) expect(planLinkShare(r, ctx).action).toBe("withdraw");
  });
  it("translates people both ways and keeps balances exact to the paisa", () => {
    expect(toSharedId(ctx, "u_A")).toBe("u_A"); expect(toSharedId(ctx, "p_c")).toBe("u_B"); expect(toSharedId(ctx, "p_x")).toBe("p_x");
    expect(fromSharedId(ctx, "u_B")).toBe("p_c");
    const records = [rec({ amountPaise: 100001 }), rec({ id: "r2", kind: "refund", amountPaise: 20001, payerId: "p_c" })];
    const mine = pairBalances(records, []).find((b) => [b.from, b.to].includes("p_c"))!;
    const theirs = pairBalances(records.map((r) => sharedToRecord(build(r))), [])[0];
    expect(theirs.outstanding).toBe(mine.outstanding);
  });
  it("mirrors only settlements between exactly the two, without your note, and maps them back for a ledger", () => {
    const s: Settlement = { id: "s1", date: "2026-10-05", fromId: "p_c", toId: "u_A", amountPaise: 5000, note: "cash, private", recordIds: ["r1"] };
    expect(planLinkSettlement(s, ctx)).toEqual({ id: "s1", date: "2026-10-05", fromId: "u_B", toId: "u_A", amountPaise: 5000 });
    expect(planLinkSettlement({ ...s, fromId: "p_other" }, ctx)).toBeNull();
    expect(settlementToOwner({ id: "s1", date: "2026-10-05", fromId: "u_B", toId: "u_A", amountPaise: 5000 }, ctx)).toEqual({ id: "s1", date: "2026-10-05", fromId: "p_c", toId: "u_A", amountPaise: 5000 });
  });
});

describe("editing the shared terms", () => {
  const cur: SharedExpense = build(rec({ amountPaise: 90000, split: { mode: "equal", participantIds: ["u_A", "p_c", "p_friend"] } }));
  it("lets either person change merchant, category, payer, split and (when shared) the note", () => {
    expect(checkSharedEdit(cur, { merchant: "Dinner out", categoryName: "Eating out" }, opts)).toBeNull();
    expect(checkSharedEdit(cur, { payerId: "u_B" }, opts)).toBeNull();
    expect(checkSharedEdit(cur, { split: { mode: "custom", participantIds: ["u_A", "u_B", "p_friend"], values: { u_A: 40000, u_B: 30000, p_friend: 20000 } } }, opts)).toBeNull();
    expect(checkSharedEdit(cur, { note: "x" }, { ...opts, noteShared: true })).toBeNull();
  });
  it("refuses a note the owner has not opted to show, and bank fields of imported rows", () => {
    expect(checkSharedEdit(cur, { note: "x" }, opts)).toMatch(/not chosen/);
    expect(checkSharedEdit(cur, { amountPaise: 1 }, { ...opts, canEditBankFields: false })).toMatch(/bank/);
    expect(checkSharedEdit(cur, { date: "2026-10-02" }, { ...opts, canEditBankFields: false })).toMatch(/bank/);
    expect(checkSharedEdit(cur, { amountPaise: 80000, date: "2026-10-02" }, opts)).toBeNull();
  });
  it("refuses bad money, bad splits, strangers, and dropping either of you", () => {
    expect(checkSharedEdit(cur, { amountPaise: 0 }, opts)).toMatch(/amount/);
    expect(checkSharedEdit(cur, { amountPaise: 12.5 }, opts)).toMatch(/amount/);
    expect(checkSharedEdit(cur, { split: { mode: "custom", participantIds: ["u_A", "u_B", "p_friend"], values: { u_A: 1, u_B: 1, p_friend: 1 } } }, opts)).toMatch(/equal/i);
    expect(checkSharedEdit(cur, { split: { mode: "equal", participantIds: ["u_A", "u_B", "p_new"] } }, opts)).toMatch(/already in/);
    expect(checkSharedEdit(cur, { payerId: "p_new" }, opts)).toMatch(/already in/);
    expect(checkSharedEdit(cur, { split: { mode: "equal", participantIds: ["u_A", "p_friend"] } }, opts)).toMatch(/stay/);
    expect(checkSharedEdit(cur, { split: { mode: "personal", participantIds: ["u_A"] } }, opts)).toMatch(/someone else/);
    expect(checkSharedEdit(cur, {}, opts)).toMatch(/Nothing/);
    expect(checkSharedEdit({ ...cur, voided: true }, { merchant: "x" }, opts)).toMatch(/withdrawn/);
  });
  it("bumps the version, diffs for the log, and writes through to the owner's record with their own ids", () => {
    const next = applySharedPatch(cur, { merchant: "Dinner out", payerId: "u_B", split: { mode: "custom", participantIds: ["u_A", "u_B", "p_friend"], values: { u_A: 40000, u_B: 30000, p_friend: 20000 } } }, NOW);
    expect(next.version).toBe(2);
    expect(Object.keys(sharedDiff(cur, next)!.after).sort()).toEqual(["merchant", "payerId", "split"]);
    expect(sharedDiff(cur, applySharedPatch(cur, {}, NOW))).toBeNull(); // nothing changed, nothing to log
    const r = recordFromShared(rec({ amountPaise: 90000, split: cur.split }), next, ctx, { categoryId: "food", canEditBankFields: false });
    expect(r).toMatchObject({ merchant: "Dinner out", payerId: "p_c", split: { participantIds: ["u_A", "p_c", "p_friend"], values: { u_A: 40000, p_c: 30000, p_friend: 20000 } }, amountPaise: 90000, accountId: "acc_private", originalDescription: "SECRET BANK TEXT" });
    expect(recordFromShared(rec(), { ...next, amountPaise: 1, date: "2020-01-01" }, ctx, { categoryId: "food", canEditBankFields: false })).toMatchObject({ amountPaise: 100000, date: "2026-10-01" }); // bank fields stay
  });
});
