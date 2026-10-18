"use client";
import Link from "next/link";
import { useMemo } from "react";
import { BarsChart } from "@/components/charts";
import { TxnCard } from "@/components/txn-row";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { trendHistory } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { byCategory, byMerchant, byMonth, summarize } from "@/domain/reports";
import { ME } from "@/data/mock";

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="num text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-md p-1 hover:bg-background">{body}</Link> : body;
}

export default function Dashboard() {
  const { records, scoped, summary, balances, month, view, categoryName, nameOf, setView } = useStore();
  const household = useMemo(() => summarize(records.filter((r) => r.date.startsWith(month)), ME), [records, month]);
  const cats = useMemo(() => Object.entries(byCategory(scoped)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: categoryName(key), value })), [scoped, categoryName]);
  const merchants = useMemo(() => Object.entries(byMerchant(scoped)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6), [scoped]);
  const trend = useMemo(() => {
    const all = { ...trendHistory, ...byMonth(records) };
    return Object.keys(all).sort().map((m) => ({ key: m, label: new Date(m + "-01").toLocaleString("en", { month: "short" }), value: all[m] }));
  }, [records]);
  const iOwe = balances.filter((b) => b.from === ME && b.outstanding > 0);
  const owedToMe = balances.filter((b) => b.to === ME && b.outstanding > 0);
  const q = `month=${month}`;

  if (scoped.length === 0) return (<><PageHeader title="Dashboard" /><EmptyState title="No transactions this month" hint="Pick September 2026 or import a statement." /></>);

  return (
    <>
      <PageHeader title="Dashboard" sub={view === "household" ? "Household view" : "Personal view: items you paid for or share in"} actions={<Badge>Mock data</Badge>} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Net spending" value={formatINR(summary.net)} sub="after refunds" href={`/transactions?${q}`} />
            <Stat label="My share" value={formatINR(summary.myShare)} sub="what I ultimately bear" />
            <Stat label="Household spending" value={formatINR(household.net)} sub="all members" />
            <Stat label="Unreviewed" value={String(summary.unreviewed)} sub="imported rows" href={`/transactions?${q}&status=unreviewed`} />
          </div>
          <dl className="num mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Purchases (gross)</dt><dd>{formatINR(summary.grossPurchases)}</dd></div>
            <div><dt className="text-xs text-muted">Refunds</dt><dd>−{formatINR(summary.refunds)}</dd></div>
            <div><dt className="text-xs text-muted">Shared</dt><dd><Link className="underline-offset-2 hover:underline" href={`/transactions?${q}&shared=1`}>{formatINR(summary.sharedNet)}</Link></dd></div>
            <div><dt className="text-xs text-muted">Personal</dt><dd><Link className="underline-offset-2 hover:underline" href={`/transactions?${q}&shared=0`}>{formatINR(summary.personalNet)}</Link></dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">Total purchase amount ≠ my share ≠ money I paid. Card bill payments, transfers and income are not counted.</p>
        </Card>
        <Card>
          <CardTitle action={<Link href="/settlements" className="text-xs text-accent">Details</Link>}>Settlements</CardTitle>
          {[...iOwe].map((b) => <div key={b.to} className="flex justify-between py-1 text-sm"><span>I owe {nameOf(b.to)}</span><span className="num font-medium text-danger">{formatINR(b.outstanding)}</span></div>)}
          {owedToMe.map((b) => <div key={b.from} className="flex justify-between py-1 text-sm"><span>{nameOf(b.from)} owes me</span><span className="num font-medium text-accent">{formatINR(b.outstanding)}</span></div>)}
          {iOwe.length + owedToMe.length === 0 && <p className="text-sm text-muted">All settled up.</p>}
        </Card>
        <Card className="md:col-span-2">
          <CardTitle>Spending by category (select a bar)</CardTitle>
          <BarsChart horizontal height={Math.max(180, cats.length * 30)} data={cats} href={(k) => `/transactions?${q}&category=${k}`} />
        </Card>
        <Card>
          <CardTitle>Top merchants</CardTitle>
          <ul className="space-y-1">
            {merchants.map(([m, v]) => (
              <li key={m}><Link href={`/transactions?${q}&merchant=${encodeURIComponent(m)}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-background"><span>{m}</span><span className="num">{formatINR(v)}</span></Link></li>
            ))}
          </ul>
        </Card>
        <Card className="md:col-span-3">
          <CardTitle>Net spending trend (Apr–Aug are static mock values)</CardTitle>
          <BarsChart data={trend} href={(k) => `/transactions?month=${k}`} height={180} />
        </Card>
        <Card className="md:col-span-3">
          <CardTitle action={<Link href={`/transactions?${q}`} className="text-xs text-accent">All</Link>}>Recent transactions</CardTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {[...scoped].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((r) => <TxnCard key={r.id} r={r} />)}
          </div>
        </Card>
      </div>
      {view === "personal" && <button className="mt-3 text-xs text-muted underline" onClick={() => setView("household")}>Back to household view</button>}
    </>
  );
}
