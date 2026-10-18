"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Membership } from "@/lib/households/types";

/** "off" = prototype mode, "error" = signed in but membership could not be loaded, "ok" with null = no household yet. */
export type HouseholdStatus = "ok" | "off" | "error";
const Ctx = createContext<{ membership: Membership | null; status: HouseholdStatus; uid: string | null }>({ membership: null, status: "off", uid: null });

export function HouseholdProvider({ membership, status, uid, children }: { membership: Membership | null; status: HouseholdStatus; uid: string | null; children: ReactNode }) {
  return <Ctx.Provider value={{ membership, status, uid }}>{children}</Ctx.Provider>;
}
export const useHousehold = () => useContext(Ctx);
