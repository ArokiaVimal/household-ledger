"use client";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarsChart, DonutChart } from "@/components/charts";
import { Card, CardTitle, EmptyState, PageHeader, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { ExpenseRecord } from "@/domain/types";

const TABS = [["overview", "Overview"], ["categories", "Categories"], ["merchants", "Merchants"], ["ai", "AI insights"]] as const;
type Tab = (typeof TABS)[number][0];
const SHOWN = 6;

/** A ranked list: each row has its name, a small share, the amount, and a thin bar sized against the biggest row. Shows 6 rows until "Show all". */
function RankList({ rows, pct, onPick, foot }: { rows: [string, string, number][]; pct?: (v: number) => number; onPick: (key: string) => void; foot?: { label: string; value: number } }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...rows.map(([, , v]) => Math.abs(v)));
  const list = all ? rows : rows.slice(0, SHOWN);
  return (
    <div>
      <ul>
        {list.map(([k, name, v]) => (
          <li key={k} className="border-b border-border last:border-0">
            <button type="button" onClick={() => onPick(k)} className="num block w-full py-2 text-left hover:bg-background">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {pct && <span className="text-[11px] text-muted">{pct(v)}%</span>}
                <span>{formatINR(v)}</span>
              </span>
              <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-border"><span className={cn("block h-full rounded-full", v < 0 ? "bg-good" : "bg-accent")} style={{ width: `${(Math.abs(v) / max) * 100}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <button type="button" onClick={() => setAll((x) => !x)} className="mt-1 flex min-h-9 w-full items-center justify-center rounded-xl bg-background text-sm font-medium text-accent">{all ? "Show less" : `Show all (+${rows.length - SHOWN})`}</button>}
      {foot && <div className="num mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold"><span>{foot.label}</span><span>{formatINR(foot.value)}</span></div>}
    </div>
  );
}

export default function Reports() {
  const { scoped, records, month, categoryName, accounts, trendHistory, live, activeGroup, attributionOf, groupRecords } = useStore();
  const router = useRouter();
  const [acct, setAcct] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const rows = useMemo(() => scoped.filter((r) => !acct || r.accountId === acct), [scoped, acct]);
  // Every figure is what counts in the group on screen (allocated shares), so overlapping groups never inflate each other.
  const allocated = (key: (r: ExpenseRecord) => string) => { const out: Record<string, number> = {}; for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + (attributionOf(r)?.allocatedPaise ?? 0); return out; };
  const s = { net: rows.reduce((t, r) => t + (attributionOf(r)?.allocatedPaise ?? 0), 0) };
  const cats = Object.entries(allocated((r) => r.categoryId)).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const merchants = Object.entries(allocated((r) => r.merchant)).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const year = useMemo(() => {
    const months = [...new Set(records.map((r) => r.date.slice(0, 7)))];
    const own = Object.fromEntries(months.map((m) => [m, groupRecords(m).reduce((t, r) => t + (attributionOf(r)?.allocatedPaise ?? 0), 0)]));
    const all = { ...own, ...(activeGroup.kind === "mine" ? trendHistory : {}) };
    return Object.keys(all).sort().map((m) => ({ key: m, label: m.slice(5), value: all[m] }));
  }, [records, trendHistory, groupRecords, attributionOf, activeGroup.kind]);
  const link = (extra: string) => router.push(`/transactions?month=${month}${acct ? `&account=${acct}` : ""}${extra}`);

  return (
    <>
      <PageHeader title="Reports" sub={`${month} · ${activeGroup.name} · same calculations as the dashboard`} actions={
        <Select aria-label="Account" value={acct} onChange={(e) => setAcct(e.target.value)}><option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>} />
      {rows.length === 0 ? <EmptyState title="Nothing to report" /> : (
        <>
          <div role="tablist" aria-label="Report" className="mb-3 flex overflow-x-auto rounded-full bg-border/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:max-w-xl">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("min-h-9 flex-1 whitespace-nowrap rounded-full px-2 text-[13px] transition-all md:px-3 md:text-sm", tab === id ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground")}>{label}</button>
            ))}
          </div>
          {tab === "overview" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardTitle>Where it went</CardTitle>
                <DonutChart data={cats.filter(([, v]) => v > 0).map(([key, value]) => ({ key, label: categoryName(key), value }))} total={s.net} href={(k) => `/transactions?month=${month}${acct ? `&account=${acct}` : ""}&category=${k}`} />
              </Card>
              <Card>
                <CardTitle>{live ? `${activeGroup.name}: spending by month` : "Year to date, net (earlier months are mock values)"}</CardTitle>
                <BarsChart data={year} href={(k) => `/transactions?month=${k}`} height={180} />
              </Card>
            </div>
          )}
          {tab === "categories" && (
            <Card>
              <CardTitle>Category breakdown</CardTitle>
              <RankList rows={cats.map(([k, v]) => [k, categoryName(k), v])} pct={(v) => (s.net ? Math.round((v / s.net) * 100) : 0)} onPick={(k) => link(`&category=${k}`)} foot={{ label: "Net total", value: s.net }} />
            </Card>
          )}
          {tab === "merchants" && (
            <Card>
              <CardTitle>Merchants</CardTitle>
              <RankList rows={merchants.map(([m, v]) => [m, m, v])} onPick={(m) => link(`&merchant=${encodeURIComponent(m)}`)} />
            </Card>
          )}
          {tab === "ai" && (
            <Link href="/insights" className="flex items-center gap-3 rounded-[var(--radius-card)] bg-gradient-to-br from-accent/10 via-surface to-surface p-4 ring-1 ring-accent/20 transition-shadow hover:shadow-md">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white"><Sparkles size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">AI insights for {new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" })}</span><span className="block text-sm text-muted">Tips and a plain-English look at your month. Only runs when you ask.</span></span>
              <span className="text-sm font-medium text-accent">Open</span>
            </Link>
          )}
        </>
      )}
    </>
  );
}
