"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Amount, MerchantAvatar, TxnBadges, TxnCard } from "@/components/txn-row";
import { TxnEditDialog } from "@/components/txn-edit-dialog";
import { Badge, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { accounts, categories, ME } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { groupNet, summarize } from "@/domain/reports";
import { cn } from "@/lib/cn";
import type { ExpenseRecord } from "@/domain/types";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "account", label: "Payment methods" },
  { id: "merchant", label: "Platforms & merchants" },
  { id: "category", label: "Categories" },
  { id: "payer", label: "Paid by" },
] as const;

/** Grouped view. Group totals come from the domain groupNet (same rule as the dashboard). */
function GroupedView({ rows, view, onEdit }: { rows: ExpenseRecord[]; view: string; onEdit: (r: ExpenseRecord) => void }) {
  const { nameOf, categoryName, accountName } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const keyOf = (r: ExpenseRecord) => (view === "account" ? r.accountId : view === "merchant" ? r.merchant : view === "category" ? r.categoryId : r.payerId);
  const label = (k: string) => (view === "account" ? accountName(k) : view === "category" ? categoryName(k) : view === "payer" ? nameOf(k) : k);
  const totals = groupNet(rows, keyOf);
  const keys = [...new Set(rows.map(keyOf))].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
  return (
    <ul className="space-y-2">
      {keys.map((k) => {
        const items = rows.filter((r) => keyOf(r) === k);
        const isOpen = open === k;
        return (
          <li key={k} className="overflow-hidden rounded-[var(--radius-card)] bg-surface">
            <button aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-background">
              <MerchantAvatar name={label(k)} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{label(k)}</div>
                <div className="text-xs text-muted">{items.length} transaction{items.length === 1 ? "" : "s"}</div>
              </div>
              <div className="num text-right font-semibold">{formatINR(totals[k] ?? 0)}<div className="text-xs font-normal text-muted">net spending</div></div>
            </button>
            {isOpen && <div className="space-y-2 border-t border-border bg-background p-2">{items.map((r) => <TxnCard key={r.id} r={r} onClick={() => onEdit(r)} />)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

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
  const view = get("view") || "all";
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
      <div role="tablist" aria-label="Group transactions" className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-surface p-1">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => set("view", v.id === "all" ? "" : v.id)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm", view === v.id ? "bg-foreground text-white" : "text-muted hover:bg-background")}>{v.label}</button>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState title="No transactions match" hint="Try clearing a filter." /> : view !== "all" ? (
        <GroupedView rows={rows} view={view} onEdit={setEditing} />
      ) : (
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
                    <td><div className="flex items-center gap-2.5 py-1.5"><MerchantAvatar name={r.merchant} size={32} /><div><div className="font-medium">{r.merchant}</div><div className="mt-0.5 flex flex-wrap gap-1"><TxnBadges r={r} /></div></div></div></td>
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
