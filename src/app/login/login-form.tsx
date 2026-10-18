"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input } from "@/components/ui";
import { getClientAuth } from "@/lib/firebase/client";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const auth = getClientAuth();
      const cred = await signInWithEmailAndPassword(auth, v.email, v.password);
      const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await cred.user.getIdToken() }) });
      await signOut(auth); // the httpOnly session cookie is the only credential we keep
      if (!res.ok) throw new Error("session");
      router.replace("/");
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === "auth/too-many-requests" ? "Too many attempts. Wait a few minutes and try again." : "Sign-in failed. Check your email and password.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" inputMode="email" {...register("email")} /></Field>
      <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register("password")} /></Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">{isSubmitting ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
