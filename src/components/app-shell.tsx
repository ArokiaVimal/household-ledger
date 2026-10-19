"use client";
import { Bell, ChevronLeft, ChevronRight, Lock, LockOpen, LogOut, MoreHorizontal, Plus, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/data/store";
import { cn } from "@/lib/cn";
import { isAfterMonth, monthLabel, shiftMonth } from "@/domain/months";
import { greetingName } from "@/lib/profile/profile";
import { Avatar } from "./avatar";
import { LogoMark } from "./logo";
import { useProfile } from "./profile-context";
import { OPEN_ADD_EVENT } from "./onboarding";
import { TxnAddDialog } from "./txn-edit-dialog";
import { navFor } from "./nav-items";
import { ChipGroup, Dialog } from "./ui";


/** Previous / next month. The next month is disabled once you reach the current month. */
function MonthStepper({ className }: { className?: string }) {
  const { month, setMonth, today, monthLocked, toggleMonthLock } = useStore();
  const btn = "grid size-9 place-items-center rounded-full text-muted hover:bg-background disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className={cn("flex items-center rounded-full bg-surface p-0.5 ring-2", monthLocked ? "ring-accent" : "ring-accent/30", className)} role="group" aria-label="Month">
      <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className={btn}><ChevronLeft size={18} aria-hidden /></button>
      <span className="num min-w-[5.75rem] flex-1 text-center text-base font-bold" aria-live="polite">{monthLabel(month)}</span>
      <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isAfterMonth(shiftMonth(month, 1), today)} aria-label="Next month" className={btn}><ChevronRight size={18} aria-hidden /></button>
      <button type="button" onClick={toggleMonthLock} aria-pressed={monthLocked} aria-label={monthLocked ? `Unlock ${monthLabel(month)}` : `Lock to ${monthLabel(month)}`} title={monthLocked ? "Locked to this month. Tap to unlock." : "Lock the app to this month"} className={cn("grid size-9 place-items-center rounded-full", monthLocked ? "bg-accent text-white" : "text-muted hover:bg-background")}>{monthLocked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}</button>
    </div>
  );
}

function ScopeSwitch({ className }: { className?: string }) {
  const { view, setView, live, partner } = useStore();
  if (live && !partner) return null; // solo: nothing to switch between
  return (
    <div className={cn("[&>div]:bg-surface", className)}>
      <ChipGroup tabs label="Show" value={view === "household" ? "all" : "mine"} onChange={(v) => setView(v === "all" ? "household" : "personal")} options={[{ id: "mine", label: "Mine" }, { id: "all", label: live ? "Together" : "Everything" }]} />
    </div>
  );
}

/** Profile picture that opens a small menu: profile, settings, sign out. */
function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-background";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="block rounded-full">
        <Avatar profile={profile ?? { displayName: "", email: "", avatarDataUrl: null, providerPhotoUrl: null }} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-56 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-border">
          {profile && <div className="px-3 py-2"><div className="truncate text-sm font-semibold">{profile.displayName}</div><div className="truncate text-xs text-muted">{profile.email}</div></div>}
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className={item}><UserRound size={16} aria-hidden />Your profile</Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={item}><Settings size={16} aria-hidden />Settings</Link>
          <button type="button" role="menuitem" onClick={onSignOut} className={cn(item, "text-danger")}><LogOut size={16} aria-hidden />Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, user }: { children: ReactNode; user: { email: string } | null }) {
  const path = usePathname();
  const router = useRouter();
  const { live, partner, participants, meId, previewing, staged, syncError, dismissSyncError } = useStore();
  // Solo use is complete on its own: settle-up and the Mine/Together switch appear once a partner is linked.
  const visibleNav = navFor(live, !!partner, participants.some((p) => p.id !== meId)).filter((n) => n.href !== "/profile");
  const phoneBar = visibleNav.filter((n) => n.bar);
  const phoneMore = navFor(live, !!partner, participants.some((p) => p.id !== meId)).filter((n) => !n.bar);
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState("");
  const { profile } = useProfile();
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState(0);
  // Quiet Gmail check once per tab session when the app opens (the server skips it when Gmail is not connected or was checked recently).
  useEffect(() => {
    if (!live) return;
    try { if (sessionStorage.getItem("gmail-auto")) return; sessionStorage.setItem("gmail-auto", "1"); } catch { /* storage unavailable: still fine */ }
    void fetch("/api/gmail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync", auto: true }) })
      .then((r) => r.json()).then((d: { counts?: { added: number; bills: number } }) => { if (d?.counts && d.counts.added + d.counts.bills > 0) router.refresh(); }).catch(() => undefined);
  }, [live, router]);
  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener(OPEN_ADD_EVENT, open);
    return () => window.removeEventListener(OPEN_ADD_EVENT, open);
  }, []);
  const [toast, setToast] = useState("");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  };
  const go = (e: React.FormEvent) => { e.preventDefault(); router.push(`/transactions?q=${encodeURIComponent(q)}`); };

  return (
    <div className="min-h-screen md:p-6 2xl:p-8">
      <div className="mx-auto min-h-screen max-w-[90rem] bg-background md:min-h-[calc(100vh-3rem)] md:rounded-[32px] md:p-5">
        <div className="md:grid md:grid-cols-[4.25rem_1fr] md:gap-5">
          <aside className="sticky top-5 hidden h-[calc(100vh-5.5rem)] flex-col items-center gap-2 rounded-2xl bg-surface py-4 md:flex">
            <Link href="/" aria-label="Personal Finance App home" className="mb-2"><LogoMark size={40} /></Link>
            {visibleNav.map(({ href, label, icon: I }) => (
              <Link key={href} href={href} title={label} aria-label={label} aria-current={active(href) ? "page" : undefined}
                className={cn("grid size-10 place-items-center rounded-full transition-colors", active(href) ? "bg-foreground text-white" : "text-muted hover:bg-background")}>
                <I size={18} aria-hidden />
              </Link>
            ))}
          </aside>
          <div className="min-w-0">
            {!live && (
              <div className="mx-4 mt-3 rounded-full bg-warn-soft px-4 py-1 text-center text-xs text-warn md:mx-0 md:mt-0" role="status">
                Demo mode · fictional data · nothing is saved
              </div>
            )}
            <header className="px-4 pb-3 pt-4 md:px-0 md:pb-4">
              <div className="flex items-center gap-3">
                <div className="mr-auto min-w-0">
                  <p className="truncate text-xl font-semibold tracking-tight">{path === "/" ? <>Hi {profile ? greetingName(profile) : "there"} <span aria-hidden>👋</span></> : "Personal Finance App"}</p>
                  <p className="hidden text-sm text-muted xl:block">{path === "/" ? "Here's where your money went this month" : "Where your money went, and who owes what"}</p>
                </div>
                <form onSubmit={go} role="search" className="hidden w-64 items-center gap-2 rounded-full bg-surface px-4 lg:flex">
                  <Search size={16} className="text-muted" aria-hidden />
                  <input aria-label="Search transactions" placeholder="Search transactions…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-10 w-full bg-transparent text-sm outline-none" />
                </form>
                <MonthStepper className="hidden md:flex" />
                <ScopeSwitch className="hidden w-52 md:block" />
                <Link href="/review" aria-label={`${staged.length} transactions awaiting review`} className="relative grid size-10 shrink-0 place-items-center rounded-full bg-surface">
                  <Bell size={18} aria-hidden />
                  {staged.length > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
                </Link>
                {user && <AccountMenu onSignOut={signOut} />}
              </div>
              <div className="mt-3 flex items-center gap-2 md:hidden">
                <MonthStepper />
                <ScopeSwitch className="min-w-0 flex-1" />
              </div>
            </header>
            {previewing && (
              <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm text-warn md:mx-0">
                <span className="min-w-0 flex-1"><b>Preview.</b> {staged.length} imported transaction{staged.length === 1 ? " is" : "s are"} waiting for your review. These numbers are provisional, and nothing counts until you approve it.</span>
                <Link href="/review" className="shrink-0 rounded-full bg-warn px-3.5 py-1.5 text-xs font-medium text-white">Review now</Link>
              </div>
            )}
            <main className="px-4 pb-[calc(var(--sab)+9rem)] md:px-0 md:pb-4">{children}</main>
          </div>
        </div>
      </div>
      <button onClick={() => setAdding(true)} aria-label="Add transaction"
        className="fixed bottom-[calc(var(--sab)+4.75rem)] right-4 z-30 flex items-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-accent/90 md:bottom-8 md:right-8">
        <Plus size={18} aria-hidden /> Add
      </button>
      <TxnAddDialog open={adding} round={round} onClose={() => setAdding(false)} onAnother={() => setRound((r) => r + 1)}
        onAdded={(m) => { setToast(m); setTimeout(() => setToast(""), 3000); }} />
      {syncError && (
        <div role="alert" className="fixed inset-x-3 bottom-[calc(var(--sab)+9rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-danger px-4 py-3 text-sm text-white shadow-lg md:bottom-24">
          <span className="flex-1">{syncError} Your screen was refreshed from the server.</span>
          <button onClick={dismissSyncError} className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">Dismiss</button>
        </div>
      )}
      {toast && <div role="status" className="fixed inset-x-0 bottom-[calc(var(--sab)+9rem)] z-40 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm text-white shadow-lg md:bottom-24">{toast}</div>}
      <nav aria-label="Primary" style={{ gridTemplateColumns: `repeat(${phoneBar.length + 1}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface pb-[var(--sab)] md:hidden">
        {phoneBar.map(({ href, label, icon: I }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-medium text-accent" : "text-muted")}>
            <I size={20} aria-hidden /> {label}
            {href === "/review" && staged.length > 0 && <span aria-label={`${staged.length} waiting`} className="absolute right-[22%] top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{staged.length > 99 ? "99+" : staged.length}</span>}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}
          className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", phoneMore.some((n) => active(n.href)) ? "font-medium text-accent" : "text-muted")}>
          <MoreHorizontal size={20} aria-hidden /> More
        </button>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Everything">
        <ul className="grid grid-cols-3 gap-2 pb-4">
          {phoneMore.map(({ href, label, icon: I, hint }) => (
            <li key={href}>
              <Link href={href} onClick={() => setMoreOpen(false)} aria-current={active(href) ? "page" : undefined} title={hint}
                className={cn("flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs", active(href) ? "border-accent bg-accent/10 font-medium text-accent" : "border-border bg-background")}>
                <I size={22} aria-hidden /> <span className="leading-tight">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
