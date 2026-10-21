import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider, type LiveInit } from "@/data/store";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { profilePhotos } from "@/lib/profile/photos-server";
import { uidOf, withProfilePhotos } from "@/lib/profile/photos";
import { DEMO_PROFILE, demoLiveInit } from "@/lib/demo/data";
import { loadReadyHouseholdData, participantIdFor, type HouseholdData } from "@/lib/data/load";
import { loadCoupleData } from "@/lib/data/couple";
import { getCouple } from "@/lib/households/couple";
import type { PartnerInfo } from "@/components/household-context";
import { ProfileProvider } from "@/components/profile-context";
import { requireSession } from "@/lib/auth/session";
import { HouseholdProvider, type HouseholdStatus } from "@/components/household-context";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { firstRun, getMembership, pendingInvitesFor } from "@/lib/households/service";
import { serverDeps } from "@/lib/households/firestore-store";
import { defaultDisplayName } from "@/lib/profile/profile";
import type { CoupleMembership, InviteOffer, Membership } from "@/lib/households/types";
import { getProfile } from "@/lib/profile/store";
import { loadLinkData, upgradeLinks, type LinkData } from "@/lib/links/service";
import { createLinkDeps } from "@/lib/links/server";

/** Reads the session on every request, so it must stream inside <Suspense> (Cache Components). */
async function AuthedShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  await connection(); // the date below changes per request, so opt into request-time rendering (also in demo mode)
  let profile: Awaited<ReturnType<typeof getProfile>> | null = null;
  let status: "ok" | "off" | "error" = "off";
  let membership: Membership | null = null;
  let coupleMembership: CoupleMembership | null = null;
  let offers: InviteOffer[] = [];
  let hStatus: HouseholdStatus = "off";
  let linkData: LinkData = { proposals: [], links: [] };
  if (session.mode === "on") {
    // The profile and the membership do not depend on each other, so read them at the same time.
    const hStore = createFirestoreHouseholdStore();
    const [p, m] = await Promise.allSettled([getProfile(session), getMembership(hStore, session.uid)]);
    if (p.status === "fulfilled") { profile = p.value; status = "ok"; }
    else {
      // Log the cause (no secrets) so a failing Firestore setup is diagnosable.
      console.error("profile load failed:", (p.reason as { code?: string }).code, String((p.reason as Error).message).split("\n")[0].slice(0, 200));
      status = "error";
    }
    try {
      if (m.status === "rejected") throw m.reason;
      membership = m.value;
      if (!membership && session.email) {
        // Personal first: with no invitation waiting, a private space is created automatically.
        const name = profile?.displayName ?? defaultDisplayName(session.name, session.email);
        await firstRun(hStore, { uid: session.uid, email: session.email, name }, serverDeps);
        membership = await getMembership(hStore, session.uid);
      }
      // The partner link (if any) and any invitation waiting for this email. A problem here must not hide private data.
      try {
        coupleMembership = await getCouple(hStore, session.uid);
        if (!coupleMembership?.active && session.email) offers = await pendingInvitesFor(hStore, session.email, serverDeps);
      } catch (e) { console.error("partner load failed:", (e as { code?: string }).code); }
      // Friends & Family links: proposals waiting for the owner, and what linked people share. A problem here must not hide private data.
      if (membership) await upgradeLinks(createLinkDeps(), session.uid).catch((e) => console.error("link upgrade failed:", (e as { code?: string }).code));
      if (membership) linkData = await loadLinkData(createLinkDeps(), session.uid).catch((e) => { console.error("link load failed:", (e as { code?: string }).code); return linkData; });
      hStatus = "ok";
    } catch (e) {
      console.error("household load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
      hStatus = "error";
    }
  }

  // Real data for signed-in users. A signed-in user must never see the demo data, even when loading fails.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const empty: HouseholdData = { records: [], settlements: [], receipts: [], recurring: [], participants: [], accounts: [], categories: [], rules: [], importBatches: [], cardBills: [], voucherBrands: [], paymentGroups: [], splitGroups: [], splitSettlements: [], merchantIcons: {}, merchantLogos: {} };
  let live: LiveInit | undefined;
  let dataError = false;
  if (session.mode === "on") {
    if (hStatus === "error") dataError = true;
    if (!dataError && !membership) live = { data: empty, meId: "", today, ready: false };
    if (!dataError && membership) {
      try {
        const repo = createFirestoreRepository(membership.household.id);
        const [data, couple] = await Promise.all([
          loadReadyHouseholdData(repo, membership.members),
          // A problem with the couple side must not hide the person's own private data.
          Promise.resolve(coupleMembership)
            .then((c) => (c ? loadCoupleData(createFirestoreRepository(c.household.id), c) : null))
            .catch((e) => { console.error("couple load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200)); return null; }),
        ]);
        // People with their own account show their current profile photo (partner and linked friends too).
        const linkUid = Object.fromEntries(linkData.links.map((l) => [l.key, l.other.uid]));
        const everyone = [...data.participants, ...(couple?.participants ?? [])];
        const photos = await profilePhotos(everyone.flatMap((p) => { const u = uidOf(p, session.uid, linkUid); return u ? [u] : []; })).catch(() => ({}));
        data.participants = withProfilePhotos(data.participants, session.uid, linkUid, photos);
        if (couple) couple.participants = withProfilePhotos(couple.participants, session.uid, linkUid, photos);
        // What you call your partner (set under Settings > Friends & Family) shows instead of their account name everywhere.
        const partnerNick = profile?.partnerNickname?.trim();
        if (partnerNick && couple) {
          const pid = couple.partner.participantId;
          const named = <T extends { id: string }>(ps: T[]): T[] => ps.map((p) => (p.id === pid ? { ...p, nickname: partnerNick } : p));
          data.participants = named(data.participants);
          couple.participants = named(couple.participants);
        }
        live = {
          couple: couple ?? undefined,
          data, today, ready: true,
          aiEnabled: !!process.env.ANTHROPIC_API_KEY?.trim(),
          meId: data.participants.find((p) => p.userId === session.uid)?.id ?? participantIdFor(session.uid),
        };
      } catch (e) {
        console.error("data load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
        dataError = true;
      }
    }
    if (dataError) live = { data: empty, meId: "", today, ready: false };
  } else {
    // No sign-in configured: the demo, with fictional data on the real screens.
    live = demoLiveInit();
    profile = DEMO_PROFILE;
    status = "ok";
  }
  const partnerInfo: PartnerInfo | null = coupleMembership
    ? { active: coupleMembership.active, endedAt: coupleMembership.household.endedAt, partner: coupleMembership.partner ? { uid: coupleMembership.partner.uid, name: coupleMembership.partner.displayName || "Partner", email: coupleMembership.partner.email } : null, ratio: coupleMembership.household.splitRatio ?? null }
    : null;
  return (
    <ProfileProvider initial={profile} status={status}>
      <HouseholdProvider membership={membership} status={hStatus} uid={session.mode === "on" ? session.uid : null} partner={partnerInfo} offers={offers} myName={profile?.displayName ?? ""} linkData={linkData}>
        <StoreProvider live={live}>
          <AppShell user={session.mode === "on" ? { email: session.email ?? "" } : null}>
            {dataError ? (
              <div role="alert" className="rounded-[var(--radius-card)] bg-surface p-6">
                <h1 className="text-lg font-semibold">We couldn&apos;t load your data</h1>
                <p className="mt-1 text-sm text-muted">Can&apos;t reach the database. Nothing was lost. Reload to try again.</p>
              </div>
            ) : children}
          </AppShell>
        </StoreProvider>
      </HouseholdProvider>
    </ProfileProvider>
  );
}

/** Shown while the server reads the session and data: the page frame appears at once instead of a bare word. */
function ShellSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="h-8 w-40 animate-pulse rounded-full bg-border" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-border/70" />)}
      </div>
      <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-border/70" />
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
