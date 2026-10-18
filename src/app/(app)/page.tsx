"use client";
import { CreditCard, Landmark, Smartphone, TrendingDown, TrendingUp, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { DonutChart, TrendChart } from "@/components/charts";
import { Onboarding } from "@/components/onboarding";
import { MerchantAvatar, TxnBadges, Amount } from "@/components/txn-row";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { byCategory, byMerchant, byMonth, groupNet, summarize } from "@/domain/reports";
import { cn } from "@/lib/cn";
import { logoFor } from "@/lib/logos";

function Kpi({ icon: I, label, value, sub, pill, href }: { icon: LucideIcon; label: string; value: string; sub: string; pill?: ReactNode; href?: string }) {
  const body = (
    <Card className="h-full p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted sm:text-sm sm:text-foreground">{label}</div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background sm:size-10" aria-hidden><I size={16} /></span>
      </div>
      <div className="num mt-2 truncate text-lg font-semibold tracking-tight sm:mt-3 sm:text-xl">{value}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{sub}{pill}</div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-[var(--radius-card)] transition-shadow hover:shadow-md">{body}</Link> : body;
}

function Pill({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", tone === "good" ? "bg-good-soft text-good" : "bg-danger/10 text-danger")}>{children}</span>;
}

const acctIcon = { credit_card: CreditCard, bank: Landmark, upi: Smartphone, cash: Wallet } as const;

export default function Dashboard() {
  const { live, householdReady, meId, accounts, trendHistory, records, staged, scoped, summary, balances, month, view, categoryName, nameOf, accountName, setView } = useStore();
  const household = useMemo(() => summarize(records.filter((r) => r.date.startsWith(month)), meId), [records, month, meId]);
  const cats = useMemo(() => Object.entries(byCategory(scoped)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: categoryName(key), value })), [scoped, categoryName]);
  const perAccount = useMemo(() => groupNet(scoped, (r) => r.accountId), [scoped]);
  const trend = useMemo(() => {
    const all = { ...trendHistory, ...byMonth(records) };
    return Object.keys(all).sort().map((m) => ({ key: m, label: new Date(m + "-01").toLocaleString("en", { month: "short" }), value: all[m] }));
  }, [records, trendHistory]);
  const topMerchant = Object.entries(byMerchant(scoped)).sort((a, b) => b[1] - a[1])[0];
  const iOwe = balances.filter((b) => b.from === meId && b.outstanding > 0);
  const owedToMe = balances.filter((b) => b.to === meId && b.outstanding > 0);
  const q = `month=${month}`;
  const prevKey = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
  const prev = byMonth(records)[prevKey] ?? trendHistory[prevKey];
  const delta = prev && prev > 0 ? Math.round(((household.net - prev) / prev) * 1000) / 10 : null;
  const prevName = new Date(`${prevKey}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });

  if (live && householdReady && records.length === 0) return <Onboarding />;
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Net spending" value={formatINR(summary.net)} sub="after refunds" href={`/transactions?${q}`}
          pill={delta !== null && <Pill tone={delta > 0 ? "bad" : "good"}>{delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(delta)}% vs {prevName}{live ? "" : " (mock)"}</Pill>} />
        <Kpi icon={UserRound} label="My share" value={formatINR(summary.myShare)} sub="what I ultimately bear" />
        <Kpi icon={Users} label="All spending" value={formatINR(household.net)} sub={`Shared ${formatINR(summary.sharedNet)}`} href={`/transactions?${q}&shared=1`} />
        <Kpi icon={TrendingDown} label="Refunds & review" value={`−${formatINR(summary.refunds)}`} sub={`${staged.length} awaiting review`} href="/review"
          pill={staged.length > 0 && <Pill tone="bad">Review</Pill>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-accent-soft">
          <CardTitle>Accounts this month</CardTitle>
          <ul className="space-y-2">
            {accounts.filter((a) => scoped.some((r) => r.accountId === a.id)).map((a) => {
              const I = acctIcon[a.type];
              return (
                <li key={a.id}>
                  <Link href={`/transactions?${q}&account=${a.id}`} className="flex items-center gap-3 rounded-2xl bg-surface/70 p-3 hover:bg-surface">
                    {logoFor(a.name) ? <MerchantAvatar name={a.name} size={36} /> : <span className="grid size-9 place-items-center rounded-full bg-accent text-white" aria-hidden><I size={16} /></span>}
                    <span className="flex-1 text-sm font-medium">{accountName(a.id)}</span>
                    <span className="num text-sm">{formatINR(perAccount[a.id] ?? 0)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Spending only. Card bill payments, transfers and income are excluded. {topMerchant && <>Top merchant: <b>{topMerchant[0]}</b>.</>}</p>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle action={!live ? <Badge>Apr–Aug mock</Badge> : undefined}>Net spending trend</CardTitle>
          <TrendChart data={trend} href={(k) => `/transactions?month=${k}`} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Expense breakdown</CardTitle>
          <DonutChart data={cats} total={summary.net} href={(k) => `/transactions?${q}&category=${k}`} />
          <p className="mt-3 text-xs text-muted">Purchase total ≠ my share ≠ money paid. My share: {formatINR(summary.myShare)}.</p>
        </Card>
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
                <Amount r={r} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle action={<Link href="/settlements" className="text-xs text-accent">Details</Link>}>Settlements</CardTitle>
          <ul className="space-y-3">
            {iOwe.map((b) => <li key={b.to} className="flex items-center gap-3 text-sm"><MerchantAvatar name={nameOf(b.to)} /><span className="flex-1">I owe {nameOf(b.to)}</span><span className="num font-semibold text-danger">{formatINR(b.outstanding)}</span></li>)}
            {owedToMe.map((b) => <li key={b.from} className="flex items-center gap-3 text-sm"><MerchantAvatar name={nameOf(b.from)} /><span className="flex-1">{nameOf(b.from)} owes me</span><span className="num font-semibold text-good">{formatINR(b.outstanding)}</span></li>)}
          </ul>
          {iOwe.length + owedToMe.length === 0 && <p className="text-sm text-muted">All settled up.</p>}
        </Card>
      </div>
      {view === "personal" && <button className="text-xs text-muted underline" onClick={() => setView("household")}>Show everything</button>}
    </div>
  );
}
