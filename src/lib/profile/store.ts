import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Session } from "@/lib/auth/session";
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
  };
}

/** `avatarDataUrl`: undefined keeps the current photo, null removes it, a string replaces it (already validated). */
export async function saveProfile(session: Session, input: ProfileInput, avatarDataUrl?: string | null): Promise<Profile> {
  const update: Record<string, unknown> = { ...input, updatedAt: new Date().toISOString() };
  if (avatarDataUrl !== undefined) update.avatarDataUrl = avatarDataUrl;
  await doc(session.uid).set(update, { merge: true });
  return getProfile(session);
}
