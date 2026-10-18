import { initials } from "@/lib/profile/profile";
import type { Profile } from "@/lib/profile/profile";

/** Custom photo, else provider photo, else initials. Decorative: the name is shown next to it. */
export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, "displayName" | "email" | "avatarDataUrl" | "providerPhotoUrl"> | null; size?: number }) {
  const src = profile?.avatarDataUrl ?? profile?.providerPhotoUrl ?? null;
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return <span aria-hidden style={{ ...style, fontSize: size * 0.4 }} className="grid shrink-0 place-items-center rounded-full bg-accent font-medium text-white">{profile ? initials(profile.displayName, profile.email) : "V"}</span>;
}
