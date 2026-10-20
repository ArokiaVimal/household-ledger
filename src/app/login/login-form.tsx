"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleAuthProvider, getRedirectResult, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input } from "@/components/ui";
import { getClientAuth } from "@/lib/firebase/client";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  /** Exchange the fresh ID token for the httpOnly session cookie, then drop the client-side login. */
  const finish = async (user: User) => {
    const auth = getClientAuth();
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await user.getIdToken() }) });
    await signOut(auth); // the session cookie is the only credential we keep
    if (!res.ok) throw new Error("session");
    router.replace("/");
    router.refresh();
  };

  const fail = (e: unknown) => {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return setError(null);
    setError(
      code === "auth/too-many-requests" ? "Too many attempts. Wait a few minutes and try again."
        : "Sign-in failed. Check your account and try again.",
    );
  };

  // Safari only allows a pop-up that opens straight from a tap. If Firebase is still starting up when you tap, the pop-up opens
  // a moment late and Safari blocks it. So start it now, and finish a sign-in that came back from a full-page redirect.
  useEffect(() => {
    const auth = getClientAuth();
    void auth.authStateReady().catch(() => {});
    getRedirectResult(auth).then((cred) => { if (cred?.user) { setBusy(true); return finish(cred.user); } }).catch(fail).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(getClientAuth(), v.email, v.password);
      await finish(cred.user);
    } catch (e) { fail(e); }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const auth = getClientAuth();
      try {
        const cred = await signInWithPopup(auth, provider);
        await finish(cred.user);
      } catch (e) {
        // The browser would not open the pop-up: sign in on a full page instead (it comes back here and finishes above).
        const code = (e as { code?: string }).code;
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") { await signInWithRedirect(auth, provider); return; }
        throw e;
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
    <Button type="button" onClick={google} disabled={busy || isSubmitting} className="min-h-11 w-full text-[15px] shadow-sm">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
      {busy ? "Opening Google…" : "Continue with Google"}
    </Button>
    <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or use your email<span className="h-px flex-1 bg-border" /></div>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" inputMode="email" {...register("email")} /></Field>
      <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register("password")} /></Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting || busy} className="min-h-11 w-full text-[15px]">{isSubmitting ? "Signing in…" : "Sign in"}</Button>
    </form>
    </div>
  );
}
