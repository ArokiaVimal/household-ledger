import type { Participant } from "@/domain/types";

/**
 * People who have their own account show THEIR profile photo, so when they change it, it changes everywhere you see them.
 * That covers household members, your partner and friends you are linked to. A friend with no account keeps the photo you picked
 * for them. Pure: `photoByUid` and `linkUid` come from the server.
 */
export function uidOf(p: Participant, meUid: string, linkUid: Record<string, string>): string | null {
  const uid = p.userId ?? (p.linkId ? linkUid[p.linkId] : undefined) ?? null;
  return uid && uid !== meUid ? uid : null;
}

export function withProfilePhotos<T extends Participant>(people: T[], meUid: string, linkUid: Record<string, string>, photoByUid: Record<string, string>): T[] {
  return people.map((p) => {
    const uid = uidOf(p, meUid, linkUid);
    const photo = uid ? photoByUid[uid] : undefined;
    return photo ? { ...p, photo } : p;
  });
}
