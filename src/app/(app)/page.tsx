"use client";
import { ArrowDownLeft, ArrowUpRight, Handshake, BarChart3, CalendarClock, Check, ChevronRight, CreditCard, Landmark, Repeat, Smartphone, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { DonutChart, TrendChart } from "@/components/charts";
import { verifyProgress } from "@/domain/progress";
import { Onboarding, TodoCard, setDeviceFlag, useDeviceFlag } from "@/components/onboarding";
import { MerchantAvatar, TxnBadges, Amount } from "@/components/txn-row";
import { CategoryGlyph, PersonGlyph } from "@/components/glyphs";
import { Badge, Card, CardTitle, ConfirmDialog, EmptyState } from "@/components/ui";
import type { BillStatus } from "@/domain/cardbills";
import { useStore } from "@/data/store";
import { cardViews, upcomingBills } from "@/domain/cardbills";
import { NAV } from "@/components/nav-items";
import { cardLabel, rootOf, shortName } from "@/domain/accounts";
import { formatINR } from "@/domain/money";
import { personLedger } from "@/domain/ledger";
import { byMonth } from "@/domain/reports";
import { summarizeGroup } from "@/domain/groups";
import { attentionTotal, needsAttention } from "@/domain/attention";
import { summarize } from "@/domain/reports";
import { cn } from "@/lib/cn";
import { logoFor } from "@/lib/logos";

const prettyDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** A compact section header: icon, title and a "View all" link that opens the complete list. */
function SectionHead({ icon: I, title, href, hrefLabel = "View all" }: { icon: LucideIcon; title: string; href: string; hrefLabel?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold"><span className="grid size-8 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><I size={16} /></span>{title}</h2>
      <Link href={href} className="inline-flex min-h-9 items-center gap-0.5 text-sm font-medium text-accent">{hrefLabel}<ChevronRight size={15} aria-hidden /></Link>
    </div>
  );
}
/** The round tick of a checklist row: filled when done, tap to mark it paid (the page confirms first). */
function Tick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={done ? `${label} (already paid)` : label} disabled={done} onClick={onClick} className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors", done ? "border-accent bg-accent text-white" : "border-border bg-surface hover:border-accent")}>
      {done && <Check size={14} strokeWidth={3} aria-hidden />}
    </button>
  );
}
interface CheckRow { key: string; logo: ReactNode; /** Short on a phone, fuller from tablet width up. */ name: string; nameLong: string; sub: string; subLong: string; tone: "good" | "bad" | "warn" | "info"; done: boolean; tickLabel: string; onTick: () => void }

/**
 * A compact checklist card for the two-column home layout. Only what still needs doing is listed (paid items move under "View all");
 * when everything is paid it says so. Names are short and the status is a colour and, when it matters, one word.
 */
function ChecklistCard({ icon: I, title, href, rows, empty, addLabel }: { icon: LucideIcon; title: string; href: string; rows: CheckRow[]; empty: string; addLabel: string }) {
  const open = rows.filter((r) => !r.done);
  const paid = rows.length - open.length;
  const tone = { good: "text-good", bad: "text-danger", warn: "text-warn", info: "text-muted" } as const;
  const more = open.length > 3 ? `View all (+${open.length - 3})` : paid > 0 ? `View all · ${paid} paid` : "View all";
  return (
    <Card className="flex min-w-0 flex-col p-2.5 md:p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold md:text-base"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><I size={14} /></span>{title}</h2>
      {rows.length === 0 ? (
        <p className="flex-1 py-2 text-xs text-muted">{empty}. <Link href={href} className="text-accent underline">{addLabel}</Link></p>
      ) : open.length === 0 ? (
        <div className="flex flex-1 flex-col items-start gap-2 py-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-medium text-good"><Check size={13} strokeWidth={3} aria-hidden />All {rows.length} paid</span>
          <Link href={href} className="inline-flex min-h-9 w-full items-center justify-center rounded-xl bg-background text-xs font-medium text-accent">View all</Link>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-border">
            {open.slice(0, 3).map((r) => (
              <li key={r.key} className="flex items-center gap-1.5 py-2">
                {r.logo}
                <Link href={href} className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium leading-tight md:text-[15px]"><span className="md:hidden">{r.name}</span><span className="hidden md:inline">{r.nameLong}</span></span><span className={cn("block truncate text-xs leading-tight md:text-[13px]", tone[r.tone])}><span className="md:hidden">{r.sub}</span><span className="hidden md:inline">{r.subLong}</span></span></Link>
                <Tick done={false} label={r.tickLabel} onClick={r.onTick} />
              </li>
            ))}
          </ul>
          <Link href={href} className="mt-1 flex min-h-9 items-center justify-center rounded-xl bg-background px-2 text-xs font-medium text-accent md:text-sm">{more}</Link>
        </>
      )}
    </Card>
  );
}


/** One side of the "who owes whom" card: an arrow, the total, and the people it is with as small faces. */
function OweTile({ tone, label, total, people, none }: { tone: "in" | "out"; label: string; total: number; people: string[]; none: string }) {
  const { nameOf } = useStore();
  const out = tone === "out";
  return (
    <Link href="/people" className={cn("flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 transition-shadow hover:shadow-md", out ? "bg-rose-500/10" : "bg-emerald-500/10")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-white", out ? "bg-rose-400" : "bg-emerald-500")} aria-hidden>{out ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-tight text-muted md:text-xs">{label}</span>
        <span className="num block whitespace-nowrap text-base font-semibold leading-tight tracking-tight md:text-lg">{formatINR(total).replace(/\.00$/, "")}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {people.length === 0 ? <span className="truncate text-[11px] text-muted md:text-xs">{none}</span> : (
            <>
              <span className="flex -space-x-1.5">{people.slice(0, 3).map((id) => <span key={id} className="rounded-full ring-2 ring-surface"><PersonGlyph name={nameOf(id)} id={id} size={18} /></span>)}</span>
              <span className="truncate text-[11px] text-muted md:text-xs">{nameOf(people[0])}{people.length > 1 ? ` +${people.length - 1}` : ""}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

function Pill({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", tone === "good" ? "bg-good-soft text-good" : "bg-danger/10 text-danger")}>{children}</span>;
}

/** Shown once after the first review is finished (the review page links here with ?reviewed=1). */
const acctIcon = { credit_card: CreditCard, bank: Landmark, upi: Smartphone, cash: Wallet, wallet: Wallet } as const;

export default function Dashboard() {
  const skipSetup = useDeviceFlag("pf-setup-open") === "1";
  const { live, demo, householdReady, meId, accounts, cardBills, today, trendHistory, records, shown, staged, scoped, settlements, ledgerRecords, month, categoryName, accountName, partner, groups, splitGroups, participants, activeGroup, groupSummary, monthRecords, recurring, recurringSuggestions, attributionOf, allocatedByKey, categories, saveCardBill, markRecurringPaid } = useStore();
  const [paying, setPaying] = useState<{ kind: "bill"; bill: BillStatus } | { kind: "recurring"; id: string; name: string } | null>(null);
  // Split cards show for anyone who splits with someone (a friend, family, a partner or a group), not only a linked partner.
  const others = participants.filter((p) => p.id !== meId);
  const withPeople = !live || others.length > 0 || splitGroups.length > 0;
  const nobodyYet = live && !withPeople;
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
  const prevAllocated = useMemo(() => summarizeGroup(shown.filter((r) => r.date.startsWith(prevMonth)), activeGroup, groups, meId).allocated, [shown, prevMonth, activeGroup, groups, meId]);
  const cats = useMemo(() => Object.entries(allocatedByKey((r) => r.categoryId)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: categoryName(key), value })), [allocatedByKey, categoryName]);
  const perAccount = useMemo(() => allocatedByKey((r) => r.accountId), [allocatedByKey]);
  const [allAccts, setAllAccts] = useState(false);
  const accountRootCount = accounts.filter((a) => !a.parentId || !accounts.some((x) => x.id === a.parentId)).filter((a) => scoped.some((r) => rootOf(accounts, r.accountId) === a.id)).length;
  const trend = useMemo(() => {
    const all = { ...byMonth(shown), ...trendHistory }; // in the sample, its stored monthly totals win over the few extra history rows
    return Object.keys(all).sort().map((m) => ({ key: m, label: new Date(m + "-01").toLocaleString("en", { month: "short" }), value: all[m] }));
  }, [shown, trendHistory]);
  const topMerchant = Object.entries(allocatedByKey((r) => r.merchant)).sort((a, b) => b[1] - a[1])[0];
  // Who owes whom, from the same ledger as the Split tab: friends and family count, not only a linked partner.
  const ledgers = useMemo(() => participants.filter((p) => p.id !== meId && !(live && partner && !partner.active && p.id === partner.participantId)).map((p) => personLedger(p.id, meId, ledgerRecords, settlements)), [participants, meId, ledgerRecords, settlements, live, partner]);
  const iOwe = ledgers.filter((l) => l.outstandingPaise < 0).map((l) => ({ from: meId, to: l.personId, outstanding: -l.outstandingPaise }));
  const owedToMe = ledgers.filter((l) => l.outstandingPaise > 0).map((l) => ({ from: l.personId, to: meId, outstanding: l.outstandingPaise }));
  const q = `month=${month}`;
  const prevKey = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
  const delta = live && !demo && prevAllocated > 0 ? Math.round(((groupSummary.allocated - prevAllocated) / prevAllocated) * 1000) / 10 : null;
  const dueBills = useMemo(() => upcomingBills(cardViews(accounts, cardBills, records, today)), [accounts, cardBills, records, today]);
  // The headline figures. Outflow is every record of the month on screen (all groups): transfers, card-bill payments and
  // excluded rows are not spending, and refunds subtract. My share follows the group lens and the existing split allocations.
  const outflow = useMemo(() => summarize(monthRecords, meId).net, [monthRecords, meId]);
  const progress = useMemo(() => verifyProgress(shown, month), [shown, month]);
  const attention = useMemo(() => needsAttention({ waiting: staged.length, bills: dueBills, recurring: recurring.filter((r) => r.item.direction !== "in"), uncategorized: monthRecords.filter((r) => r.categoryId === "uncategorized" && !r.voucherBrandId && r.status === "reviewed").length, suggestions: recurringSuggestions.length }), [staged.length, dueBills, recurring, monthRecords, recurringSuggestions.length]);
  // Checklists: every card with a bill (unpaid and soonest first), and this month's recurring payments (money going out, billed this month).
  const billRows = useMemo(() => cardViews(accounts, cardBills, records, today).flatMap((v) => (v.current ? [v.current] : [])).sort((a, b) => (a.state === "paid" ? 1 : 0) - (b.state === "paid" ? 1 : 0) || a.bill.dueDate.localeCompare(b.bill.dueDate)), [accounts, cardBills, records, today]);
  const recurringRows = useMemo(() => recurring.filter((r) => r.item.direction !== "in" && r.state !== "notdue" && r.state !== "ended").sort((a, b) => (a.state === "paid" ? 1 : 0) - (b.state === "paid" ? 1 : 0) || a.item.dueDay - b.item.dueDay), [recurring]);
  const iOweTotal = iOwe.reduce((s, b) => s + b.outstanding, 0);
  const owedTotal = owedToMe.reduce((s, b) => s + b.outstanding, 0);
  const prevName = new Date(`${prevKey}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });

  // The welcome guide is only for someone with no transactions at all (also after deleting everything, even if import history
  // remains). Once any transaction exists it gives way to the dashboard.
  if (live && householdReady && records.length + staged.length === 0 && !skipSetup) return <Onboarding onSkipAll={() => setDeviceFlag("pf-setup-open", "1")} />;
  if (scoped.length === 0) {
    return (
      <div className="space-y-4">
        {live && householdReady && <TodoCard />}
        {live && !householdReady && (
          <Card className="space-y-2 text-sm"><CardTitle>Setting up your space</CardTitle><p>Your data space is not ready yet. Reload in a moment; if this stays, open <Link href="/settings" className="text-accent underline-offset-2 hover:underline">Settings</Link>.</p></Card>
        )}
        <EmptyState art="transactions" title="No transactions this month" hint={live ? "Add a transaction, or pick another month." : "Pick September 2026 or import a statement."} />
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <TodoCard setup={live && householdReady} verify={progress.total > 0 ? { left: progress.left, total: progress.total, verified: progress.verified, pct: progress.pct, monthName: new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" }), elsewhere: staged.length > progress.left ? staged.length : 0, href: progress.left > 0 ? "/transactions?v=unverified" : "/transactions?v=verified" } : undefined} />

      {/* 2 and 3. Credit-card bills and recurring expenses, side by side. Paid ones move under "View all". */}
      <section aria-label="Bills, recurring expenses and who owes whom" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
        <ChecklistCard icon={CalendarClock} title="Card bills" href="/cards" empty="No bills tracked yet" addLabel="Add a bill"
          rows={billRows.map((b) => { const amt = formatINR(b.state === "paid" ? b.bill.totalDuePaise : b.remainingPaise).replace(".00", ""); const card = accounts.filter((x) => x.type === "credit_card" && !x.archived); return { key: b.bill.id, logo: <MerchantAvatar name={accountName(b.bill.accountId)} size={28} />, name: cardLabel(accountName(b.bill.accountId), card), nameLong: shortName(accountName(b.bill.accountId)), sub: amt, subLong: `${b.state === "overdue" ? "Overdue" : "Due " + prettyDay(b.bill.dueDate)} · ${amt}`, tone: b.state === "paid" ? "good" as const : b.state === "overdue" ? "bad" as const : b.daysLeft <= 3 ? "warn" as const : "info" as const, done: b.state === "paid", tickLabel: `Mark ${accountName(b.bill.accountId)} bill paid`, onTick: () => setPaying({ kind: "bill", bill: b }) }; })} />
        <ChecklistCard icon={Repeat} title="Recurring" href="/recurring" empty="Nothing due this month" addLabel="Add one"
          rows={recurringRows.map((r) => { const dueToday = r.item.dueDay === Number(today.slice(8, 10)) && month === today.slice(0, 7); const amt = `${r.estimated ? "~" : ""}${formatINR(r.state === "paid" && !r.marked ? r.actualPaise : r.expectedPaise).replace(".00", "")}`; const day = `${r.item.dueDay} ${new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}`; return { key: r.item.id, logo: <CategoryGlyph name={categoryName(r.item.categoryId)} size={28} icon={categories.find((c) => c.id === r.item.categoryId)?.icon} />, name: r.item.name.split(/\s+/)[0], nameLong: r.item.name, sub: amt, subLong: `${r.state === "overdue" ? "Overdue" : dueToday ? "Today" : "Due " + day} · ${amt}`, tone: r.state === "paid" ? "good" as const : r.state === "overdue" ? "bad" as const : dueToday ? "warn" as const : "info" as const, done: r.state === "paid", tickLabel: `Mark ${r.item.name} paid`, onTick: () => setPaying({ kind: "recurring", id: r.item.id, name: r.item.name }) }; })} />
        {nobodyYet && (
          <Card className="col-span-2 p-3 md:p-4 lg:col-span-1">
            <div className="mb-2 flex items-center gap-1.5"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><Handshake size={14} /></span><h2 className="text-sm font-semibold md:text-base">Split with others</h2></div>
            <p className="text-sm text-muted">Split a bill with a friend, family or a partner, or start a group for a trip or an outing.</p>
            <div className="mt-3 flex flex-wrap gap-2"><Link href="/people" className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-sm hover:bg-background">Add a person</Link><Link href="/groups?new=1" className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-sm hover:bg-background">Create a group</Link></div>
          </Card>
        )}
        {withPeople && (
          <Card className="col-span-2 p-3 md:p-4 lg:col-span-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold md:text-base"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden><Handshake size={14} /></span>Split</h2>
              <Link href="/people" className="inline-flex min-h-8 items-center text-xs font-medium text-accent md:text-sm">Open</Link>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <OweTile tone="out" label="I owe" total={iOweTotal} people={iOwe.map((b) => b.to)} none="Nobody" />
              <OweTile tone="in" label="I'm owed" total={owedTotal} people={owedToMe.map((b) => b.from)} none="Nobody" />
            </div>
            {splitGroups.some((g) => !g.archived) && <Link href="/groups" className="mt-2 flex min-h-9 items-center justify-between rounded-xl px-1 text-xs text-muted hover:text-foreground md:text-sm"><span>{splitGroups.filter((g) => !g.archived).length} group{splitGroups.filter((g) => !g.archived).length === 1 ? "" : "s"}</span><ChevronRight size={14} aria-hidden /></Link>}
          </Card>
        )}
      </section>

      {/* 5. Spending summary and category breakdown */}
      <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
      <Card className="space-y-3 bg-gradient-to-br from-surface via-surface to-accent/[0.06] p-4 ring-1 ring-black/[0.03]">
        <SectionHead icon={BarChart3} title="Spending overview" href={`/reports`} hrefLabel="Reports" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">Total outflow</div>
            <div className="num whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{formatINR(outflow)}</div>
            {delta !== null && <Pill tone={delta > 0 ? "bad" : "good"}>{delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(delta)}% vs {prevName}</Pill>}
          </div>
          <div>
            <div className="text-xs text-muted">My share of spending</div>
            <div className="num whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{formatINR(groupSummary.my)}</div>
            {activeGroup.kind !== "mine" && <div className="text-xs text-muted">{activeGroup.name}: {formatINR(groupSummary.allocated)}</div>}
          </div>
        </div>
        <p className="text-xs text-muted">Spending after refunds. Transfers and card-bill payments are not counted.</p>
        <DonutChart data={cats} total={groupSummary.allocated} href={(k) => `/transactions?${q}&category=${k}`} />
        <div className="rounded-xl bg-background p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Needs attention</span><span className={cn("num text-sm font-semibold", attention.length === 0 && "text-good")}>{attention.length === 0 ? "All clear" : attentionTotal(attention)}</span></div>
          {attention.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-1.5">{attention.map((x) => <li key={x.key}><Link href={x.href} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs hover:bg-surface/70"><span className={cn("size-2 rounded-full", x.tone === "bad" ? "bg-danger" : "bg-warn")} aria-hidden /><b className="num">{x.count}</b> {x.label}</Link></li>)}</ul>}
        </div>
      </Card>
        <Card>
          <CardTitle action={!live ? <Badge>Apr–Aug mock</Badge> : undefined}>Spending trend</CardTitle>
          <TrendChart data={trend} href={(k) => `/transactions?month=${k}`} />
        </Card>
      </div>

      {/* 6. Trends, recent transactions and other insights */}
      <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle action={<Link href={`/transactions?${q}`} className="text-xs text-accent">View all</Link>}>Recent transactions</CardTitle>
          <ul className="space-y-3">
            {[...scoped].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <MerchantAvatar name={r.merchant} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.merchant}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted">{r.date}<TxnBadges r={r} /></div>
                </div>
                <span className="text-right"><Amount r={r} />{(() => { const a = attributionOf(r); return a && a.allocatedPaise !== (r.kind === "refund" ? -r.amountPaise : r.amountPaise) ? <span className="num block text-xs text-muted">counts {formatINR(Math.abs(a.allocatedPaise))}</span> : null; })()}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="bg-accent-soft lg:col-span-1">
          <CardTitle>Accounts this month</CardTitle>
          <ul className="space-y-2">
            {(() => {
              const totalOf = (a: (typeof accounts)[number]) => (perAccount[a.id] ?? 0) + accounts.filter((c) => c.parentId === a.id && scoped.some((r) => r.accountId === c.id)).reduce((t, c) => t + (perAccount[c.id] ?? 0), 0);
              const roots = accounts.filter((a) => !a.parentId || !accounts.some((x) => x.id === a.parentId)).filter((a) => scoped.some((r) => rootOf(accounts, r.accountId) === a.id)).sort((x, y) => totalOf(y) - totalOf(x));
              return (allAccts ? roots : roots.slice(0, 3));
            })().map((a) => {
              const I = acctIcon[a.type];
              const kids = accounts.filter((c) => c.parentId === a.id && scoped.some((r) => r.accountId === c.id));
              const total = (perAccount[a.id] ?? 0) + kids.reduce((s, c) => s + (perAccount[c.id] ?? 0), 0);
              return (
                <li key={a.id}>
                  <Link href={`/transactions?${q}&account=${a.id}`} className="flex items-center gap-3 rounded-2xl bg-surface/70 p-3 hover:bg-surface">
                    {logoFor(a.name) ? <MerchantAvatar name={a.name} size={36} /> : <span className="grid size-9 place-items-center rounded-full bg-accent text-white" aria-hidden><I size={16} /></span>}
                    <span className="flex-1 text-sm font-medium">{accountName(a.id)}{kids.length > 0 && <span className="block text-xs font-normal text-muted">includes {kids.map((c) => c.name).join(", ")}</span>}</span>
                    <span className="num text-sm">{formatINR(total)}</span>
                  </Link>
                  {kids.length > 0 && (
                    <ul className="ml-8 mt-1 space-y-1 border-l-2 border-accent/20 pl-3">
                      {kids.map((c) => (
                        <li key={c.id}><Link href={`/transactions?${q}&account=${c.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-muted hover:bg-surface/70"><span className="flex-1">{c.name}</span><span className="num">{formatINR(perAccount[c.id] ?? 0)}</span></Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {accountRootCount > 3 && <button type="button" onClick={() => setAllAccts((v) => !v)} className="mt-2 flex min-h-9 w-full items-center justify-center rounded-xl bg-surface/70 text-sm font-medium text-accent">{allAccts ? "Show less" : `View all (+${accountRootCount - 3})`}</button>}
          <p className="mt-3 text-xs text-muted">Spending only. Card bill payments, transfers and income are excluded. {topMerchant && <>Top merchant: <b>{topMerchant[0]}</b>.</>}</p>
        </Card>
      </div>
      <ConfirmDialog open={!!paying} onClose={() => setPaying(null)} title="Mark as paid?" confirmLabel="Mark paid" onConfirm={() => { if (paying?.kind === "bill") saveCardBill({ ...paying.bill.bill, paid: true }); else if (paying?.kind === "recurring") markRecurringPaid(paying.id, month, true); }}>
        <p>{paying?.kind === "bill" ? `This marks the ${accountName(paying.bill.bill.accountId)} bill as paid in full.` : `This marks ${paying?.name} as paid for this month by hand. If you later link or import the real payment, that takes over.`}</p>
      </ConfirmDialog>
      {/* On a phone: every screen in one place at the bottom of the dashboard. */}
      <section aria-label="Everything in the app" className="space-y-2 md:hidden">
        <h2 className="px-1 text-sm font-medium text-muted">Everything in the app</h2>
        <ul className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => n.href !== "/").map(({ href, label, icon: I }) => (
            <li key={href}><Link href={href} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface p-2 text-center text-xs"><I size={20} aria-hidden className="text-accent" /><span className="leading-tight">{label}</span></Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
