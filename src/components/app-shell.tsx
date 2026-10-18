"use client";
import { BarChart3, FileUp, Handshake, LayoutDashboard, List, Receipt, Settings, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStore } from "@/data/store";
import { cn } from "@/lib/cn";
import { Select } from "./ui";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Transactions", icon: List, mobile: true },
  { href: "/import", label: "Import", icon: FileUp, mobile: true },
  { href: "/settlements", label: "Settle", icon: Handshake, mobile: true },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings, mobile: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { month, setMonth, view, setView } = useStore();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="md:grid md:grid-cols-[13rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-border bg-surface p-3 md:flex">
        <div className="px-2 py-3 text-base font-semibold">Household Ledger</div>
        {nav.map(({ href, label, icon: I }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm", active(href) ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-background")}>
            <I size={16} aria-hidden /> {label}
          </Link>
        ))}
      </aside>
      <div className="min-w-0">
        <div className="bg-warn-soft px-4 py-1.5 text-center text-xs text-warn" role="status">
          PROTOTYPE · fictional September 2026 data · nothing is saved, synced, or uploaded
        </div>
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44">
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
          </Select>
          <Select aria-label="View" value={view} onChange={(e) => setView(e.target.value as "household" | "personal")} className="w-32">
            <option value="household">Household</option>
            <option value="personal">Personal</option>
          </Select>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 md:pb-8">{children}</main>
      </div>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
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
