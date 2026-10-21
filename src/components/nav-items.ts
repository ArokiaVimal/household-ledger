import { BarChart3, CreditCard, FileUp, LayoutDashboard, List, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; /** One line shown in the phone menu. */ hint?: string; /** Lives in the phone's bottom bar; everything else is under "More". */ bar?: boolean; /** Other paths that count as being on this item (tabs of the same area). */ match?: string[] }

/** The phone's bottom bar, left to right (More is added after them). */
export const BAR_ORDER = ["/", "/people", "/transactions", "/reports"];

/**
 * The main screens, in the order they appear. The phone's bottom bar shows the `bar` ones and a More button opens the rest.
 * Wallets, Activity and Receipts are not listed: Wallets and Activity are in Settings, and Receipts has no real data source yet (the page still exists).
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, hint: "Your month at a glance", bar: true },
  { href: "/transactions", label: "Transactions", icon: List, hint: "Everything you spent", bar: true },
  { href: "/import", label: "Import", icon: FileUp, hint: "Statements, paste, describe" },
  { href: "/people", label: "Split", icon: Users, hint: "People and groups: who owes whom", bar: true },
  { href: "/cards", label: "Bills", icon: CreditCard, hint: "Card bills, recurring, timeline", match: ["/recurring", "/timeline"] },
  { href: "/insights", label: "AI", icon: Sparkles, hint: "Insights and all AI tools" },
  { href: "/reports", label: "Reports", icon: BarChart3, hint: "Where it all went", bar: true },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Payment methods, sharing, integrations" },
];
