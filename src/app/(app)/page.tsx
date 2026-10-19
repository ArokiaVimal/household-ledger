"use client";
import { AlertCircle, ChevronRight, ClipboardCheck, CreditCard, Landmark, Smartphone, Sparkles, TrendingDown, TrendingUp, UserRound, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
import { DonutChart, TrendChart } from "@/components/charts";
import { Onboarding } from "@/components/onboarding";
import { MerchantAvatar, TxnBadges, Amount } from "@/components/txn-row";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { useStore } from "@/data/store";
import { cardViews, dueLabel, upcomingBills } from "@/domain/cardbills";
import { NAV } from "@/components/nav-items";
import { rootOf } from "@/domain/accounts";
import { formatINR } from "@/domain/money";
import { byMonth } from "@/domain/reports";
import { summarizeGroup } from "@/domain/groups";
import { attentionTotal, needsAttention } from "@/domain/attention";
import { summarize } from "@/domain/reports";
import { cn } from "@/lib/cn";
import { logoFor } from "@/lib/logos";

function BigFigure({ icon: I, label, value, sub, pill, href }: { icon: LucideIcon; label: string; value: string; sub: string; pill?: ReactNode; href?: string }) {
  const body = (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2"><div className="text-sm font-medium text-muted">{label}</div><span className="grid size-9 shrink-0 place-items-center rounded-full bg-background" aria-hidden><I size={16} /></span></div>
      <div className="num mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{sub}{pill}</div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-[var(--radius-card)] transition-shadow hover:shadow-md">{body}</Link> : body;
}

function Pill({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", tone === "good" ? "bg-good-soft text-good" : "bg-danger/10 text-danger")}>{children}</span>;
}

/** Shown once after the first review is finished (the review page links here with ?reviewed=1). */
function ReviewedNotice() {
  if (!useSearchParams().get("reviewed")) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-good-soft px-4 py-3 text-sm text-good">
      <span className="min-w-0 flex-1"><b>All caught up.</b> Everything you approved now counts, and this is your dashboard.</span>
      <Link href="/" className="shrink-0 rounded-full bg-good px-3.5 py-1.5 text-xs font-medium text-white">Dismiss</Link>
    </div>
  );
}

const acctIcon = { credit_card: CreditCard, bank: Landmark, upi: Smartphone, cash: Wallet, wallet: Wallet } as const;

export default function Dashboard() {
  const { live, householdReady, meId, accounts, cardBills, today, trendHistory, records, shown, staged, scoped, balances, month, categoryName, nameOf, accountName, partner, groups, activeGroup, groupSummary, monthRecords, recurring, recurringSuggestions, attributionOf, allocatedByKey } = useStore();
  const withPartner = !live || !!partner;
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
  const prevAllocated = useMemo(() => summarizeGroup(shown.filter((r) => r.date.startsWith(prevMonth)), activeGroup, groups, meId).allocated, [shown, prevMonth, activeGroup, groups, meId]);
  const cats = useMemo(() => Object.entries(allocatedByKey((r) => r.categoryId)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: categoryName(key), value })), [allocatedByKey, categoryName]);
  const perAccount = useMemo(() => allocatedByKey((r) => r.accountId), [allocatedByKey]);
  const trend = useMemo(() => {
    const all = { ...byMonth(shown), ...trendHistory }; // in the sample, its stored monthly totals win over the few extra history rows
    return Object.keys(all).sort().map((m) => ({ key: m, label: new Date(m + "-01").toLocaleString("en", { month: "short" }), value: all[m] }));
  }, [shown, trendHistory]);
  const topMerchant = Object.entries(allocatedByKey((r) => r.merchant)).sort((a, b) => b[1] - a[1])[0];
  const iOwe = balances.filter((b) => b.from === meId && b.outstanding > 0);
  const owedToMe = balances.filter((b) => b.to === meId && b.outstanding > 0);
  const q = `month=${month}`;
  const prevKey = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
  const delta = live && prevAllocated > 0 ? Math.round(((groupSummary.allocated - prevAllocated) / prevAllocated) * 1000) / 10 : null;
  const dueBills = useMemo(() => upcomingBills(cardViews(accounts, cardBills, records, today)), [accounts, cardBills, records, today]);
  // The headline figures. Outflow is every record of the month on screen (all groups): transfers, card-bill payments and
  // excluded rows are not spending, and refunds subtract. My share follows the group lens and the existing split allocations.
  const outflow = useMemo(() => summarize(monthRecords, meId).net, [monthRecords, meId]);
  const attention = useMemo(() => needsAttention({ waiting: staged.length, bills: dueBills, recurring: recurring.filter((r) => r.item.direction !== "in"), uncategorized: monthRecords.filter((r) => r.categoryId === "uncategorized" && r.status === "reviewed").length, suggestions: recurringSuggestions.length }), [staged.length, dueBills, recurring, monthRecords, recurringSuggestions.length]);
  const prevName = new Date(`${prevKey}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });

  // The welcome guide is only for someone with no transactions at all (also after deleting everything, even if import history
  // remains). Once any transaction exists it gives way to the dashboard.
  if (live && householdReady && records.length + staged.length === 0) return <Onboarding />;
  if (scoped.length === 0) {
    return (
      <div className="space-y-4">
        {live && !householdReady && (
          <Card className="space-y-2 text-sm"><CardTitle>Setting up your space</CardTitle><p>Your data space is not ready yet. Reload in a moment; if this stays, open <Link href="/settings" className="text-accent underline-offset-2 hover:underline">Settings</Link>.</p></Card>
        )}
        <EmptyState title="No transactions this month" hint={live ? "Add a transaction, or pick another month." : "Pick September 2026 or import a statement."} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={null}><ReviewedNotice /></Suspense>
      {staged.length > 0 && (
        <Link href="/review" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] bg-accent px-4 py-3 text-white shadow-md transition-transform active:scale-[0.99]">
          <ClipboardCheck size={22} aria-hidden />
          <span className="min-w-0 flex-1"><span className="block text-base font-semibold">Review now</span><span className="block text-sm text-white/80">{staged.length} transaction{staged.length === 1 ? "" : "s"} waiting. Nothing counts until you approve it.</span></span>
          <ChevronRight size={20} aria-hidden />
        </Link>
      )}

      <section aria-label="This month at a glance" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <BigFigure label="Total household outflow" value={formatINR(outflow)} sub="Spending after refunds. Transfers and card-bill payments are not counted." href={`/transactions?${q}`} icon={Wallet}
          pill={delta !== null && <Pill tone={delta > 0 ? "bad" : "good"}>{delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(delta)}% vs {prevName}{live ? "" : " (mock)"}</Pill>} />
        <BigFigure label="My share of spending" value={formatINR(groupSummary.my)} sub={groupSummary.onBehalf !== 0 ? `${activeGroup.name} counts ${formatINR(groupSummary.allocated)}, including ${formatINR(groupSummary.onBehalf)} paid for others` : `What I ultimately bear${activeGroup.kind === "mine" ? "" : ` (${activeGroup.name} counts ${formatINR(groupSummary.allocated)})`}`} icon={UserRound} />
        <Card className="flex h-full flex-col p-4">
          <div className="flex items-start justify-between gap-2"><div className="text-sm font-medium text-muted">Needs attention</div><span className="grid size-9 shrink-0 place-items-center rounded-full bg-background" aria-hidden><AlertCircle size={16} /></span></div>
          <div className={cn("num mt-2 text-3xl font-semibold tracking-tight", attention.length === 0 ? "text-good" : attentionTotal(attention) > 0 ? "" : "")}>{attention.length === 0 ? "All clear" : attentionTotal(attention)}</div>
          {attention.length === 0 ? <p className="mt-1 text-xs text-muted">Nothing is overdue or waiting.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{attention.map((x) => <li key={x.key}><Link href={x.href} className="flex items-center gap-2 rounded-lg py-0.5 hover:underline"><span className={cn("size-2 shrink-0 rounded-full", x.tone === "bad" ? "bg-danger" : "bg-warn")} aria-hidden /><b className="num">{x.count}</b> {x.label}</Link></li>)}</ul>
          )}
        </Card>
      </section>

      {dueBills.length > 0 && (
        <Card>
          <CardTitle action={<Link href="/cards" className="text-xs text-accent">All card bills</Link>}>Card bills to pay</CardTitle>
          <ul className="divide-y divide-border">
            {dueBills.slice(0, 3).map((b) => (
              <li key={b.bill.id}>
                <Link href="/cards" className="flex items-center gap-3 py-2.5">
                  <MerchantAvatar name={accounts.find((a) => a.id === b.bill.accountId)?.name ?? "Card"} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{accounts.find((a) => a.id === b.bill.accountId)?.name}</span><span className={`block text-xs ${b.state === "overdue" ? "font-medium text-danger" : "text-muted"}`}>{dueLabel(b.daysLeft)}</span></span>
                  <span className="num text-sm font-semibold">{formatINR(b.remainingPaise)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardTitle>Expense breakdown</CardTitle>
          <DonutChart data={cats} total={groupSummary.allocated} href={(k) => `/transactions?${q}&category=${k}`} />
          <p className="mt-3 text-xs text-muted">Amounts count what belongs to {activeGroup.name}: allocated shares, not the full bill. Paid by me {formatINR(groupSummary.paid)}, my share {formatINR(groupSummary.my)}.</p>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle action={!live ? <Badge>Apr–Aug mock</Badge> : undefined}>Spending trend</CardTitle>
          <TrendChart data={trend} href={(k) => `/transactions?month=${k}`} />
        </Card>
      </div>

      <Link href="/insights" className="flex items-center gap-3 rounded-[var(--radius-card)] bg-gradient-to-br from-accent/10 via-surface to-surface p-4 ring-1 ring-accent/20 transition-shadow hover:shadow-md">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white"><Sparkles size={18} /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium">AI insights for {new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" })}</span><span className="block text-sm text-muted">Tips and a plain-English look at your month. Only runs when you ask.</span></span>
        <span className="text-sm font-medium text-accent">Open</span>
      </Link>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-accent-soft lg:col-span-1">
          <CardTitle>Accounts this month</CardTitle>
          <ul className="space-y-2">
            {accounts.filter((a) => !a.parentId || !accounts.some((x) => x.id === a.parentId)).filter((a) => scoped.some((r) => rootOf(accounts, r.accountId) === a.id)).map((a) => {
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
          <p className="mt-3 text-xs text-muted">Spending only. Card bill payments, transfers and income are excluded. {topMerchant && <>Top merchant: <b>{topMerchant[0]}</b>.</>}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
        {withPartner && <Card>
          <CardTitle action={<Link href="/people" className="text-xs text-accent">Details</Link>}>Settlements</CardTitle>
          <ul className="space-y-3">
            {iOwe.map((b) => <li key={b.to} className="flex items-center gap-3 text-sm"><MerchantAvatar name={nameOf(b.to)} /><span className="flex-1">I owe {nameOf(b.to)}</span><span className="num font-semibold text-danger">{formatINR(b.outstanding)}</span></li>)}
            {owedToMe.map((b) => <li key={b.from} className="flex items-center gap-3 text-sm"><MerchantAvatar name={nameOf(b.from)} /><span className="flex-1">{nameOf(b.from)} owes me</span><span className="num font-semibold text-good">{formatINR(b.outstanding)}</span></li>)}
          </ul>
          {iOwe.length + owedToMe.length === 0 && <p className="text-sm text-muted">All settled up.</p>}
        </Card>}
      </div>
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
