import { BarChart3, ClipboardCheck, CreditCard, FileUp, Handshake, LayoutDashboard, List, Receipt, Repeat, Settings, Sparkles, Tags, Ticket, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; /** One line shown in the phone menu. */ hint?: string; /** Lives in the phone's bottom bar; everything else is under "More". */ bar?: boolean }

/** Every screen, in the order they appear. The phone's bottom bar shows the `bar` ones and a More button opens all the others. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, hint: "Your month at a glance", bar: true },
  { href: "/transactions", label: "Transactions", icon: List, hint: "Everything you spent", bar: true },
  { href: "/review", label: "Review", icon: ClipboardCheck, hint: "Approve imported rows", bar: true },
  { href: "/import", label: "Import", icon: FileUp, hint: "Statements, paste, describe", bar: true },
  { href: "/settlements", label: "Settle up", icon: Handshake, hint: "Who owes whom" },
  { href: "/recurring", label: "Recurring", icon: Repeat, hint: "Rent, EMIs, bills" },
  { href: "/cards", label: "Card bills", icon: CreditCard, hint: "What to pay, and by when" },
  { href: "/vouchers", label: "Wallets", icon: Ticket, hint: "Voucher top-ups and use" },
  { href: "/insights", label: "AI insights", icon: Sparkles, hint: "Tips for your month" },
  { href: "/reports", label: "Reports", icon: BarChart3, hint: "Where it all went" },
  { href: "/categories", label: "Categories", icon: Tags, hint: "Names and rules" },
  { href: "/receipts", label: "Receipts", icon: Receipt, hint: "Match receipts" },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Payment methods, sharing, integrations" },
  { href: "/profile", label: "Profile", icon: UserRound, hint: "Your name and photo" },
];

/** Settle up only makes sense once there is someone to settle with (live mode). */
export const navFor = (live: boolean, partner: boolean, hasPeople: boolean) => NAV.filter((n) => n.href !== "/settlements" || !live || partner || hasPeople);
