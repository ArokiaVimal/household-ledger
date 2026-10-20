"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Amount, MerchantAvatar, TxnBadges, TxnCard } from "@/components/txn-row";
import { TxnEditDialog, useRecordNav } from "@/components/txn-edit-dialog";
import { NotesAi } from "./notes-ai";
import { UnverifiedQueue } from "./unverified-queue";
import { ProgressRing } from "@/components/progress";
import { verifyProgress } from "@/domain/progress";
import { Badge, Button, Dialog, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { rootOf } from "@/domain/accounts";
import { formatINR } from "@/domain/money";
import { summarize } from "@/domain/reports";
import { summarizeGroup } from "@/domain/groups";
import { needsVoucherBrand } from "@/domain/vouchers";
import { cn } from "@/lib/cn";
import type { ExpenseRecord } from "@/domain/types";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "account", label: "Payment methods" },
  { id: "bank", label: "Bank accounts" },
  { id: "recurring", label: "Recurring" },
  { id: "merchant", label: "Platforms & merchants" },
  { id: "category", label: "Categories" },
  { id: "payer", label: "Paid by" },
] as const;

/** Grouped view. Group totals come from the domain groupNet (same rule as the dashboard). */
function GroupedView({ rows, view, onEdit }: { rows: ExpenseRecord[]; view: string; onEdit: (r: ExpenseRecord) => void }) {
  const { accounts, nameOf, categoryName, accountName, recurringName, attributionOf, activeGroup } = useStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const bankOf = (r: ExpenseRecord) => r.fundedBy ?? (accounts.find((a) => a.id === r.accountId)?.type === "bank" ? r.accountId : "");
  const keyOf = (r: ExpenseRecord) => (view === "account" ? rootOf(accounts, r.accountId) : view === "bank" ? bankOf(r) : view === "recurring" ? (r.recurringId ?? "") : view === "merchant" ? r.merchant : view === "category" ? r.categoryId : r.payerId);
  const label = (k: string) => (view === "account" || view === "bank" ? accountName(k) : view === "recurring" ? recurringName(k) : view === "category" ? categoryName(k) : view === "payer" ? nameOf(k) : k);
  const scope = view === "bank" ? rows.filter((r) => bankOf(r)) : view === "recurring" ? rows.filter((r) => r.recurringId) : rows;
  // Totals are what counts in the group on screen (allocated shares), so a group heading never adds up the whole bill.
  const totals: Record<string, number> = {};
  for (const r of scope) totals[keyOf(r)] = (totals[keyOf(r)] ?? 0) + (attributionOf(r)?.allocatedPaise ?? 0);
  const keys = [...new Set(scope.map(keyOf))].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
  const toggle = (k: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="space-y-4">
      {keys.map((k) => {
        const items = scope.filter((r) => keyOf(r) === k);
        const shut = collapsed.has(k);
        return (
          <section key={k} aria-label={label(k)} className="overflow-hidden rounded-[var(--radius-card)] bg-surface">
            <button aria-expanded={!shut} onClick={() => toggle(k)} className="flex w-full items-center gap-3 bg-accent-soft p-4 text-left">
              <MerchantAvatar name={label(k)} size={48} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold">{label(k)}</h3>
                <div className="text-xs text-muted">{items.length} transaction{items.length === 1 ? "" : "s"}</div>
              </div>
              <div className="num text-right text-lg font-semibold">{formatINR(totals[k] ?? 0)}<div className="text-xs font-normal text-muted">in {activeGroup.name}</div></div>
              <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-muted transition-transform", shut && "-rotate-90")} />
            </button>
            {!shut && (
              <ul className="ml-9 border-l-2 border-accent-soft py-1">
                {items.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => onEdit(r)} className="flex w-full items-center gap-3 py-2 pl-4 pr-4 text-left hover:bg-background">
                      <MerchantAvatar name={r.merchant} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.merchant}</div>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">{r.date.slice(5)} · {view === "category" ? accountName(r.accountId) : categoryName(r.categoryId)}{view === "account" && r.accountId !== k ? ` · via ${accountName(r.accountId)}` : ""}{r.fundedBy && view !== "bank" ? ` · via ${accountName(r.fundedBy)}` : ""}{r.fundedBy && view === "bank" ? ` · paid with ${accountName(r.accountId)}` : ""}<TxnBadges r={r} /></div>
                      </div>
                      <Amount r={r} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TransactionsView() {
  const { meId, accounts, categories, groupRecords, groups, activeGroup, month, shown, staged, nameOf, categoryName, accountName, recurringName, voucherBrands } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`/transactions?${p.toString()}`);
  };

  const rows = useMemo(() => {
    const m = params.get("month");
    const base = groupRecords(m || month);
    const text = (params.get("q") ?? "").trim().toLowerCase();
    return base
      .filter((r) => !get("category") || r.categoryId === get("category"))
      .filter((r) => !get("merchant") || r.merchant === get("merchant"))
      .filter((r) => !get("status") || r.status === get("status"))
      .filter((r) => get("v") !== "verified" || r.status === "reviewed")
      .filter((r) => !get("kind") || r.kind === get("kind"))
      // A payment method includes the ones under it (Amex includes Amazon Pay and Swiggy Money).
      .filter((r) => !get("account") || r.accountId === get("account") || rootOf(accounts, r.accountId) === get("account"))
      .filter((r) => !get("recurring") || (get("recurring") === "1" ? !!r.recurringId : r.recurringId === get("recurring")))
      .filter((r) => !get("shared") || r.shared === (get("shared") === "1"))
      // Vouchers: ?voucher=<brand> (bought), 1 (any bought), none (bought, brand not chosen yet); ?paidWith=<brand> or 1 (paid with a voucher).
      .filter((r) => !get("voucher") || (get("voucher") === "1" ? !!r.voucherBrandId : get("voucher") === "none" ? needsVoucherBrand(r) : r.voucherBrandId === get("voucher")))
      .filter((r) => !get("paidWith") || (get("paidWith") === "1" ? !!r.paidWithVoucherId : r.paidWithVoucherId === get("paidWith")))
      .filter((r) => !text || `${r.merchant} ${r.originalDescription} ${r.notes ?? ""}`.toLowerCase().includes(text))
      .sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRecords, month, params]);

  const view0 = useRecordNav(rows);
  const setEditing = view0.open;
  const total = summarizeGroup(rows, activeGroup, groups, meId);
  const v = get("v");
  const progress = verifyProgress(shown, get("month") || month);
  const view = get("view") || "all";
  const active = ["recurring", "q", "category", "merchant", "status", "kind", "account", "shared", "voucher", "paidWith"].filter((k) => get(k));

  const filterFields = (
    <>
      <Select aria-label="Category" value={get("category")} onChange={(e) => set("category", e.target.value)}>
        <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select aria-label="Type" value={get("kind")} onChange={(e) => set("kind", e.target.value)}>
        <option value="">All types</option>{([["purchase", "Purchases"], ["refund", "Refunds"], ["income", "Income"], ["transfer", "Transfers"], ["cc_payment", "Card bill payments"], ["fee", "Fees"]] as const).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
      <Select aria-label="Account" value={get("account")} onChange={(e) => set("account", e.target.value)}>
        <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </>
  );
  const filterCount = ["category", "kind", "account", "view"].filter((k) => get(k)).length;

  return (
    <>
      <PageHeader tip="Every transaction, including imported ones you have not verified yet. Verifying one confirms it and teaches the app." title="Transactions" sub={`${rows.length} records · ${get("month") || month}`} actions={<NotesAi />} />
      {/* Verified or not, with how far along you are. */}
      <div className="mb-3 flex items-center gap-3">
        <div role="tablist" aria-label="Verified or not" className="flex min-w-0 flex-1 rounded-full bg-border/60 p-1">
          {([["", "All", 0], ["verified", "Verified", 0], ["unverified", "Unverified", staged.length]] as const).map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={v === id} onClick={() => set("v", id)} className={cn("flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm transition-all", v === id ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
              {label}{n > 0 && <span className={cn("num rounded-full px-1.5 text-[11px] font-semibold leading-5", v === id ? "bg-warn-soft text-warn" : "bg-warn/15 text-warn")}>{n}</span>}
            </button>
          ))}
        </div>
        {progress.total > 0 && <ProgressRing pct={progress.pct} size={44} label={`${progress.verified} of ${progress.total} verified (${progress.pct}%)`} />}
      </div>
      {v === "unverified" ? <UnverifiedQueue /> : <>
      {/* Phone: search plus one Filters button. From tablet width the three selects sit in the row. */}
      <div className="mb-3 flex gap-2 md:hidden">
        <Input className="min-w-0 flex-1" placeholder="Search" aria-label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        <button type="button" onClick={() => setFiltersOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ""}`} className="relative grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground hover:bg-background">
          <SlidersHorizontal size={17} aria-hidden />
          {filterCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-semibold text-white">{filterCount}</span>}
        </button>
      </div>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-3 pb-3">
          {filterFields}
          <Select aria-label="Group by" value={view} onChange={(e) => set("view", e.target.value === "all" ? "" : e.target.value)}>
            {VIEWS.map((x) => <option key={x.id} value={x.id}>{x.id === "all" ? "No grouping" : `Group by ${x.label.toLowerCase()}`}</option>)}
          </Select>
        </div>
        <div className="sticky bottom-0 -mx-4 flex justify-between gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => { const p = new URLSearchParams(params.toString()); for (const k of ["category", "kind", "account", "view"]) p.delete(k); router.replace(`/transactions?${p.toString()}`); }}>Reset</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show {rows.length}</Button></div>
      </Dialog>
      <div className="mb-3 hidden gap-2 md:grid md:grid-cols-6">
        <Input className="col-span-2" placeholder="Search merchant, description, notes" aria-label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        {filterFields}
      </div>
      {active.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          {active.map((k) => <Badge key={k} tone="good">{k}: {k === "category" ? categoryName(get(k)) : k === "account" ? accountName(get(k)) : k === "recurring" && get(k) !== "1" ? recurringName(get(k)) : (k === "voucher" || k === "paidWith") && get(k) !== "1" && get(k) !== "none" ? voucherBrands.find((b) => b.id === get(k))?.name ?? get(k) : get(k)}</Badge>)}
          <button className="text-muted underline" onClick={() => router.replace(`/transactions${get("month") ? `?month=${get("month")}` : ""}`)}>Clear filters</button>
        </div>
      )}
      <div role="tablist" aria-label="Group transactions" className="mb-3 hidden gap-1 md:flex overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => set("view", v.id === "all" ? "" : v.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-[13px] md:px-3.5 md:text-sm", view === v.id ? "bg-foreground text-white" : "text-muted hover:bg-background")}>{v.label}</button>
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
                    <td className="num pr-2.5 text-right text-muted">{summarize([r], meId).myShare ? formatINR(summarize([r], meId).myShare) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="num mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
            <span className="text-muted">Counts in {activeGroup.name}</span><b>{formatINR(total.allocated)}</b>
            <span className="text-muted">My share</span><b>{formatINR(total.my)}</b>
            {total.onBehalf !== 0 && <><span className="text-muted">Paid for others</span><b>{formatINR(total.onBehalf)}</b></>}
          </div>
        </>
      )}
      </>}
      <TxnEditDialog record={view0.record} onClose={view0.close} nav={view0.nav} />
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}><TransactionsView /></Suspense>;
}
