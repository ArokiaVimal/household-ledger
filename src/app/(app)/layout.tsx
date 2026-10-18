import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider } from "@/data/store";
import { ProfileProvider } from "@/components/profile-context";
import { requireSession } from "@/lib/auth/session";
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
  return (
    <ProfileProvider initial={profile} status={status}>
      <StoreProvider initialView={profile?.defaultView}>
        <AppShell user={session.mode === "on" ? { email: session.email ?? "" } : null}>{children}</AppShell>
      </StoreProvider>
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
