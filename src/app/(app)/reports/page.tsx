"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarsChart } from "@/components/charts";
import { Card, CardTitle, EmptyState, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { byCategory, byMerchant, byMonth, summarize } from "@/domain/reports";

export default function Reports() {
  const { scoped, records, month, categoryName, meId, accounts, trendHistory, live } = useStore();
  const router = useRouter();
  const [acct, setAcct] = useState("");
  const rows = useMemo(() => scoped.filter((r) => !acct || r.accountId === acct), [scoped, acct]);
  const s = summarize(rows, meId);
  const cats = Object.entries(byCategory(rows)).sort((a, b) => b[1] - a[1]);
  const merchants = Object.entries(byMerchant(rows)).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const year = useMemo(() => {
    const all = { ...trendHistory, ...byMonth(records) };
    return Object.keys(all).sort().map((m) => ({ key: m, label: m.slice(5), value: all[m] }));
  }, [records, trendHistory]);
  const link = (extra: string) => router.push(`/transactions?month=${month}${acct ? `&account=${acct}` : ""}${extra}`);

  return (
    <>
      <PageHeader title="Reports" sub={`${month} · same calculations as the dashboard`} actions={
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
            <CardTitle>{live ? "Net spending by month" : "Year to date, net (earlier months are mock values)"}</CardTitle>
            <BarsChart data={year} href={(k) => `/transactions?month=${k}`} height={180} />
          </Card>
        </div>
      )}
    </>
  );
}
