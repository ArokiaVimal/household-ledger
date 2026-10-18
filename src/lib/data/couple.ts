// Server-side glue for the couple space: who the partner is, and the data both partners see.
import type { Repository } from "@/data/repository";
import { DEFAULT_RATIO_BPS, getCouple } from "@/lib/households/couple";
import type { CoupleMembership, HouseholdStore } from "@/lib/households/types";
import type { Participant, Settlement, SharedExpense } from "@/domain/types";
import type { CoupleContext } from "./actions";
import { ensureHouseholdReady, participantIdFor } from "./load";

/** What the screens need to show the couple side. Plain JSON. */
export interface CoupleData {
  /** False once unlinked: the shared history stays readable, nothing new can be shared. */
  active: boolean;
  endedAt?: string;
  partner: { uid: string; name: string; email: string; participantId: string };
  /** False until the couple chooses their usual split (the app then asks once). */
  ratioSet: boolean;
  /** Usual split: `leaderId` bears `leaderBps` (6400 = 64%), the partner the rest. */
  ratio: { leaderId: string; leaderBps: number };
  /** Shared expenses that still count (withdrawn ones are left out). */
  shared: SharedExpense[];
  settlements: Settlement[];
  participants: Participant[];
}

/** The signed-in user's couple context for write actions, or null when they never linked. */
export async function coupleContextFor(store: HouseholdStore, uid: string, repoFor: (householdId: string) => Repository): Promise<CoupleContext | null> {
  const c = await getCouple(store, uid);
  if (!c || !c.partner) return null;
  return { repo: repoFor(c.household.id), meId: participantIdFor(uid), partnerId: participantIdFor(c.partner.uid), active: c.active };
}

export async function loadCoupleData(repo: Repository, c: CoupleMembership): Promise<CoupleData | null> {
  if (!c.partner) return null;
  const [shared, settlements, found] = await Promise.all([repo.sharedExpenses.list(), repo.settlements.list(), repo.participants.list()]);
  let participants = found;
  if (!c.members.every((m) => found.some((p) => p.userId === m.uid))) {
    await ensureHouseholdReady(repo, c.members);
    participants = await repo.participants.list();
  }
  const ratio = c.household.splitRatio ?? { leaderUid: c.household.ownerUid, leaderBps: DEFAULT_RATIO_BPS };
  return {
    active: c.active, endedAt: c.household.endedAt,
    partner: { uid: c.partner.uid, name: c.partner.displayName || "Partner", email: c.partner.email, participantId: participantIdFor(c.partner.uid) },
    ratioSet: !!c.household.splitRatio,
    ratio: { leaderId: participantIdFor(ratio.leaderUid), leaderBps: ratio.leaderBps },
    shared: shared.filter((s) => !s.voided).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    settlements: settlements.sort((a, b) => a.date.localeCompare(b.date)),
    participants,
  };
}
