import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Session } from "@/lib/auth/session";
import { syncDisplayName } from "./sync-name";
import { defaultDisplayName, type Profile, type ProfileInput } from "./profile";

// One document per user at users/{uid}. Written only by server code that has verified the session.
const doc = (uid: string) => getAdminDb().collection("users").doc(uid);

export async function getProfile(session: Session): Promise<Profile> {
  const email = session.email ?? "";
  const snap = await doc(session.uid).get();
  const d = snap.exists ? snap.data() ?? {} : {};
  return {
    email,
    displayName: typeof d.displayName === "string" && d.displayName ? d.displayName : defaultDisplayName(session.name, email),
    nickname: typeof d.nickname === "string" ? d.nickname : "",
    phone: typeof d.phone === "string" ? d.phone : "",
    defaultView: d.defaultView === "household" ? "household" : "personal", // personal first
    avatarDataUrl: typeof d.avatarDataUrl === "string" ? d.avatarDataUrl : null,
    providerPhotoUrl: session.picture,
    partnerNickname: typeof d.partnerNickname === "string" ? d.partnerNickname : "",
    dismissedRecurring: Array.isArray(d.dismissedRecurring) ? d.dismissedRecurring.filter((x: unknown): x is string => typeof x === "string").slice(0, 200) : [],
  };
}

/** `avatarDataUrl`: undefined keeps the current photo, null removes it, a string replaces it (already validated). */
export async function saveProfile(session: Session, input: ProfileInput, avatarDataUrl?: string | null): Promise<Profile> {
  const update: Record<string, unknown> = { ...input, updatedAt: new Date().toISOString() };
  if (avatarDataUrl !== undefined) update.avatarDataUrl = avatarDataUrl;
  await doc(session.uid).set(update, { merge: true });
  // Keep the household's copies of your name in step. A failure here must not lose the profile save.
  try { await syncDisplayName(session.uid, input.displayName); } catch (e) { console.error("name sync failed", (e as { code?: string }).code); }
  return getProfile(session);
}

/** What you call your partner, kept on your own account. An empty name removes it. */
export async function savePartnerNickname(session: Session, nickname: string): Promise<string> {
  const n = nickname.trim().slice(0, 30);
  await doc(session.uid).set({ partnerNickname: n || FieldValue.delete(), updatedAt: new Date().toISOString() }, { merge: true });
  return n;
}
