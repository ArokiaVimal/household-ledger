import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Deps } from "./service";
import type { Household, HouseholdStore, Invite, Member } from "./types";

/** Production dependencies for the service: real clock, CSPRNG and SHA-256. */
export const serverDeps: Deps = {
  now: () => Date.now(),
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  hash: (code) => createHash("sha256").update(code).digest("hex"),
  newId: () => randomUUID(),
};

/**
 * Layout: households/{id}, households/{id}/members/{uid}, invites/{sha256(code)}, users/{uid}.householdId.
 * Admin SDK bypasses rules, so every caller must have verified the session and authorised via the service.
 */
export function createFirestoreHouseholdStore(): HouseholdStore {
  const db = getAdminDb();
  const members = (hid: string) => db.collection("households").doc(hid).collection("members");
  const user = (uid: string) => db.collection("users").doc(uid);
  return {
    async getUserHouseholdId(uid) {
      const d = (await user(uid).get()).data();
      return typeof d?.householdId === "string" ? d.householdId : null;
    },
    async getHousehold(id) {
      const s = await db.collection("households").doc(id).get();
      return s.exists ? ({ id, ...(s.data() as Omit<Household, "id">) }) : null;
    },
    async listMembers(hid) {
      return (await members(hid).get()).docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, "uid">) }));
    },
    async createHousehold(h, owner) {
      const batch = db.batch();
      batch.set(db.collection("households").doc(h.id), { name: h.name, ownerUid: h.ownerUid, createdAt: h.createdAt });
      batch.set(members(h.id).doc(owner.uid), { email: owner.email, displayName: owner.displayName, role: owner.role, joinedAt: owner.joinedAt });
      batch.set(user(owner.uid), { householdId: h.id }, { merge: true });
      await batch.commit();
    },
    async listInvites(hid) {
      return (await db.collection("invites").where("householdId", "==", hid).get()).docs.map((d) => ({ hash: d.id, ...(d.data() as Omit<Invite, "hash">) }));
    },
    async getInvite(hash) {
      const s = await db.collection("invites").doc(hash).get();
      return s.exists ? ({ hash, ...(s.data() as Omit<Invite, "hash">) }) : null;
    },
    async putInvite(i) {
      const { hash, ...rest } = i;
      await db.collection("invites").doc(hash).set(rest);
    },
    async deleteInvite(hash) { await db.collection("invites").doc(hash).delete(); },
    async acceptInvite(hash, member, usedAt) {
      return db.runTransaction(async (tx) => {
        const ref = db.collection("invites").doc(hash);
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()?.usedAt) return false;
        const hid = snap.data()!.householdId as string;
        tx.update(ref, { usedAt });
        tx.set(members(hid).doc(member.uid), { email: member.email, displayName: member.displayName, role: member.role, joinedAt: member.joinedAt });
        tx.set(user(member.uid), { householdId: hid }, { merge: true });
        return true;
      });
    },
    async removeMember(hid, uid) {
      const batch = db.batch();
      batch.delete(members(hid).doc(uid));
      batch.set(user(uid), { householdId: FieldValue.delete() }, { merge: true });
      await batch.commit();
    },
  };
}
