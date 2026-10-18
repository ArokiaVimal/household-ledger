"use client";
import { CheckCircle2, FileUp, PlusCircle, Tags, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useProfile } from "@/components/profile-context";
import { LogoMark } from "@/components/logo";
import { MerchantAvatar } from "@/components/txn-row";
import { Button } from "@/components/ui";
import { useStore } from "@/data/store";
import { greetingName } from "@/lib/profile/profile";
import { cn } from "@/lib/cn";

/** Lets other parts of the app (this screen) open the Add Transaction form that lives in the app shell. */
export const OPEN_ADD_EVENT = "pf:add-transaction";
const openAdd = () => window.dispatchEvent(new Event(OPEN_ADD_EVENT));

function Step({ n, done, active, optional, icon, title, children }: { n: number; done: boolean; active: boolean; optional?: boolean; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className={cn("flex gap-4 rounded-[var(--radius-card)] bg-surface p-4 sm:p-5", active && "ring-2 ring-accent/60")}>
      <div className="flex flex-col items-center">
        {done
          ? <CheckCircle2 className="size-9 text-good" aria-label="Done" />
          : <span aria-hidden className={cn("grid size-9 place-items-center rounded-full text-sm font-semibold", active ? "bg-accent text-white" : "bg-background text-muted")}>{n}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-accent">{icon}</span>
          <h3 className="font-semibold">{title}</h3>
          {optional && <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">Optional</span>}
          {done && <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">Done</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

/** First-run guide for a new person. Personal tracking comes first; sharing with a partner and friends is optional and later. */
export function Onboarding() {
  const { accounts, records, staged, categories, participants, meId, addSuggestedAccounts } = useStore();
  const { profile } = useProfile();
  const name = profile ? greetingName(profile) : "there";
  const hasMethods = accounts.length > 0;
  const hasSpending = records.length + staged.length > 0;
  const partner = participants.find((p) => p.id !== meId && p.userId);
  const friends = participants.filter((p) => p.id !== meId && !p.userId);
  const essentials = [hasMethods, hasSpending];
  const doneCount = essentials.filter(Boolean).length;
  const activeStep = !hasMethods ? 1 : !hasSpending ? 2 : 0;

  return (
    <div className="space-y-5">
      <section className="relative isolate overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#6d52e0] to-[#3a2399] p-6 text-white sm:p-8">
        <span aria-hidden className="absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-20 right-24 -z-10 size-44 rounded-full bg-white/10" />
        <div className="flex items-center gap-4">
          <LogoMark size={52} />
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome, {name}</h2>
            <p className="text-white/80">Let&apos;s set up your own finance tracker. It takes about two minutes.</p>
          </div>
        </div>
        <div className="mt-6 max-w-md" role="group" aria-label={`Setup progress: ${doneCount} of ${essentials.length} essential steps done`}>
          <div className="mb-1.5 flex justify-between text-xs text-white/80"><span>Your setup</span><span>{doneCount} of {essentials.length} essentials</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${(doneCount / essentials.length) * 100}%` }} /></div>
        </div>
      </section>

      <ol className="space-y-3">
        <Step n={1} done={hasMethods} active={activeStep === 1} icon={<PlusCircle size={18} />} title="Add your payment methods">
          <p className="text-sm text-muted">The cards, UPI apps and bank accounts you spend from, so every transaction knows where it came from.</p>
          {hasMethods && <div className="flex flex-wrap gap-1.5">{accounts.map((a) => <span key={a.id} title={a.name} className="rounded-full ring-1 ring-border"><MerchantAvatar name={a.name} size={32} /></span>)}</div>}
          <div className="flex flex-wrap items-center gap-2">
            {!hasMethods && <Button variant="primary" onClick={addSuggestedAccounts}>Add my usual cards, UPI apps and banks</Button>}
            <Link href="/settings" className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:bg-background">{hasMethods ? "Manage payment methods" : "Add my own instead"}</Link>
          </div>
        </Step>

        <Step n={2} done={hasSpending} active={activeStep === 2} icon={<FileUp size={18} />} title="Add your spending">
          <p className="text-sm text-muted">Type a transaction in a few taps, or import a bank statement. Imported rows wait in a review queue until you approve them.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={hasMethods ? "primary" : "ghost"} onClick={openAdd}><PlusCircle size={16} aria-hidden />Add a transaction</Button>
            <Link href="/import" className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:bg-background">Import a statement</Link>
          </div>
        </Step>

        <Step n={3} done={false} active={false} optional icon={<Tags size={18} />} title="Make the categories yours">
          <p className="text-sm text-muted">{categories.length} categories are ready (Groceries, Fuel, Rent and more). Rename them, add your own, or set merchant rules that categorise automatically.</p>
          <Link href="/categories" className="inline-block rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:bg-background">Open categories</Link>
        </Step>
      </ol>

      <section aria-label="When you are ready" className="space-y-3">
        <h3 className="px-1 text-sm font-medium text-muted">When you&apos;re ready</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-[var(--radius-card)] bg-surface p-4">
            <div className="flex items-center gap-2 font-semibold"><span aria-hidden className="text-accent"><Users size={18} /></span>Split with your partner</div>
            <p className="text-sm text-muted">{partner ? `You are sharing with ${partner.name}. Mark an expense as shared and choose a split like 64 / 36 or 50 / 50.` : "Invite your partner by email. Your own tracking stays yours; only what you split is shared."}</p>
            <Link href="/settings" className="inline-block rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:bg-background">{partner ? "Sharing settings" : "Invite your partner"}</Link>
          </div>
          <div className="space-y-2 rounded-[var(--radius-card)] bg-surface p-4">
            <div className="flex items-center gap-2 font-semibold"><span aria-hidden className="text-accent"><UserPlus size={18} /></span>Split with friends</div>
            <p className="text-sm text-muted">{friends.length > 0 ? `${friends.length} friend${friends.length === 1 ? "" : "s"} added.` : "Friends never need an account. Add them by name, split a dinner or a trip, and track who has paid you back."}</p>
            <Link href="/settings" className="inline-block rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:bg-background">{friends.length > 0 ? "Manage friends" : "Add a friend"}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
