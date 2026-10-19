"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarsChart } from "@/components/charts";
import { Card, CardTitle, EmptyState, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { ExpenseRecord } from "@/domain/types";

export default function Reports() {
  const { scoped, records, month, categoryName, accounts, trendHistory, live, activeGroup, attributionOf, groupRecords } = useStore();
  const router = useRouter();
  const [acct, setAcct] = useState("");
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
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardTitle>Category breakdown</CardTitle>
            <table className="num w-full text-sm"><tbody>
              {cats.map(([k, v]) => (
                <tr key={k} className="cursor-pointer border-b border-border last:border-0 hover:bg-background" onClick={() => link(`&category=${k}`)}>
                  <td className="py-1.5">{categoryName(k)}</td><td className="text-right text-muted">{s.net ? Math.round((v / s.net) * 100) : 0}%</td><td className="text-right">{formatINR(v)}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="pt-2">Net total</td><td /><td className="pt-2 text-right">{formatINR(s.net)}</td></tr>
            </tbody></table>
          </Card>
          <Card>
            <CardTitle>Merchants</CardTitle>
            <table className="num w-full text-sm"><tbody>
              {merchants.map(([m, v]) => <tr key={m} className="cursor-pointer border-b border-border last:border-0 hover:bg-background" onClick={() => link(`&merchant=${encodeURIComponent(m)}`)}><td className="py-1.5">{m}</td><td className="text-right">{formatINR(v)}</td></tr>)}
            </tbody></table>
          </Card>
          <Card className="md:col-span-2">
            <CardTitle>{live ? `${activeGroup.name}: spending by month` : "Year to date, net (earlier months are mock values)"}</CardTitle>
            <BarsChart data={year} href={(k) => `/transactions?month=${k}`} height={180} />
          </Card>
        </div>
      )}
    </>
  );
}
