import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ContactLink, OwnerContacts } from "@/domain/links";
import type { Participant } from "@/domain/types";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { AccountDirectory, ContactIndex, LinkStore } from "./types";

const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

/** `contactLinks/{pairKey}` (server only) and the link spaces under `households/{id}` (kind "link", members read, nobody writes from a client). */
export function createFirestoreLinkStore(db: Firestore = getAdminDb()): LinkStore {
  const pairs = db.collection("contactLinks");
  const space = (id: string) => db.collection("households").doc(id);
  return {
    async getPair(key) { const s = await pairs.doc(key).get(); return s.exists ? ({ id: key, ...(s.data() as Omit<ContactLink, "id">) }) : null; },
    async listForUser(uid) { return (await pairs.where("uids", "array-contains", uid).get()).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ContactLink, "id">) })); },
    async putPair(link) { const { id, ...rest } = link; await pairs.doc(id).set(clean(rest)); },
    async deletePair(key) { await pairs.doc(key).delete(); },
    async createLinkSpace(h, members) {
      const batch = db.batch();
      batch.set(space(h.id), clean({ name: h.name, ownerUid: h.ownerUid, createdAt: h.createdAt, kind: "link" }));
      for (const m of members) batch.set(space(h.id).collection("members").doc(m.uid), { email: m.email, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt });
      await batch.commit();
    },
    async deleteLinkSpace(id) {
      for (const name of ["sharedExpenses", "settlements", "auditEvents", "members"]) await db.recursiveDelete(space(id).collection(name));
      await space(id).delete();
    },
  };
}

/**
 * Contacts live under each person's personal space, so the lookup is a collection-group query on `participants.email`
 * (needs the field override in firestore.indexes.json). Only personal spaces count: contacts in couple or link spaces are ignored.
 */
export function createFirestoreContactIndex(db: Firestore = getAdminDb()): ContactIndex {
  return {
    async findContactsByEmail(email) {
      const snap = await db.collectionGroup("participants").where("email", "==", email).get();
      const byHousehold = new Map<string, Participant[]>();
      for (const d of snap.docs) {
        const hid = d.ref.parent.parent?.id;
        if (!hid || d.ref.parent.parent?.parent.id !== "households") continue;
        byHousehold.set(hid, [...(byHousehold.get(hid) ?? []), { id: d.id, ...(d.data() as Omit<Participant, "id">) }]);
      }
      const out: OwnerContacts[] = [];
      for (const [hid, contacts] of byHousehold) {
        const h = (await db.collection("households").doc(hid).get()).data();
        if (!h || (h.kind && h.kind !== "personal") || typeof h.ownerUid !== "string") continue;
        out.push({ ownerUid: h.ownerUid, householdId: hid, contacts });
      }
      return out;
    },
  };
}

/** Firebase Auth is the only source for "verified". An unverified account is invisible to linking. */
export function createFirebaseAccountDirectory(): AccountDirectory {
  return {
    async findVerifiedByEmail(email) {
      try {
        const u = await getAdminAuth().getUserByEmail(email);
        if (!u.emailVerified || !u.email) return null;
        return { uid: u.uid, email: u.email.toLowerCase(), displayName: u.displayName ?? u.email.split("@")[0] };
      } catch (e) {
        if ((e as { code?: string }).code === "auth/user-not-found") return null;
        throw e;
      }
    },
  };
}
