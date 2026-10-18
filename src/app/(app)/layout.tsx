import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StoreProvider } from "@/data/store";
import { requireSession } from "@/lib/auth/session";

/** Reads the session on every request, so it must stream inside <Suspense> (Cache Components). */
async function AuthedShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <StoreProvider>
      <AppShell user={session.mode === "on" ? { email: session.email ?? "" } : null}>{children}</AppShell>
    </StoreProvider>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
