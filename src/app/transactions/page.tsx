"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Amount, TxnBadges, TxnCard } from "@/components/txn-row";
import { TxnEditDialog } from "@/components/txn-edit-dialog";
import { Badge, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { accounts, categories, ME } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { summarize } from "@/domain/reports";
import type { ExpenseRecord } from "@/domain/types";

function TransactionsView() {
  const { records, scoped, month, nameOf, categoryName, accountName } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);

  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`/transactions?${p.toString()}`);
  };

  const rows = useMemo(() => {
    const m = params.get("month");
    const base = m ? records.filter((r) => r.date.startsWith(m)) : scoped;
    const text = (params.get("q") ?? "").trim().toLowerCase();
    return base
      .filter((r) => !get("category") || r.categoryId === get("category"))
      .filter((r) => !get("merchant") || r.merchant === get("merchant"))
      .filter((r) => !get("status") || r.status === get("status"))
      .filter((r) => !get("kind") || r.kind === get("kind"))
      .filter((r) => !get("account") || r.accountId === get("account"))
      .filter((r) => !get("shared") || r.shared === (get("shared") === "1"))
      .filter((r) => !text || `${r.merchant} ${r.originalDescription} ${r.notes ?? ""}`.toLowerCase().includes(text))
      .sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, scoped, params]);

  const total = summarize(rows, ME);
  const active = ["q", "category", "merchant", "status", "kind", "account", "shared"].filter((k) => get(k));

  return (
    <>
      <PageHeader title="Transactions" sub={`${rows.length} records · ${get("month") || month}`} />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Input className="col-span-2" placeholder="Search merchant, description, notes" aria-label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        <Select aria-label="Category" value={get("category")} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Type" value={get("kind")} onChange={(e) => set("kind", e.target.value)}>
          <option value="">All types</option>{["purchase", "refund", "income", "transfer", "cc_payment", "fee"].map((k) => <option key={k}>{k}</option>)}
        </Select>
        <Select aria-label="Account" value={get("account")} onChange={(e) => set("account", e.target.value)}>
          <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Status" value={get("status")} onChange={(e) => set("status", e.target.value)}>
          <option value="">Any status</option><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option>
        </Select>
      </div>
      {active.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          {active.map((k) => <Badge key={k} tone="good">{k}: {k === "category" ? categoryName(get(k)) : get(k)}</Badge>)}
          <button className="text-muted underline" onClick={() => router.replace(`/transactions${get("month") ? `?month=${get("month")}` : ""}`)}>Clear filters</button>
        </div>
      )}
      {rows.length === 0 ? <EmptyState title="No transactions match" hint="Try clearing a filter." /> : (
        <>
          <div className="space-y-2 md:hidden">{rows.map((r) => <TxnCard key={r.id} r={r} onClick={() => setEditing(r)} />)}</div>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background text-left text-xs text-muted">
                <tr><th className="p-2.5">Date</th><th>Merchant</th><th>Category</th><th>Paid by</th><th>Account</th><th className="text-right">Amount</th><th className="pr-2.5 text-right">My share</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setEditing(r)} className="cursor-pointer border-b border-border last:border-0 hover:bg-background">
                    <td className="num p-2.5 text-muted">{r.date.slice(5)}</td>
                    <td><div className="font-medium">{r.merchant}</div><div className="mt-0.5 flex flex-wrap gap-1"><TxnBadges r={r} /></div></td>
                    <td>{categoryName(r.categoryId)}</td><td>{nameOf(r.payerId)}</td><td className="text-muted">{accountName(r.accountId)}</td>
                    <td className="text-right"><Amount r={r} /></td>
                    <td className="num pr-2.5 text-right text-muted">{summarize([r], ME).myShare ? formatINR(summarize([r], ME).myShare) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="num mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
            <span className="text-muted">Net spending in list</span><b>{formatINR(total.net)}</b>
            <span className="text-muted">My share</span><b>{formatINR(total.myShare)}</b>
          </div>
        </>
      )}
      <TxnEditDialog record={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}><TransactionsView /></Suspense>;
}
