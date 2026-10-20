import { BarChart3, History, CalendarClock, ClipboardCheck, CreditCard, FileUp, LayoutDashboard, List, Receipt, Repeat, Settings, Sparkles, Tags, Ticket, UserRound, Users, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; /** One line shown in the phone menu. */ hint?: string; /** Lives in the phone's bottom bar; everything else is under "More". */ bar?: boolean }

/** The phone's bottom bar, left to right (More is added after them). */
export const BAR_ORDER = ["/", "/people", "/transactions", "/reports"];

/** Every screen, in the order they appear. The phone's bottom bar shows the `bar` ones and a More button opens all the others. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, hint: "Your month at a glance", bar: true },
  { href: "/transactions", label: "Transactions", icon: List, hint: "Everything you spent", bar: true },
  { href: "/review", label: "Review", icon: ClipboardCheck, hint: "Approve imported rows" },
  { href: "/import", label: "Import", icon: FileUp, hint: "Statements, paste, describe" },
  { href: "/people", label: "People", icon: Users, hint: "Who you share with, who owes whom", bar: true },
  { href: "/timeline", label: "Timeline", icon: CalendarClock, hint: "What happened, what is coming" },
  { href: "/recurring", label: "Recurring", icon: Repeat, hint: "Rent, EMIs, bills" },
  { href: "/cards", label: "Card bills", icon: CreditCard, hint: "What to pay, and by when" },
  { href: "/vouchers", label: "Wallets", icon: Ticket, hint: "Voucher top-ups and use" },
  { href: "/insights", label: "AI", icon: Sparkles, hint: "Insights and all AI tools" },
  { href: "/reports", label: "Reports", icon: BarChart3, hint: "Where it all went", bar: true },
  { href: "/categories", label: "Categories", icon: Tags, hint: "Names and rules" },
  { href: "/activity", label: "Activity", icon: History, hint: "Changes, undo, import history" },
  { href: "/receipts", label: "Receipts", icon: Receipt, hint: "Match receipts" },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Payment methods, sharing, integrations" },
  { href: "/profile", label: "Profile", icon: UserRound, hint: "Your name and photo" },
];
