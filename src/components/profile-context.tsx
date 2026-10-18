"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Profile } from "@/lib/profile/profile";

interface Ctx { profile: Profile | null; setProfile: (p: Profile) => void }
const ProfileCtx = createContext<Ctx>({ profile: null, setProfile: () => {} });

/** Holds the signed-in user's profile so the header and greeting update the moment it is saved. */
export function ProfileProvider({ initial, children }: { initial: Profile | null; children: ReactNode }) {
  const [profile, setProfile] = useState(initial);
  return <ProfileCtx.Provider value={{ profile, setProfile }}>{children}</ProfileCtx.Provider>;
}

export const useProfile = () => useContext(ProfileCtx);
