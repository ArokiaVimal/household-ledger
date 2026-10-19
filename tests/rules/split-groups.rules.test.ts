import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { OTHER, OWNER, SPOUSE, STRANGER, setup } from "./helpers";

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
    await setDoc(doc(db, "households/h1/splitGroups/g1"), { name: "Goa trip", kind: "trip", participantIds: ["a", "b"], createdAt: "2026-10-01" });
    await setDoc(doc(db, "households/h1/splitSettlements/p1"), { groupId: "g1", date: "2026-10-05", fromId: "a", toId: "b", amountPaise: 100 });
  });
});
const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("split groups (server-written, members read)", () => {
  it("members read groups and their payments; outsiders do not", async () => {
    for (const uid of [OWNER, SPOUSE]) {
      await assertSucceeds(getDoc(doc(as(uid), "households/h1/splitGroups/g1")));
      await assertSucceeds(getDoc(doc(as(uid), "households/h1/splitSettlements/p1")));
    }
    for (const db of [as(OTHER), as(STRANGER), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, "households/h1/splitGroups/g1")));
      await assertFails(getDoc(doc(db, "households/h1/splitSettlements/p1")));
    }
  });
  it("no client, not even a member, writes a group or a payment", async () => {
    for (const uid of [OWNER, SPOUSE]) {
      const db = as(uid);
      await assertFails(setDoc(doc(db, "households/h1/splitGroups/g2"), { name: "x", kind: "trip", participantIds: ["a", "b"], createdAt: "2026-10-01" }));
      await assertFails(updateDoc(doc(db, "households/h1/splitGroups/g1"), { name: "edited" }));
      await assertFails(deleteDoc(doc(db, "households/h1/splitGroups/g1")));
      await assertFails(setDoc(doc(db, "households/h1/splitSettlements/p2"), { groupId: "g1", date: "2026-10-05", fromId: "a", toId: "b", amountPaise: 1 }));
      await assertFails(updateDoc(doc(db, "households/h1/splitSettlements/p1"), { voided: true }));
      await assertFails(deleteDoc(doc(db, "households/h1/splitSettlements/p1")));
    }
  });
});
