import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Your name is shown from three places (profile, household member list, and the person entry that splits and "paid by" use).
 * Saving a profile name updates all three so it never reads differently in different screens.
 */
export async function syncDisplayName(uid: string, name: string): Promise<void> {
  const db = getAdminDb();
  const hid = (await db.collection("users").doc(uid).get()).data()?.householdId;
  if (typeof hid !== "string") return;
  const household = db.collection("households").doc(hid);
  const [member, people] = await Promise.all([household.collection("members").doc(uid).get(), household.collection("participants").where("userId", "==", uid).get()]);
  const batch = db.batch();
  if (member.exists) batch.update(member.ref, { displayName: name });
  people.forEach((p) => batch.update(p.ref, { name }));
  await batch.commit();
}
