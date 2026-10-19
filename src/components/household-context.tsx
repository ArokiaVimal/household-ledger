"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { InviteOffer, Membership } from "@/lib/households/types";
import type { LinkData } from "@/lib/links/service";

/** "off" = prototype mode, "error" = signed in but membership could not be loaded, "ok" with null = no household yet. */
export type HouseholdStatus = "ok" | "off" | "error";

/** The signed-in person's partner link, as far as the browser needs to know. */
export interface PartnerInfo {
  /** Linked right now. False after unlinking (history stays). */
  active: boolean;
  endedAt?: string;
  partner: { uid: string; name: string; email: string } | null;
  /** The usual split; null until the couple chooses. */
  ratio: { leaderUid: string; leaderBps: number } | null;
}
const NO_LINKS: LinkData = { proposals: [], links: [] };
interface Value { membership: Membership | null; status: HouseholdStatus; uid: string | null; partner: PartnerInfo | null; offers: InviteOffer[]; myName: string; linkData: LinkData }
const Ctx = createContext<Value>({ membership: null, status: "off", uid: null, partner: null, offers: [], myName: "", linkData: NO_LINKS });

export function HouseholdProvider({ membership, status, uid, partner = null, offers = [], myName = "", linkData = NO_LINKS, children }: { membership: Membership | null; status: HouseholdStatus; uid: string | null; partner?: PartnerInfo | null; offers?: InviteOffer[]; myName?: string; linkData?: LinkData; children: ReactNode }) {
  return <Ctx.Provider value={{ membership, status, uid, partner, offers, myName, linkData }}>{children}</Ctx.Provider>;
}
export const useHousehold = () => useContext(Ctx);
