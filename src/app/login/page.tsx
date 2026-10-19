import { Handshake, FileUp, ShieldCheck, SplitSquareHorizontal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { getAuthMode } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Personal Finance App" };

const points = [
  { icon: FileUp, title: "Bring in every statement", text: "Cards, UPI and bank accounts in one place, reviewed before they count." },
  { icon: SplitSquareHorizontal, title: "Split down to the paisa", text: "Equal, percentage or custom, with friends who never need an account." },
  { icon: Handshake, title: "Settle without confusion", text: "See who owes whom, record payments, keep a clear history." },
];

/** Reads the session cookie, so it streams inside <Suspense> (Cache Components). */
async function LoginBody() {
  const mode = getAuthMode(process.env);
  if (mode === "on" && (await getSession())) redirect("/");
  if (mode === "on") return <LoginForm />;
  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-xl bg-warn-soft p-3 text-warn">Sign-in is not configured, so this is prototype mode with fictional data only.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-medium text-white">Open the prototype</Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-3 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] bg-background shadow-[0_24px_80px_-24px_rgba(58,35,153,0.45)] md:min-h-[34rem] md:grid-cols-[1.05fr_1fr] md:rounded-[32px]">
        {/* Brand panel */}
        <section aria-label="About" className="relative isolate overflow-hidden bg-gradient-to-br from-[#6d52e0] to-[#3a2399] p-7 text-white sm:p-10">
          <span aria-hidden className="absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -bottom-28 -left-16 -z-10 size-72 rounded-full bg-white/10" />
          <span aria-hidden className="absolute bottom-10 right-8 -z-10 size-28 rounded-full bg-[#d9d3f5]/20" />
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <span className="text-lg font-semibold tracking-tight">Personal Finance App</span>
          </div>
          <h1 className="mt-8 max-w-sm text-2xl font-semibold leading-tight tracking-tight sm:text-3xl md:mt-14">Where your money went, and who owes what.</h1>
          <ul className="mt-8 hidden space-y-5 md:block">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15"><Icon size={18} /></span>
                <div><div className="font-medium">{title}</div><div className="text-sm text-white/75">{text}</div></div>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in */}
        <section aria-label="Sign in" className="flex flex-col justify-center p-7 sm:p-10">
          <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Sign in to your finances.</p>
          <Suspense fallback={<div role="status" className="space-y-3" aria-label="Loading sign-in"><div className="h-11 animate-pulse rounded-full bg-border" /><div className="h-11 animate-pulse rounded-full bg-border" /></div>}>
            <LoginBody />
          </Suspense>
          <p className="mt-6 flex items-start gap-2 text-xs text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />Private to you. You choose what to share, and only with people you invite.</p>
        </section>
      </div>
    </main>
  );
}
