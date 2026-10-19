"use client";
import { Check, ChevronRight, PlusCircle, type LucideIcon, CalendarClock, LayoutGrid, Repeat, Tags, UserRound, UserPlus, Wallet, Landmark, Upload } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useProfile } from "@/components/profile-context";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui";
import { useStore } from "@/data/store";
import { greetingName } from "@/lib/profile/profile";
import { cn } from "@/lib/cn";

/** Lets other parts of the app (this screen) open the Add Transaction form that lives in the app shell. */
export const OPEN_ADD_EVENT = "pf:add-transaction";
const openAdd = () => window.dispatchEvent(new Event(OPEN_ADD_EVENT));

const SKIP_KEY = "pf-setup-skipped";
const HIDE_KEY = "pf-setup-hidden";

const CHANGE = "pf:setup-change";
const readKey = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const writeKey = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } window.dispatchEvent(new Event(CHANGE)); };
const subscribe = (cb: () => void) => { window.addEventListener(CHANGE, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener("storage", cb); }; };
/** A value kept on this device only (empty on the server). */
export function useDeviceFlag(key: string): string { return useSyncExternalStore(subscribe, () => readKey(key), () => ""); }
export const setDeviceFlag = writeKey;

/** Which steps the person skipped and whether they hid the guide. Kept on this device only. */
function useSetupPrefs() {
  const raw = useDeviceFlag(SKIP_KEY);
  const hidden = useDeviceFlag(HIDE_KEY) === "1";
  let skipped: string[] = [];
  try { skipped = raw ? JSON.parse(raw) : []; } catch { /* ignore */ }
  return {
    skipped, hidden,
    skip: (id: string) => writeKey(SKIP_KEY, JSON.stringify([...skipped, id])),
    hide: () => writeKey(HIDE_KEY, "1"),
  };
}

interface SetupStep { id: string; title: string; hint: string; icon: LucideIcon; done: boolean; href?: string; action: string; essential?: boolean; onClick?: () => void }

function useSetupSteps(): SetupStep[] {
  const { accounts, records, staged, participants, meId, recurringItems, cardBills, groups } = useStore();
  const { profile } = useProfile();
  const others = participants.filter((p) => p.id !== meId);
  return [
    { id: "profile", title: "Your profile", hint: "Name and photo", icon: UserRound, done: !!profile && (!!profile.nickname || !!profile.avatarDataUrl), href: "/profile", action: "Open" },
    { id: "methods", title: "Payment methods", hint: "Cards, UPI apps, banks", icon: Wallet, done: accounts.length > 0, href: "/settings?s=methods", action: "Add", essential: true },
    { id: "balances", title: "Bank balances", hint: "For the cash forecast", icon: Landmark, done: accounts.some((a) => !!a.balance), href: "/settings?s=methods", action: "Add" },
    { id: "people", title: "Friends & Family", hint: "People you split with", icon: UserPlus, done: others.length > 0, href: "/settings?s=sharing", action: "Add" },
    { id: "groups", title: "Payment groups", hint: "Spending by person", icon: LayoutGrid, done: groups.filter((g) => g.kind === "people").length > 0, href: "/settings?s=groups", action: "Add" },
    { id: "categories", title: "Categories", hint: "Rename or add your own", icon: Tags, done: false, href: "/categories", action: "Open" },
    { id: "bills", title: "Card bills", hint: "Totals and due dates", icon: CalendarClock, done: cardBills.length > 0, href: "/cards", action: "Add" },
    { id: "recurring", title: "Recurring bills", hint: "Rent, EMIs, subscriptions", icon: Repeat, done: recurringItems.length > 0, href: "/recurring", action: "Add" },
    { id: "spending", title: "First transaction", hint: "Add one or import a statement", icon: Upload, done: records.length + staged.length > 0, href: "/import", action: "Import", essential: true },
  ];
}

function Row({ s, onSkip }: { s: SetupStep; onSkip?: () => void }) {
  const I = s.icon;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full", s.done ? "bg-good text-white" : "bg-accent/10 text-accent")}>{s.done ? <Check size={17} strokeWidth={3} /> : <I size={17} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{s.title}{!s.essential && !s.done && <span className="ml-2 text-xs font-normal text-muted">Optional</span>}</span>
        <span className="block truncate text-xs text-muted">{s.hint}</span>
      </span>
      {!s.done && (
        <span className="flex shrink-0 items-center gap-1">
          {onSkip && !s.essential && <button type="button" onClick={onSkip} className="min-h-9 rounded-full px-2.5 text-xs text-muted hover:text-foreground">Skip</button>}
          {s.id === "spending" && <Button variant="ghost" onClick={openAdd}><PlusCircle size={15} aria-hidden />Add</Button>}
          {s.href && <Link href={s.href} className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm hover:bg-background">{s.action}</Link>}
        </span>
      )}
    </li>
  );
}

/** First-run screen for someone with no transactions. Everything is optional; "Skip for now" opens the empty dashboard. */
export function Onboarding({ onSkipAll }: { onSkipAll?: () => void }) {
  const { addSuggestedAccounts, accounts } = useStore();
  const { profile } = useProfile();
  const { skipped, skip } = useSetupPrefs();
  const steps = useSetupSteps().filter((s) => !skipped.includes(s.id));
  const done = steps.filter((s) => s.done).length;
  const name = profile ? greetingName(profile) : "there";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="relative isolate overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#6d52e0] to-[#3a2399] p-5 text-white sm:p-7">
        <span aria-hidden className="absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-white/10" />
        <div className="flex items-center gap-3 sm:gap-4">
          <LogoMark size={44} />
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Welcome, {name}</h2>
            <p className="text-sm text-white/80">Set up the basics. Everything is optional.</p>
          </div>
        </div>
        <div className="mt-5" role="group" aria-label={`Setup progress: ${done} of ${steps.length}`}>
          <div className="mb-1.5 flex justify-between text-xs text-white/80"><span>Your setup</span><span className="num">{done} of {steps.length}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></div>
        </div>
      </section>

      {accounts.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] bg-surface p-4">
          <span className="min-w-0 flex-1 text-sm">Quick start with common cards, UPI apps and banks.</span>
          <Button variant="primary" onClick={addSuggestedAccounts}>Add usual methods</Button>
        </div>
      )}

      <ul className="divide-y divide-border rounded-[var(--radius-card)] bg-surface px-4">
        {steps.map((s) => <Row key={s.id} s={s} onSkip={() => skip(s.id)} />)}
      </ul>

      {onSkipAll && <div className="text-center"><button type="button" onClick={onSkipAll} className="min-h-10 rounded-full px-4 text-sm text-muted hover:text-foreground hover:underline">Skip for now</button></div>}
    </div>
  );
}

/** Compact reminder on the dashboard until the basics are done or the person hides it. */
export function SetupCard() {
  const { skipped, hidden, hide } = useSetupPrefs();
  const all = useSetupSteps();
  const steps = all.filter((s) => !skipped.includes(s.id));
  const left = steps.filter((s) => !s.done);
  if (hidden || left.length === 0) return null;
  const done = steps.length - left.length;
  return (
    <section aria-label="Finish setup" className="rounded-[var(--radius-card)] bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">Finish setup</h2><span className="num text-xs text-muted">{done} of {steps.length}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        </div>
        <button type="button" onClick={hide} className="min-h-9 shrink-0 rounded-full px-2.5 text-xs text-muted hover:text-foreground">Hide</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {left.slice(0, 4).map((s) => {
          const I = s.icon;
          return <Link key={s.id} href={s.href ?? "/settings"} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-background"><I size={15} aria-hidden className="text-accent" />{s.title}<ChevronRight size={14} aria-hidden className="text-muted" /></Link>;
        })}
      </div>
    </section>
  );
}
