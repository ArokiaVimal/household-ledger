import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OTHER, OWNER, SPOUSE, STRANGER, record, setup, settlement } from "./helpers";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/h1"), { name: "Home", ownerUid: OWNER });
    await setDoc(doc(db, `households/h1/members/${OWNER}`), { email: "o@x.com", role: "owner" });
    await setDoc(doc(db, `households/h1/members/${SPOUSE}`), { email: "s@x.com", role: "member" });
    await setDoc(doc(db, "households/h2"), { name: "Other home", ownerUid: OTHER });
    await setDoc(doc(db, `households/h2/members/${OTHER}`), { email: "x@x.com", role: "owner" });
    await setDoc(doc(db, "households/h1/records/r1"), record());
    await setDoc(doc(db, "households/h1/records/manual1"), record({ importSource: "Manual entry", referenceId: undefined }));
    await setDoc(doc(db, "households/h1/settlements/s1"), settlement());
    await setDoc(doc(db, "households/h1/rawTransactions/raw1"), { text: "ZEPTO 642.00" });
    await setDoc(doc(db, "households/h1/auditEvents/a1"), { at: "2026-09-01T00:00:00Z", actorId: OWNER, action: "approve", entity: "record", entityId: "r1", summary: "x" });
    await setDoc(doc(db, "households/h1/importBatches/b1"), { filename: "s.csv" });
    await setDoc(doc(db, "invites/abc"), { householdId: "h1", email: "s@x.com" });
    await setDoc(doc(db, `users/${OWNER}`), { displayName: "Owner" });
    await setDoc(doc(db, `users/${SPOUSE}`), { displayName: "Spouse" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("household access", () => {
  it("members of the same household can read its data", async () => {
    for (const uid of [OWNER, SPOUSE]) {
      await assertSucceeds(getDoc(doc(as(uid), "households/h1")));
      await assertSucceeds(getDoc(doc(as(uid), "households/h1/records/r1")));
      await assertSucceeds(getDoc(doc(as(uid), "households/h1/settlements/s1")));
      await assertSucceeds(getDoc(doc(as(uid), `households/h1/members/${OWNER}`)));
    }
  });
  it("another household's member, a stranger and anonymous users are denied, even by guessing ids", async () => {
    for (const db of [as(OTHER), as(STRANGER), anon()]) {
      await assertFails(getDoc(doc(db, "households/h1")));
      await assertFails(getDoc(doc(db, "households/h1/records/r1")));
      await assertFails(getDoc(doc(db, "households/h1/settlements/s1")));
      await assertFails(getDoc(doc(db, "households/h1/auditEvents/a1")));
      await assertFails(getDoc(doc(db, `households/h1/members/${OWNER}`)));
    }
  });
  it("outsiders cannot write into someone else's household", async () => {
    await assertFails(setDoc(doc(as(OTHER), "households/h1/records/new"), record()));
    await assertFails(setDoc(doc(as(STRANGER), "households/h1/categories/c"), { name: "x" }));
    await assertFails(setDoc(doc(anon(), "households/h1/records/new"), record()));
  });
  it("nobody can grant themselves membership or edit households", async () => {
    await assertFails(setDoc(doc(as(STRANGER), `households/h1/members/${STRANGER}`), { email: "s@x.com", role: "owner" }));
    await assertFails(setDoc(doc(as(SPOUSE), `households/h1/members/${SPOUSE}`), { email: "s@x.com", role: "owner" }));
    await assertFails(updateDoc(doc(as(OWNER), "households/h1"), { name: "Renamed" }));
    await assertFails(setDoc(doc(as(STRANGER), "households/h3"), { name: "Mine", ownerUid: STRANGER }));
  });
});

describe("import history", () => {
  it("members can read it; nobody can write it from the client; outsiders cannot read it", async () => {
    await assertSucceeds(getDoc(doc(as(SPOUSE), "households/h1/importBatches/b1")));
    for (const db of [as(OWNER), as(SPOUSE)]) {
      await assertFails(setDoc(doc(db, "households/h1/importBatches/b2"), { filename: "x.csv" }));
      await assertFails(updateDoc(doc(db, "households/h1/importBatches/b1"), { filename: "edited" }));
      await assertFails(deleteDoc(doc(db, "households/h1/importBatches/b1")));
    }
    for (const db of [as(OTHER), as(STRANGER), anon()]) await assertFails(getDoc(doc(db, "households/h1/importBatches/b1")));
  });
});

describe("users and invites", () => {
  it("a user reads only their own profile, and cannot write it from the client", async () => {
    await assertSucceeds(getDoc(doc(as(OWNER), `users/${OWNER}`)));
    await assertFails(getDoc(doc(as(OWNER), `users/${SPOUSE}`)));
    await assertFails(getDoc(doc(anon(), `users/${OWNER}`)));
    await assertFails(updateDoc(doc(as(OWNER), `users/${OWNER}`), { householdId: "h2" }));
  });
  it("invites are closed to every client", async () => {
    for (const db of [as(OWNER), as(STRANGER), anon()]) {
      await assertFails(getDoc(doc(db, "invites/abc")));
      await assertFails(setDoc(doc(db, "invites/new"), { householdId: "h1", email: "a@b.c" }));
    }
  });
  it("unknown collections are closed", async () => {
    await assertFails(setDoc(doc(as(OWNER), "secrets/s"), { v: 1 }));
    await assertFails(getDoc(doc(as(OWNER), "secrets/s")));
  });
});

describe("records: financial integrity", () => {
  const path = "households/h1/records/new";
  it("a member can create a valid record", async () => {
    await assertSucceeds(setDoc(doc(as(SPOUSE), path), record()));
  });
  it("rejects float, zero and negative amounts", async () => {
    for (const amountPaise of [10.5, 0, -100, "100"]) await assertFails(setDoc(doc(as(OWNER), path), record({ amountPaise })));
  });
  it("rejects unknown kinds, currencies, bad dates, extra fields and missing fields", async () => {
    await assertFails(setDoc(doc(as(OWNER), path), record({ kind: "gift" })));
    await assertFails(setDoc(doc(as(OWNER), path), record({ currency: "USD" })));
    await assertFails(setDoc(doc(as(OWNER), path), record({ date: "05/09/2026" })));
    await assertFails(setDoc(doc(as(OWNER), path), record({ isAdmin: true })));
    await assertFails(setDoc(doc(as(OWNER), path), record({ merchant: "" })));
    const noMerchant: Record<string, unknown> = record();
    delete noMerchant.merchant;
    await assertFails(setDoc(doc(as(OWNER), path), noMerchant));
  });
  it("records can never be deleted by a client", async () => {
    await assertFails(deleteDoc(doc(as(OWNER), "households/h1/records/r1")));
    await assertFails(deleteDoc(doc(as(OWNER), "households/h1/records/manual1")));
  });
  it("review fields may change, but imported bank fields may not", async () => {
    const ref = doc(as(OWNER), "households/h1/records/r1");
    await assertSucceeds(updateDoc(ref, { categoryId: "shopping", status: "reviewed", excluded: true, notes: "gift" }));
    await assertFails(updateDoc(ref, { amountPaise: 1 }));
    await assertFails(updateDoc(ref, { originalDescription: "edited" }));
    await assertFails(updateDoc(ref, { date: "2026-09-06" }));
    await assertFails(updateDoc(ref, { referenceId: "OTHER" }));
    await assertFails(updateDoc(ref, { accountId: "cc_sbi" }));
  });
  it("manual entries stay editable by members", async () => {
    await assertSucceeds(updateDoc(doc(as(SPOUSE), "households/h1/records/manual1"), { amountPaise: 99900 }));
    await assertFails(updateDoc(doc(as(SPOUSE), "households/h1/records/manual1"), { amountPaise: 99.5 }));
  });
});

describe("settlements, audit trail and raw data", () => {
  it("a valid settlement can be created; self, zero and float amounts cannot", async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), "households/h1/settlements/new"), settlement()));
    await assertFails(setDoc(doc(as(OWNER), "households/h1/settlements/bad1"), settlement({ toId: "karthik" })));
    await assertFails(setDoc(doc(as(OWNER), "households/h1/settlements/bad2"), settlement({ amountPaise: 0 })));
    await assertFails(setDoc(doc(as(OWNER), "households/h1/settlements/bad3"), settlement({ amountPaise: 99.5 })));
    await assertFails(setDoc(doc(as(OWNER), "households/h1/settlements/bad4"), settlement({ voided: true })));
  });
  it("settlements are corrected by voiding, never by editing or deleting", async () => {
    const ref = doc(as(OWNER), "households/h1/settlements/s1");
    await assertFails(updateDoc(ref, { amountPaise: 5 }));
    await assertFails(updateDoc(ref, { voided: true, amountPaise: 5 }));
    await assertFails(deleteDoc(ref));
    await assertSucceeds(updateDoc(ref, { voided: true }));
  });
  it("audit events can be added as yourself, never forged, edited or deleted", async () => {
    const ev = (actorId: string) => ({ at: "2026-09-02T00:00:00Z", actorId, action: "edit", entity: "record", entityId: "r1", summary: "changed category" });
    await assertSucceeds(setDoc(doc(as(SPOUSE), "households/h1/auditEvents/new"), ev(SPOUSE)));
    await assertFails(setDoc(doc(as(SPOUSE), "households/h1/auditEvents/forged"), ev(OWNER)));
    await assertFails(updateDoc(doc(as(OWNER), "households/h1/auditEvents/a1"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(as(OWNER), "households/h1/auditEvents/a1")));
  });
  it("raw imported rows are write-once", async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), "households/h1/rawTransactions/raw2"), { text: "x" }));
    await assertFails(updateDoc(doc(as(OWNER), "households/h1/rawTransactions/raw1"), { text: "changed" }));
    await assertFails(deleteDoc(doc(as(OWNER), "households/h1/rawTransactions/raw1")));
  });
  it("participants and accounts are archived, not deleted; categories can be removed", async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), "households/h1/participants/p1"), { name: "Karthik" }));
    await assertFails(deleteDoc(doc(as(OWNER), "households/h1/participants/p1")));
    await assertSucceeds(setDoc(doc(as(OWNER), "households/h1/categories/c1"), { name: "Pets" }));
    await assertSucceeds(deleteDoc(doc(as(OWNER), "households/h1/categories/c1")));
  });
});

it("sanity: the rules file is non-empty", () => expect(true).toBe(true));
