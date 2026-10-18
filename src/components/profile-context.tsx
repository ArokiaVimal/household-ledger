"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Profile } from "@/lib/profile/profile";

/** "off" = prototype mode (no sign-in). "error" = signed in but the profile could not be loaded. */
export type ProfileStatus = "ok" | "off" | "error";
interface Ctx { profile: Profile | null; status: ProfileStatus; setProfile: (p: Profile) => void }
const ProfileCtx = createContext<Ctx>({ profile: null, status: "off", setProfile: () => {} });

/** Holds the signed-in user's profile so the header and greeting update the moment it is saved. */
export function ProfileProvider({ initial, status, children }: { initial: Profile | null; status: ProfileStatus; children: ReactNode }) {
  const [profile, setProfile] = useState(initial);
  return <ProfileCtx.Provider value={{ profile, status, setProfile }}>{children}</ProfileCtx.Provider>;
}

export const useProfile = () => useContext(ProfileCtx);
