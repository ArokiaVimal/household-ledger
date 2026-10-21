"use client";
// The top of the Bills area: one nav entry, three real pages (/cards, /recurring, /timeline), so links, back arrows and the
// browser's back button all return to the right tab. Same idea as the Split tabs.
import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [{ href: "/cards", id: "cards", label: "Card bills" }, { href: "/recurring", id: "recurring", label: "Recurring" }, { href: "/timeline", id: "timeline", label: "Timeline" }] as const;

export function BillsTabs({ active }: { active: "cards" | "recurring" | "timeline" }) {
  return (
    <nav aria-label="Bills" className="mb-3 flex rounded-full bg-background p-1 md:max-w-md">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} replace aria-current={active === t.id ? "page" : undefined}
          className={cn("min-h-9 flex-1 rounded-full text-center text-sm leading-9 transition-colors focus-visible:outline-2 focus-visible:outline-accent", active === t.id ? "bg-accent font-medium text-white shadow-sm" : "text-muted hover:bg-surface")}>{t.label}</Link>
      ))}
    </nav>
  );
}
