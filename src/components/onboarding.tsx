"use client";
import { Check, ChevronRight, PlusCircle, type LucideIcon, CalendarClock, LayoutGrid, Repeat, Tags, UserRound, UserPlus, Wallet, Landmark, Upload } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useProfile } from "@/components/profile-context";
import { LogoMark } from "@/components/logo";
import { ProgressRing } from "@/components/progress";
import { Button, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import { greetingName } from "@/lib/profile/profile";
import { cn } from "@/lib/cn";

/** Lets other parts of the app (this screen) open the Add Transaction form that lives in the app shell. */
export const OPEN_ADD_EVENT = "pf:add-transaction";
const openAdd = () => window.dispatchEvent(new Event(OPEN_ADD_EVENT));

const SKIP_KEY = "pf-setup-skipped";
const HIDE_KEY = "pf-setup-hidden";
const SPLIT_KEY = "pf-split-with";

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

const SPLIT_CHOICES = [["partner", "Partner"], ["friends", "Friends"], ["family", "Family"], ["colleagues", "Colleagues"], ["trips", "Trips and outings"], ["solo", "Just me"]] as const;

/** Who the person splits with, kept on this device so the guide can show it as done. */
function useSplitWith() {
  const raw = useDeviceFlag(SPLIT_KEY);
  let picked: string[] = [];
  try { picked = raw ? JSON.parse(raw) : []; } catch { /* ignore */ }
  return { picked, set: (next: string[]) => writeKey(SPLIT_KEY, JSON.stringify(next)) };
}

/**
 * "Who do you split with?" Pick any mix; each choice offers its next step right here. Nothing is required:
 * "Just me" is a complete answer, and people and groups can be added later from the Split tab.
 */
function SplitWithStep() {
  const { addParticipant, participants, meId } = useStore();
  const { picked, set } = useSplitWith();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const toggle = (id: string) => set(id === "solo" ? (picked.includes("solo") ? [] : ["solo"]) : picked.includes(id) ? picked.filter((x) => x !== id) : [...picked.filter((x) => x !== "solo"), id]);
  const kinds = (["friends", "family", "colleagues"] as const).filter((k) => picked.includes(k));
  const [kind, setKind] = useState<(typeof kinds)[number] | null>(null);
  const useKind = kinds.includes(kind as never) ? kind! : kinds[0];
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const rel = useKind === "family" ? { relationship: "family" as const } : useKind === "colleagues" ? { relationship: "custom" as const, relationshipLabel: "Colleague" } : { relationship: "friend" as const };
    const r = addParticipant(name, rel);
    if (r.error) return setError(r.error);
    setAdded((a) => [...a, name.trim()]); setName(""); setError(null);
  };
  const people = participants.filter((p) => p.id !== meId).length;
  return (
    <section aria-label="Who you split with" className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold">Who do you split with?</h3>
        <p className="text-xs text-muted">Pick any. You can change this later in the Split tab.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who you split with">
        {SPLIT_CHOICES.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={picked.includes(id)} onClick={() => toggle(id)} className={cn("min-h-10 rounded-full border px-3.5 text-sm transition-colors", picked.includes(id) ? "border-accent bg-accent font-medium text-white" : "border-transparent bg-background hover:border-border")}>{label}</button>
        ))}
      </div>
      {picked.includes("partner") && (
        <p className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1 text-muted">Link your partner to split in one tap with your usual share.</span><Link href="/settings?s=sharing&partner=1" className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 hover:bg-background">Link a partner</Link></p>
      )}
      {kinds.length > 0 && (
        <form onSubmit={add} className="space-y-2">
          {kinds.length > 1 && (
            <div className="flex gap-1.5 text-xs" role="group" aria-label="Adding as">
              {kinds.map((k) => <button key={k} type="button" aria-pressed={useKind === k} onClick={() => setKind(k)} className={cn("min-h-8 rounded-full px-3", useKind === k ? "bg-foreground text-white" : "bg-background text-muted")}>{SPLIT_CHOICES.find(([id]) => id === k)![1]}</button>)}
            </div>
          )}
          <div className="flex gap-2">
            <Input aria-label="Name" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder={useKind === "family" ? "Add a family member" : useKind === "colleagues" ? "Add a colleague" : "Add a friend"} />
            <Button type="submit" variant="primary" disabled={!name.trim()}>Add</Button>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {added.length > 0 && <p role="status" className="text-xs text-good">Added: {added.join(", ")}</p>}
        </form>
      )}
      {picked.includes("trips") && (
        <p className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1 text-muted">Make a group for a trip, dinner or outing and see who owes whom.</span><Link href="/groups?new=1" className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 hover:bg-background">Create a group</Link></p>
      )}
      {picked.includes("solo") && <p className="text-sm text-muted">Fine. Everything stays private to you. You can add people any time from the Split tab.</p>}
      {people > 0 && !picked.includes("solo") && <p className="text-xs text-muted">{people} {people === 1 ? "person" : "people"} added so far.</p>}
    </section>
  );
}

interface SetupStep { id: string; title: string; hint: string; icon: LucideIcon; done: boolean; href?: string; action: string; essential?: boolean; onClick?: () => void }

function useSetupSteps(): SetupStep[] {
  const { accounts, records, staged, participants, meId, recurringItems, cardBills, groups } = useStore();
  const splitWith = useSplitWith().picked;
  const { profile } = useProfile();
  const others = participants.filter((p) => p.id !== meId);
  return [
    { id: "profile", title: "Your profile", hint: "Name and photo", icon: UserRound, done: !!profile && (!!profile.nickname || !!profile.avatarDataUrl), href: "/settings?s=profile", action: "Open" },
    { id: "methods", title: "Payment methods", hint: "Cards, UPI apps, banks", icon: Wallet, done: accounts.length > 0, href: "/settings?s=methods", action: "Add", essential: true },
    { id: "balances", title: "Bank balances", hint: "For the cash forecast", icon: Landmark, done: accounts.some((a) => !!a.balance), href: "/settings?s=methods", action: "Add" },
    { id: "people", title: "Who you split with", hint: "Partner, friends, family, groups", icon: UserPlus, done: others.length > 0 || splitWith.includes("solo"), href: "/settings?s=sharing", action: "Choose" },
    { id: "groups", title: "Payment groups", hint: "Spending by person", icon: LayoutGrid, done: groups.filter((g) => g.kind === "people").length > 0, href: "/settings?s=groups", action: "Add" },
    { id: "categories", title: "Categories", hint: "Rename or add your own", icon: Tags, done: false, href: "/settings?s=categories", action: "Open" },
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

      <SplitWithStep />

      <ul className="divide-y divide-border rounded-[var(--radius-card)] bg-surface px-4">
        {steps.filter((s) => s.id !== "people").map((s) => <Row key={s.id} s={s} onSkip={() => skip(s.id)} />)}
      </ul>

      {onSkipAll && <div className="text-center"><button type="button" onClick={onSkipAll} className="min-h-10 rounded-full px-4 text-sm text-muted hover:text-foreground hover:underline">Skip for now</button></div>}
    </div>
  );
}

/** Compact reminder on the dashboard until the basics are done or the person hides it. */
/** What still needs you on Home: the setup steps (until finished or hidden) and the unverified count, as two thin lines in one card. */
export function TodoCard({ setup = true, verify }: { setup?: boolean; verify?: { left: number; total: number; verified: number; pct: number; monthName: string; elsewhere: number; href: string } }) {
  const { skipped, hidden, hide } = useSetupPrefs();
  const all = useSetupSteps();
  const steps = all.filter((s) => !skipped.includes(s.id));
  const left = steps.filter((s) => !s.done);
  const showSetup = setup && !hidden && left.length > 0;
  const showVerify = !!verify && verify.total > 0;
  if (!showSetup && !showVerify) return null;
  const done = steps.length - left.length;
  const next = left[0];
  return (
    <section aria-label="To do" className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] bg-surface">
      {showSetup && next && (
        <div className="flex min-h-12 items-center gap-1 pl-4 pr-1">
          <Link href={next.href ?? "/settings"} className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
            <span className="text-sm font-semibold">Setup</span>
            <span className="num text-xs text-muted">{done} of {steps.length}</span>
            <span aria-hidden className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-background"><span className="block h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} /></span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">Next: {next.title}</span>
            <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
          </Link>
          <button type="button" onClick={hide} className="min-h-11 shrink-0 rounded-full px-2.5 text-xs text-muted hover:text-foreground">Hide</button>
        </div>
      )}
      {showVerify && verify && (
        <Link href={verify.href} className="flex min-h-12 items-center gap-3 px-4 py-1.5 hover:bg-background">
          <ProgressRing pct={verify.pct} size={34} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-tight">{verify.left === 0 ? "All verified" : `${verify.left} left to verify`}</span><span className="block truncate text-xs text-muted">{verify.verified} of {verify.total} in {verify.monthName}{verify.elsewhere > 0 ? ` · ${verify.elsewhere} in all months` : ""}</span></span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
        </Link>
      )}
    </section>
  );
}
