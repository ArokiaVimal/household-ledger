"use client";
// The top of the Split tab: the title, the page's own actions, and a switch between People and Groups. Both are real pages
// (/people and /groups), so links, back arrows and the browser's back button all return to the right side.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InfoTip } from "./ui";

const SIDES = [{ href: "/people", id: "people", label: "People" }, { href: "/groups", id: "groups", label: "Groups" }] as const;

export function SplitTabs({ active, actions }: { active: "people" | "groups"; actions?: ReactNode }) {
  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-1 text-xl font-semibold tracking-tight">Split<InfoTip text="Split expenses with anyone: friends, family, colleagues. People shows who owes whom; Groups holds trips, dinners and outings. Settling up records a payment, never an expense." /></h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <nav aria-label="Split" className="flex rounded-full bg-background p-1">
        {SIDES.map((s) => (
          <Link key={s.id} href={s.href} replace aria-current={active === s.id ? "page" : undefined}
            className={cn("min-h-9 flex-1 rounded-full text-center text-sm leading-9 transition-colors focus-visible:outline-2 focus-visible:outline-accent", active === s.id ? "bg-accent font-medium text-white shadow-sm" : "text-muted hover:bg-surface")}>{s.label}</Link>
        ))}
      </nav>
    </div>
  );
}
