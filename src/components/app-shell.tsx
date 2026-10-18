"use client";
import { BarChart3, Bell, ClipboardCheck, FileUp, LogOut, Plus, Handshake, Repeat, LayoutDashboard, List, Receipt, Search, Settings, Tags, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useStore } from "@/data/store";
import { cn } from "@/lib/cn";
import { TxnAddDialog } from "./txn-edit-dialog";
import { Select } from "./ui";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Transactions", icon: List, mobile: true },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/import", label: "Import", icon: FileUp, mobile: true },
  { href: "/settlements", label: "Settle", icon: Handshake, mobile: true },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings, mobile: true },
];

export function AppShell({ children, user }: { children: ReactNode; user: { email: string } | null }) {
  const path = usePathname();
  const router = useRouter();
  const { month, setMonth, view, setView, staged } = useStore();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState(0);
  const [toast, setToast] = useState("");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  };
  const go = (e: React.FormEvent) => { e.preventDefault(); router.push(`/transactions?q=${encodeURIComponent(q)}`); };

  return (
    <div className="min-h-screen md:p-6">
      <div className="mx-auto min-h-screen max-w-[1280px] bg-background md:min-h-[calc(100vh-3rem)] md:rounded-[32px] md:p-5">
        <div className="md:grid md:grid-cols-[4.25rem_1fr] md:gap-5">
          <aside className="sticky top-5 hidden h-[calc(100vh-5.5rem)] flex-col items-center gap-2 rounded-2xl bg-surface py-4 md:flex">
            <div className="mb-2 grid size-10 place-items-center rounded-full bg-accent text-white" aria-hidden><Waves size={20} /></div>
            {nav.map(({ href, label, icon: I }) => (
              <Link key={href} href={href} title={label} aria-label={label} aria-current={active(href) ? "page" : undefined}
                className={cn("grid size-10 place-items-center rounded-full transition-colors", active(href) ? "bg-foreground text-white" : "text-muted hover:bg-background")}>
                <I size={18} aria-hidden />
              </Link>
            ))}
          </aside>
          <div className="min-w-0">
            <div className="mx-4 mt-3 rounded-full bg-warn-soft px-4 py-1 text-center text-xs text-warn md:mx-0 md:mt-0" role="status">
              PROTOTYPE · fictional September 2026 data · nothing is saved, synced, or uploaded
            </div>
            <header className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-0">
              <div className="order-1 mr-auto">
                <p className="text-xl font-semibold tracking-tight">{path === "/" ? <>Hi Vimal <span aria-hidden>👋</span></> : "Household Ledger"}</p>
                <p className="hidden text-sm text-muted xl:block">{path === "/" ? "Here's where your money went this month" : "Where your money went, and who owes what"}</p>
              </div>
              <form onSubmit={go} role="search" className="order-6 flex w-full items-center gap-2 rounded-full bg-surface px-4 md:order-3 md:w-72">
                <Search size={16} className="text-muted" aria-hidden />
                <input aria-label="Search transactions" placeholder="Search transactions…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-10 w-full bg-transparent text-sm outline-none" />
              </form>
              <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="order-4 w-auto flex-1 md:w-44 md:flex-none">
                <option value="2026-09">September 2026</option>
                <option value="2026-08">August 2026</option>
              </Select>
              <Select aria-label="View" value={view} onChange={(e) => setView(e.target.value as "household" | "personal")} className="order-5 w-auto flex-1 md:w-32 md:flex-none">
                <option value="household">Household</option>
                <option value="personal">Personal</option>
              </Select>
              <Link href="/review" aria-label={`${staged.length} transactions awaiting review`} className="relative order-2 grid size-10 place-items-center rounded-full bg-surface md:order-6">
                <Bell size={18} aria-hidden />
                {staged.length > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
              </Link>
              <div aria-hidden title={user?.email} className="order-3 grid size-10 place-items-center rounded-full bg-accent text-sm font-medium text-white md:order-7">{(user?.email[0] ?? "V").toUpperCase()}</div>
              {user && <button onClick={signOut} aria-label="Sign out" title="Sign out" className="order-3 grid size-10 place-items-center rounded-full bg-surface text-muted md:order-8"><LogOut size={16} aria-hidden /></button>}
            </header>
            <main className="px-4 pb-24 md:px-0 md:pb-4">{children}</main>
          </div>
        </div>
      </div>
      <button onClick={() => setAdding(true)} aria-label="Add transaction"
        className="fixed bottom-24 right-4 z-20 flex items-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-accent/90 md:bottom-8 md:right-8">
        <Plus size={18} aria-hidden /> Add
      </button>
      <TxnAddDialog open={adding} round={round} onClose={() => setAdding(false)} onAnother={() => setRound((r) => r + 1)}
        onAdded={(m) => { setToast(m); setTimeout(() => setToast(""), 3000); }} />
      {toast && <div role="status" className="fixed inset-x-0 bottom-40 z-30 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm text-white shadow-lg md:bottom-24">{toast}</div>}
      <nav aria-label="Primary" className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-5 rounded-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-lg md:hidden">
        {nav.filter((n) => n.mobile).map(({ href, label, icon: I }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-medium text-accent" : "text-muted")}>
            <I size={20} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
