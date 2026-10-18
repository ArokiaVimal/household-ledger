import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Deps } from "./service";
import { HouseholdError, type Household, type HouseholdStore, type Invite, type Member } from "./types";

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
    async getUserCoupleId(uid) {
      const d = (await user(uid).get()).data();
      return typeof d?.coupleId === "string" ? d.coupleId : null;
    },
    async createCoupleFromInvite(hash, usedAt, couple, pair) {
      return db.runTransaction(async (tx) => {
        const inv = db.collection("invites").doc(hash);
        const [invSnap, ...userSnaps] = await Promise.all([tx.get(inv), ...pair.map((m) => tx.get(user(m.uid)))]);
        if (!invSnap.exists || invSnap.data()?.usedAt) return false;
        for (const u of userSnaps) {
          const cid = u.data()?.coupleId;
          if (typeof cid === "string" && !(await tx.get(db.collection("households").doc(cid))).data()?.endedAt) return false;
        }
        const { id, ...body } = couple;
        tx.update(inv, { usedAt });
        tx.set(db.collection("households").doc(id), JSON.parse(JSON.stringify(body)));
        for (const m of pair) {
          tx.set(members(id).doc(m.uid), { email: m.email, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt });
          tx.set(user(m.uid), { coupleId: id }, { merge: true });
        }
        return true;
      });
    },
    async updateHousehold(id, patch) {
      await db.collection("households").doc(id).set(JSON.parse(JSON.stringify(patch)), { merge: true });
    },
    async listMembers(hid) {
      return (await members(hid).get()).docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, "uid">) }));
    },
    async createHousehold(h, owner) {
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(user(owner.uid));
        if (typeof cur.data()?.householdId === "string") throw new HouseholdError("conflict", "You already belong to a household.");
        tx.set(db.collection("households").doc(h.id), { name: h.name, ownerUid: h.ownerUid, createdAt: h.createdAt });
        tx.set(members(h.id).doc(owner.uid), { email: owner.email, displayName: owner.displayName, role: owner.role, joinedAt: owner.joinedAt });
        tx.set(user(owner.uid), { householdId: h.id }, { merge: true });
      });
    },
    async listInvites(hid) {
      return (await db.collection("invites").where("householdId", "==", hid).get()).docs.map((d) => ({ hash: d.id, ...(d.data() as Omit<Invite, "hash">) }));
    },
    async findInvitesByEmail(email) {
      return (await db.collection("invites").where("email", "==", email).get()).docs.map((d) => ({ hash: d.id, ...(d.data() as Omit<Invite, "hash">) }));
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
    async deleteHousehold(hid) {
      const batch = db.batch();
      for (const m of (await members(hid).get()).docs) { batch.delete(m.ref); batch.set(user(m.id), { householdId: FieldValue.delete() }, { merge: true }); }
      for (const i of (await db.collection("invites").where("householdId", "==", hid).get()).docs) batch.delete(i.ref);
      batch.delete(db.collection("households").doc(hid));
      await batch.commit();
    },
    async removeMember(hid, uid) {
      const batch = db.batch();
      batch.delete(members(hid).doc(uid));
      batch.set(user(uid), { householdId: FieldValue.delete() }, { merge: true });
      await batch.commit();
    },
  };
}
