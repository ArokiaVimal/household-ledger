import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider, type LiveInit } from "@/data/store";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { ensureHouseholdReady, loadHouseholdData, participantIdFor, type HouseholdData } from "@/lib/data/load";
import { ProfileProvider } from "@/components/profile-context";
import { requireSession } from "@/lib/auth/session";
import { HouseholdProvider, type HouseholdStatus } from "@/components/household-context";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import type { Membership } from "@/lib/households/types";
import { getProfile } from "@/lib/profile/store";

/** Reads the session on every request, so it must stream inside <Suspense> (Cache Components). */
async function AuthedShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  await connection(); // the date below changes per request, so opt into request-time rendering (also in demo mode)
  let profile: Awaited<ReturnType<typeof getProfile>> | null = null;
  let status: "ok" | "off" | "error" = "off";
  if (session.mode === "on") {
    try {
      profile = await getProfile(session);
      status = "ok";
    } catch (e) {
      // Log the cause (no secrets) so a failing Firestore setup is diagnosable.
      console.error("profile load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
      status = "error";
    }
  }
  let membership: Membership | null = null;
  let hStatus: HouseholdStatus = "off";
  if (session.mode === "on") {
    try {
      membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
      hStatus = "ok";
    } catch (e) {
      console.error("household load failed:", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 200));
      hStatus = "error";
    }
  }
  // Real data for signed-in users. A signed-in user must never see the demo data, even when loading fails.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const empty: HouseholdData = { records: [], settlements: [], receipts: [], recurring: [], participants: [], accounts: [], categories: [], rules: [] };
  let live: LiveInit | undefined;
  let dataError = false;
  if (session.mode === "on") {
    if (hStatus === "error") dataError = true;
    if (!dataError && !membership) live = { data: empty, meId: "", today, ready: false, ownerId: "" };
    if (!dataError && membership) {
      try {
        const repo = createFirestoreRepository(membership.household.id);
        await ensureHouseholdReady(repo, membership.members);
        const data = await loadHouseholdData(repo);
        live = {
          data, today, ready: true,
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
                <h1 className="text-lg font-semibold">We couldn&apos;t load your household data</h1>
                <p className="mt-1 text-sm text-muted">The server could not reach the database. Nothing was lost. Reload to try again; if it keeps happening, check the server log.</p>
              </div>
            ) : children}
          </AppShell>
        </StoreProvider>
      </HouseholdProvider>
    </ProfileProvider>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
