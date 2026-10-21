import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";

/** The profile photos (small JPEGs) of these accounts, by uid. Accounts without a photo are left out. */
export async function profilePhotos(uids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(uids)].slice(0, 100);
  if (unique.length === 0) return {};
  const db = getAdminDb();
  const snaps = await db.getAll(...unique.map((u) => db.collection("users").doc(u)));
  const out: Record<string, string> = {};
  for (const s of snaps) { const a = s.exists ? s.data()?.avatarDataUrl : null; if (typeof a === "string" && a.startsWith("data:image/jpeg;base64,")) out[s.id] = a; }
  return out;
}
