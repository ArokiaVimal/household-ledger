import { describe, expect, it } from "vitest";
import { buildLinkShared, chooseContact, otherUid, pairKey, planLinkSettlement, planLinkShare, proposalsFor, type ContactLink, type LinkContext } from "./links";
import { pairBalances } from "./balances";
import { sharedToRecord } from "./sharing";
import type { ExpenseRecord, Participant, Settlement } from "./types";

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

describe("what a link mirrors", () => {
  it("shares a two-way split with exactly the pair's shares and payer", () => {
    const p = planLinkShare(rec(), ctx);
    expect(p).toEqual({ action: "share", copy: { payerId: "u_A", amountPaise: 100000, split: { mode: "custom", participantIds: ["u_B", "u_A"], values: { u_B: 50000, u_A: 50000 } } } });
  });
  it("maps the contact as payer to the linked account", () => {
    const p = planLinkShare(rec({ payerId: "p_c" }), ctx);
    expect(p).toMatchObject({ action: "share", copy: { payerId: "u_B" } });
  });
  it("never reveals other people in the split: only the pair's two shares travel", () => {
    const p = planLinkShare(rec({ amountPaise: 90000, split: { mode: "equal", participantIds: ["u_A", "p_c", "p_friend"] } }), ctx);
    if (p.action !== "share") throw new Error("expected share");
    expect(p.copy.amountPaise).toBe(60000); // the third person's 30000 is not part of the copy
    expect(JSON.stringify(p.copy)).not.toContain("p_friend");
    expect(Object.keys(p.copy.split.values ?? {}).sort()).toEqual(["u_A", "u_B"]);
  });
  it("copies no bank text, account, notes or import details", () => {
    const p = planLinkShare(rec(), ctx);
    if (p.action !== "share") throw new Error("expected share");
    const copy = buildLinkShared(rec(), p.copy, { ownerUid: "A", categoryName: "Food", now: "2026-10-19T00:00:00.000Z" });
    const text = JSON.stringify(copy);
    for (const secret of ["SECRET BANK TEXT", "acc_private", "private note", "HDFC.csv"]) expect(text).not.toContain(secret);
  });
  it("shares nothing that does not involve the contact, is private, unreviewed, excluded, not spending, or paid by someone else", () => {
    for (const r of [
      rec({ split: { mode: "equal", participantIds: ["u_A", "p_other"] } }),
      rec({ split: { mode: "personal", participantIds: ["u_A"] } }),
      rec({ status: "unreviewed" }), rec({ excluded: true }), rec({ kind: "income" }), rec({ kind: "transfer" }), rec({ kind: "cc_payment" }),
      rec({ payerId: "p_third", split: { mode: "equal", participantIds: ["u_A", "p_c", "p_third"] } }),
    ]) expect(planLinkShare(r, ctx).action).toBe("withdraw");
  });
  it("shares a refund as a refund and keeps balances exact to the paisa", () => {
    const records = [rec({ amountPaise: 100001 }), rec({ id: "r2", kind: "refund", amountPaise: 20001, payerId: "p_c" })];
    const copies = records.map((r) => { const p = planLinkShare(r, ctx); if (p.action !== "share") throw new Error(); return sharedToRecord(buildLinkShared(r, p.copy, { ownerUid: "A", categoryName: "Food", now: "2026-10-19T00:00:00.000Z" })); });
    const mine = pairBalances(records.map((r) => ({ ...r, split: r.split })), []).find((b) => [b.from, b.to].includes("p_c"))!;
    const theirs = pairBalances(copies, [])[0];
    expect(theirs.outstanding).toBe(mine.outstanding); // both people see the same amount owed
  });
  it("mirrors only settlements between exactly the owner and the contact, without notes", () => {
    const s: Settlement = { id: "s1", date: "2026-10-05", fromId: "p_c", toId: "u_A", amountPaise: 5000, note: "cash, private", recordIds: ["r1"] };
    expect(planLinkSettlement(s, ctx)).toEqual({ id: "s1", date: "2026-10-05", fromId: "u_B", toId: "u_A", amountPaise: 5000 });
    expect(planLinkSettlement({ ...s, voided: true }, ctx)).toMatchObject({ voided: true });
    expect(planLinkSettlement({ ...s, fromId: "p_other" }, ctx)).toBeNull();
    expect(planLinkSettlement({ ...s, toId: "p_other" }, ctx)).toBeNull();
  });
});
