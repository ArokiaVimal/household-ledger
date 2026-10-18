import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider, type LiveInit } from "@/data/store";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { loadReadyHouseholdData, participantIdFor, type HouseholdData } from "@/lib/data/load";
import { ProfileProvider } from "@/components/profile-context";
import { requireSession } from "@/lib/auth/session";
import { HouseholdProvider, type HouseholdStatus } from "@/components/household-context";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { firstRun, getMembership } from "@/lib/households/service";
import { Invitation } from "@/components/invitation";
import { serverDeps } from "@/lib/households/firestore-store";
import { defaultDisplayName, firstName } from "@/lib/profile/profile";
import type { InviteOffer, Membership } from "@/lib/households/types";
import { getProfile } from "@/lib/profile/store";

/** Reads the session on every request, so it must stream inside <Suspense> (Cache Components). */
async function AuthedShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  await connection(); // the date below changes per request, so opt into request-time rendering (also in demo mode)
  let profile: Awaited<ReturnType<typeof getProfile>> | null = null;
  let status: "ok" | "off" | "error" = "off";
  let membership: Membership | null = null;
  let invited: { offers: InviteOffer[]; firstName: string } | null = null;
  let hStatus: HouseholdStatus = "off";
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
        const first = await firstRun(hStore, { uid: session.uid, email: session.email, name }, serverDeps);
        if (first.kind === "invited") invited = { offers: first.offers, firstName: firstName(name) };
        else membership = await getMembership(hStore, session.uid);
      }
      hStatus = "ok";
    } catch (e) {
      console.error("household load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
      hStatus = "error";
    }
  }
  if (invited) return <Invitation offers={invited.offers} firstName={invited.firstName} />;

  // Real data for signed-in users. A signed-in user must never see the demo data, even when loading fails.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const empty: HouseholdData = { records: [], settlements: [], receipts: [], recurring: [], participants: [], accounts: [], categories: [], rules: [], importBatches: [] };
  let live: LiveInit | undefined;
  let dataError = false;
  if (session.mode === "on") {
    if (hStatus === "error") dataError = true;
    if (!dataError && !membership) live = { data: empty, meId: "", today, ready: false, ownerId: "" };
    if (!dataError && membership) {
      try {
        const repo = createFirestoreRepository(membership.household.id);
        const data = await loadReadyHouseholdData(repo, membership.members);
        live = {
          data, today, ready: true,
          aiEnabled: !!process.env.ANTHROPIC_API_KEY?.trim(),
          meId: data.participants.find((p) => p.userId === session.uid)?.id ?? participantIdFor(session.uid),
          ownerId: data.participants.find((p) => p.userId === membership.household.ownerUid)?.id ?? participantIdFor(membership.household.ownerUid),
        };
      } catch (e) {
        console.error("data load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
        dataError = true;
      }
    }
    if (dataError) live = { data: empty, meId: "", today, ready: false, ownerId: "" };
  }
  return (
    <ProfileProvider initial={profile} status={status}>
      <HouseholdProvider membership={membership} status={hStatus} uid={session.mode === "on" ? session.uid : null}>
        <StoreProvider initialView={profile?.defaultView} live={live}>
          <AppShell user={session.mode === "on" ? { email: session.email ?? "" } : null}>
            {dataError ? (
              <div role="alert" className="rounded-[var(--radius-card)] bg-surface p-6">
                <h1 className="text-lg font-semibold">We couldn&apos;t load your data</h1>
                <p className="mt-1 text-sm text-muted">The server could not reach the database. Nothing was lost. Reload to try again; if it keeps happening, check the server log.</p>
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
