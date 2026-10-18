import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider } from "@/data/store";
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
  return (
    <ProfileProvider initial={profile} status={status}>
      <HouseholdProvider membership={membership} status={hStatus} uid={session.mode === "on" ? session.uid : null}>
        <StoreProvider initialView={profile?.defaultView}>
          <AppShell user={session.mode === "on" ? { email: session.email ?? "" } : null}>{children}</AppShell>
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
