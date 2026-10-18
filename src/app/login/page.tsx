import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthMode } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Household Ledger" };

/** Reads the session cookie, so it streams inside <Suspense> (Cache Components). */
async function LoginBody() {
  const mode = getAuthMode(process.env);
  if (mode === "on" && (await getSession())) redirect("/");
  if (mode === "on") return <LoginForm />;
  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-xl bg-warn-soft p-3 text-warn">Sign-in is not configured, so this is prototype mode with fictional data only.</p>
      <Link href="/" className="inline-block rounded-full bg-accent px-4 py-2 font-medium text-white">Open the prototype</Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Household Ledger</h1>
        <p className="mb-5 text-sm text-muted">Private. Sign in to continue.</p>
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}><LoginBody /></Suspense>
      </div>
    </main>
  );
}
