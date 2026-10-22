"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ChevronDown, CreditCard, Landmark, QrCode, Receipt, Repeat, Search, ShoppingBag, SlidersHorizontal, Store, Tags, Undo2, UserRound, Wallet, X, type LucideIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Amount, MerchantAvatar, TxnBadges } from "@/components/txn-row";
import { TxnEditDialog, useRecordNav } from "@/components/txn-edit-dialog";
import { ChipFilter, filterAccounts } from "@/components/chip-filter";
import { NotesAi } from "./notes-ai";
import { UnverifiedQueue } from "./unverified-queue";
import { VoucherSection, type VoucherGroup } from "./voucher-section";
import { verifyProgress } from "@/domain/progress";
import { Button, ConfirmDialog, Dialog, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { CompactRow, StatusMark } from "@/components/txn-compact";
import { HScroll } from "@/components/hscroll";
import { CategoryGlyph } from "@/components/glyphs";
import { useStore } from "@/data/store";
import { rootOf, shortName, walletBrandFor } from "@/domain/accounts";
import { formatINR } from "@/domain/money";
import { isUpiPayment, sourceOf } from "@/domain/payment-mode";
import { signedSpend, summarize } from "@/domain/reports";
import { summarizeGroup } from "@/domain/groups";
import { isVoucherPurchase, needsVoucherBrand } from "@/domain/vouchers";
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

const TYPES = [["purchase", "Purchases", ShoppingBag], ["refund", "Refunds", Undo2], ["income", "Income", ArrowDownLeft], ["transfer", "Transfers", ArrowLeftRight], ["cc_payment", "Card bills", CreditCard], ["fee", "Fees", Receipt]] as const;
const VIEW_ICON: Record<string, LucideIcon> = { account: Wallet, bank: Landmark, recurring: Repeat, merchant: Store, category: Tags, payer: UserRound };

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
  const { meId, accounts, categories, groupRecords, recordsFor, setMonth, groups, activeGroup, month, shown, staged, today, approveStaged, deleteRecords, attributionOf, nameOf, categoryName, accountName, recurringName, voucherBrands } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const get = (k: string) => params.get(k) ?? "";
  /** Picking bank or card also drops a chosen payment method that no longer fits it. */
  const pickSource = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set("source", v); else p.delete("source");
    if (p.get("account") && !filterAccounts(accounts, v).some((a) => a.id === p.get("account") || a.id === rootOf(accounts, p.get("account")!))) p.delete("account");
    router.replace(`/transactions?${p.toString()}`);
  };
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`/transactions?${p.toString()}`);
  };

  // A link such as ?month=2026-09 (from a chart or another screen) moves the month selector too, so the two never disagree.
  const urlMonth = params.get("month");
  useEffect(() => {
    if (!urlMonth || !/^\d{4}-\d{2}$/.test(urlMonth)) return;
    if (urlMonth !== month) setMonth(urlMonth);
    const p = new URLSearchParams(params.toString());
    p.delete("month");
    router.replace(`/transactions?${p.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMonth]);

  const rows = useMemo(() => {
    const m = params.get("month");
    const inGroup = groupRecords(m || month);
    // Money paid with a voucher counts as nothing for you (the voucher purchase was the outflow), so a payment group would drop it; keep it, it is listed under its voucher.
    const have = new Set(inGroup.map((r) => r.id));
    const isWallet = (id: string) => accounts.find((a) => a.id === id)?.type === "wallet";
    const base = activeGroup.kind === "mine" ? [...inGroup, ...recordsFor(m || month).filter((r) => !have.has(r.id) && (r.paidWithVoucherId || isWallet(r.accountId)))] : inGroup;
    const text = (params.get("q") ?? "").trim().toLowerCase();
    return base
      .filter((r) => !get("category") || r.categoryId === get("category"))
      .filter((r) => !get("merchant") || r.merchant === get("merchant"))
      .filter((r) => !get("status") || r.status === get("status"))
      .filter((r) => get("v") !== "verified" || r.status === "reviewed")
      .filter((r) => !get("kind") || r.kind === get("kind"))
      // A payment method includes the ones under it (Amex includes Amazon Pay and Swiggy Money).
      .filter((r) => !get("account") || r.accountId === get("account") || rootOf(accounts, r.accountId) === get("account"))
      // UPI or not, and whether it came from a bank account or a credit card (read from the bank's own text).
      .filter((r) => !get("mode") || isUpiPayment(r, accounts) === (get("mode") === "upi"))
      .filter((r) => !get("source") || sourceOf(r, accounts) === get("source"))
      .filter((r) => !get("recurring") || (get("recurring") === "1" ? !!r.recurringId : r.recurringId === get("recurring")))
      .filter((r) => !get("shared") || r.shared === (get("shared") === "1"))
      // Vouchers: ?voucher=<brand> (bought), 1 (any bought), none (bought, brand not chosen yet); ?paidWith=<brand> or 1 (paid with a voucher).
      .filter((r) => !get("voucher") || (get("voucher") === "1" ? !!r.voucherBrandId : get("voucher") === "none" ? needsVoucherBrand(r) : r.voucherBrandId === get("voucher")))
      .filter((r) => !get("paidWith") || (get("paidWith") === "1" ? !!r.paidWithVoucherId : r.paidWithVoucherId === get("paidWith")))
      .filter((r) => !text || `${r.merchant} ${r.originalDescription} ${r.notes ?? ""}`.toLowerCase().includes(text))
      .sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRecords, recordsFor, accounts, activeGroup.kind, month, params]);

  const [deleting, setDeleting] = useState<ExpenseRecord | null>(null);
  // Vouchers become one line per brand and month: the purchases are added together and the payments made with the voucher sit under it.
  const { mainRows, voucherGroups } = useMemo(() => {
    if ((get("view") || "all") !== "all" || get("paidWith") || get("voucher") || get("q")) return { mainRows: rows, voucherGroups: [] as VoucherGroup[] };
    const brandOf = (r: ExpenseRecord) => r.paidWithVoucherId ?? (r.voucherBrandId && isVoucherPurchase(r) ? r.voucherBrandId : undefined) ?? walletBrandFor(accounts.find((a) => a.id === r.accountId), voucherBrands)?.id;
    const groups = new Map<string, VoucherGroup>();
    const main: ExpenseRecord[] = [];
    for (const r of rows) {
      const b = brandOf(r);
      if (!b) { main.push(r); continue; }
      const m = r.date.slice(0, 7);
      const g = groups.get(`${b}|${m}`) ?? { id: `${b}|${m}`, name: voucherBrands.find((x) => x.id === b)?.name ?? "Voucher", month: m, boughtPaise: 0, bought: [], paidWith: [], spentPaise: 0 };
      if (isVoucherPurchase(r)) { g.bought.push(r); g.boughtPaise += r.amountPaise; }
      else { g.paidWith.push(r); if (r.kind === "purchase" || r.kind === "fee") g.spentPaise += r.amountPaise; else if (r.kind === "refund") g.spentPaise -= r.amountPaise; }
      groups.set(g.id, g);
    }
    return { mainRows: main, voucherGroups: [...groups.values()].sort((a, b) => b.month.localeCompare(a.month) || b.boughtPaise - a.boughtPaise) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, params, accounts, voucherBrands]);
  const days = useMemo(() => {
    const m = new Map<string, { date: string; rows: ExpenseRecord[]; total: number }>();
    for (const r of mainRows) { const d = m.get(r.date) ?? { date: r.date, rows: [], total: 0 }; d.rows.push(r); d.total += attributionOf(r)?.allocatedPaise ?? 0; m.set(r.date, d); }
    return [...m.values()];
  }, [mainRows, attributionOf]);
  const dayLabel = (iso: string) => {
    const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  };
  const view0 = useRecordNav(rows);
  const setEditing = view0.open;
  const total = summarizeGroup(rows, activeGroup, groups, meId);
  // Charged in full vs what counts as yours: the difference is other people's share of split bills.
  const charged = rows.reduce((s, r) => s + signedSpend(r), 0);
  // Mine plus everyone else's share is the full amount charged (what you paid for others counts as theirs).
  const othersShare = Math.max(0, charged - total.my);
  const v = get("v");
  const allScope = get("scope") === "all";
  const progress = verifyProgress(shown, get("month") || month);
  const view = get("view") || "all";
  const active = ["recurring", "q", "category", "merchant", "status", "kind", "account", "mode", "source", "shared", "voucher", "paidWith"].filter((k) => get(k));

  const filterFields = (
    <>
      <Select aria-label="Category" value={get("category")} onChange={(e) => set("category", e.target.value)}>
        <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select aria-label="Type" value={get("kind")} onChange={(e) => set("kind", e.target.value)}>
        <option value="">All types</option>{([["purchase", "Purchases"], ["refund", "Refunds"], ["income", "Income"], ["transfer", "Transfers"], ["cc_payment", "Card bill payments"], ["fee", "Fees"]] as const).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
      <Select aria-label="UPI or not" value={get("mode")} onChange={(e) => set("mode", e.target.value)}>
        <option value="">UPI and other</option><option value="upi">UPI only</option><option value="other">Not UPI</option>
      </Select>
      <Select aria-label="Bank or card" value={get("source")} onChange={(e) => pickSource(e.target.value)}>
        <option value="">Bank and card</option><option value="bank">Bank account</option><option value="card">Credit card</option>
      </Select>
      <Select aria-label="Account" value={get("account")} onChange={(e) => set("account", e.target.value)}>
        <option value="">All accounts</option>{filterAccounts(accounts, get("source")).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </>
  );
  const filterCount = ["category", "kind", "account", "mode", "source", "view"].filter((k) => get(k)).length;

  return (
    <>
      <h1 className="sr-only md:hidden">Transactions</h1>
      <div className="hidden md:block">
        <PageHeader tip="Every transaction, including imported ones you have not verified yet. Verifying one confirms it and teaches the app." title="Transactions" sub={`${rows.length} records · ${get("month") || month}`} actions={<NotesAi />} />
      </div>
      {/* Verified or not, with how far along you are. */}
      <div className="mb-3 flex items-center gap-1.5 md:gap-3">
        <div role="tablist" aria-label="Verified or not" className="flex min-w-0 flex-1 rounded-full bg-border/60 p-1 md:max-w-md">
          {([["", "All", 0], ["verified", "Verified", 0], ["unverified", "Unverified", allScope ? staged.length : progress.left]] as const).map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={v === id} onClick={() => set("v", id)} className={cn("flex min-h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[13px] transition-all md:gap-1.5 md:px-2 md:text-sm", v === id ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
              {label}{n > 0 && <span className={cn("num rounded-full px-1.5 text-[11px] font-semibold leading-5", v === id ? "bg-warn-soft text-warn" : "bg-warn/15 text-warn")}>{n}</span>}
            </button>
          ))}
        </div>
        {v !== "unverified" && (
          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            <button type="button" aria-label="Search" aria-pressed={searching || !!get("q")} onClick={() => setSearching((x) => !x)} className={cn("relative grid size-10 place-items-center rounded-full text-foreground", searching || get("q") ? "bg-accent/15 text-accent" : "bg-border/60 hover:bg-border")}>
              <Search size={17} aria-hidden />
            </button>
            <NotesAi />
            <button type="button" onClick={() => setFiltersOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ""}`} className="relative grid size-10 place-items-center rounded-full bg-border/60 text-foreground hover:bg-border">
              <SlidersHorizontal size={17} aria-hidden />
              {filterCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-semibold text-white">{filterCount}</span>}
            </button>
          </div>
        )}
      </div>
      {v !== "unverified" && (searching || get("q")) && (
        <div className="relative mb-3 md:hidden">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input autoFocus={searching && !get("q")} className="pl-10 pr-11" placeholder="Search merchant, note or amount" aria-label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
          <button type="button" aria-label="Close search" onClick={() => { set("q", ""); setSearching(false); }} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-background"><X size={16} aria-hidden /></button>
        </div>
      )}
      {v === "unverified" && allScope && (
        <p className="mb-2 flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs text-muted"><span>All months · {staged.length} unverified</span><button type="button" onClick={() => set("scope", "")} className="font-medium text-accent">Show {new Date(`${get("month") || month}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" })} only</button></p>
      )}
      {v === "unverified" ? <UnverifiedQueue month={allScope ? undefined : get("month") || month} /> : <>
      {/* Phone: the total. Search, AI notes and filters sit in the row with the tabs. */}
      <div className="mb-3 px-1 md:hidden">
        <div aria-label="Total for this view">
          <div className="num text-[22px] font-semibold leading-tight tracking-tight">{formatINR(charged)}</div>
          <div className="text-xs leading-snug text-muted">{rows.length} transaction{rows.length === 1 ? "" : "s"}{othersShare > 0 ? ` · mine ${formatINR(total.my)} · others' share ${formatINR(othersShare)}` : ""}</div>
        </div>
      </div>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="-mx-4 space-y-4 overflow-x-clip pb-3">
          <ChipFilter label="Type" value={get("kind")} onPick={(v) => set("kind", v)} options={TYPES.map(([id, label, I]) => ({ id, label, icon: <I size={15} aria-hidden /> }))} />
          <ChipFilter label="UPI" value={get("mode")} onPick={(v) => set("mode", v)} options={[{ id: "upi", label: "UPI", icon: <QrCode size={15} aria-hidden /> }, { id: "other", label: "Not UPI", icon: <Receipt size={15} aria-hidden /> }]} />
          <ChipFilter label="From" value={get("source")} onPick={pickSource} options={[{ id: "bank", label: "Bank account", icon: <Landmark size={15} aria-hidden /> }, { id: "card", label: "Credit card", icon: <CreditCard size={15} aria-hidden /> }]} />
          <ChipFilter label="Paid with" value={get("account")} onPick={(v) => set("account", v)} options={filterAccounts(accounts, get("source")).map((a) => ({ id: a.id, label: a.parentId ? a.name : shortName(a.name), icon: <MerchantAvatar name={a.name} size={26} /> }))} />
          <ChipFilter label="Category" value={get("category")} onPick={(v) => set("category", v)} options={categories.map((c) => ({ id: c.id, label: c.name, icon: <CategoryGlyph name={c.name} icon={c.icon} size={26} /> }))} />
          <ChipFilter label="Group by" value={view === "all" ? "" : view} onPick={(v) => set("view", v)} options={VIEWS.filter((x) => x.id !== "all").map((x) => { const I = VIEW_ICON[x.id] ?? Tags; return { id: x.id, label: x.label, icon: <I size={15} aria-hidden /> }; })} />
        </div>
        <div className="sticky bottom-0 -mx-4 flex justify-between gap-2 border-t border-border bg-surface px-4 py-3"><Button onClick={() => { const p = new URLSearchParams(params.toString()); for (const k of ["category", "kind", "account", "mode", "source", "view"]) p.delete(k); router.replace(`/transactions?${p.toString()}`); }}>Reset</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show {rows.length}</Button></div>
      </Dialog>
      <div className="mb-3 hidden gap-2 md:grid md:grid-cols-6">
        <Input className="col-span-2" placeholder="Search merchant, description, notes" aria-label="Search" value={get("q")} onChange={(e) => set("q", e.target.value)} />
        {filterFields}
      </div>
      {active.filter((k) => k !== "q").length > 0 && (
        <HScroll className="mb-3 flex gap-1.5 text-xs">
          {active.filter((k) => k !== "q").map((k) => (
            <button key={k} type="button" onClick={() => set(k, "")} aria-label={`Remove filter ${k}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1.5 font-medium text-accent hover:bg-accent/15">
              {k === "category" ? categoryName(get(k)) : k === "account" ? accountName(get(k)) : k === "mode" ? (get(k) === "upi" ? "UPI" : "Not UPI") : k === "source" ? (get(k) === "card" ? "Credit card" : "Bank account") : k === "recurring" && get(k) !== "1" ? recurringName(get(k)) : (k === "voucher" || k === "paidWith") && get(k) !== "1" && get(k) !== "none" ? voucherBrands.find((b) => b.id === get(k))?.name ?? get(k) : get(k)}
              <X size={12} aria-hidden />
            </button>
          ))}
          <button type="button" className="shrink-0 px-2 py-1.5 text-muted underline" onClick={() => router.replace("/transactions")}>Clear all</button>
        </HScroll>
      )}
      <HScroll role="tablist" aria-label="Group transactions" className="mb-3 hidden gap-1 rounded-full bg-surface p-1 md:flex">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => set("view", v.id === "all" ? "" : v.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-[13px] md:px-3.5 md:text-sm", view === v.id ? "bg-foreground text-white" : "text-muted hover:bg-background")}>{v.label}</button>
        ))}
      </HScroll>
      {rows.length === 0 ? <EmptyState art="search" title="No transactions match" hint="Try clearing a filter." /> : view !== "all" ? (
        <GroupedView rows={rows} view={view} onEdit={setEditing} />
      ) : (
        <>
          <div className="num mb-2 hidden items-start justify-between gap-3 px-1 md:flex" aria-label="Total for this view">
            <span className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">Total · {rows.length}</span>
            <span className="text-right">
              <b className="text-base">{formatINR(total.allocated)}</b>
              {(total.my !== total.allocated || total.onBehalf !== 0) && <span className="block text-xs text-muted">mine {formatINR(total.my)}{total.onBehalf !== 0 ? ` · for others ${formatINR(total.onBehalf)}` : ""}</span>}
            </span>
          </div>
          <div className="space-y-3 md:hidden">
            {days.map((d) => (
              <section key={d.date} aria-label={dayLabel(d.date)}>
                <div className="mb-1 flex items-baseline justify-between px-1 text-xs"><span className="font-semibold text-foreground">{dayLabel(d.date)}</span><span className="num text-muted">{formatINR(d.total)}</span></div>
                <ul className="space-y-1.5">
                  {d.rows.map((r) => <li key={r.id}><CompactRow r={r} onOpen={() => setEditing(r)} onVerify={() => approveStaged(r.id)} onDelete={() => setDeleting(r)} /></li>)}
                </ul>
              </section>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background text-left text-xs text-muted">
                <tr><th className="p-2.5">Date</th><th>Merchant</th><th>Category</th><th>Paid by</th><th>Account</th><th className="text-right">Amount</th><th className="pr-2.5 text-right">My share</th></tr>
              </thead>
              <tbody>
                {mainRows.map((r) => (
                  <tr key={r.id} onClick={() => setEditing(r)} className="cursor-pointer border-b border-border last:border-0 hover:bg-background">
                    <td className="num p-2.5 text-muted">{r.date.slice(5)}</td>
                    <td><div className="flex items-center gap-2.5 py-1.5"><MerchantAvatar name={r.merchant} size={32} /><div><div className="flex items-center gap-1.5 font-medium">{r.merchant}<StatusMark r={r} /></div><div className="mt-0.5 flex flex-wrap gap-1 empty:hidden"><TxnBadges r={r} quiet hideStatus /></div></div></div></td>
                    <td>{categoryName(r.categoryId)}</td><td>{nameOf(r.payerId)}</td><td className="text-muted">{accountName(r.accountId)}</td>
                    <td className="text-right"><Amount r={r} /></td>
                    <td className="num pr-2.5 text-right text-muted">{summarize([r], meId).myShare ? formatINR(summarize([r], meId).myShare) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <VoucherSection groups={voucherGroups} showMonth={new Set(voucherGroups.map((g) => g.month)).size > 1} onOpen={setEditing} onVerify={(r) => approveStaged(r.id)} onDelete={setDeleting} />
        </>
      )}
      </>}
      <TxnEditDialog record={view0.record} onClose={view0.close} nav={view0.nav} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this transaction?" onConfirm={() => { if (deleting) deleteRecords([deleting.id]); }}>
        {deleting && <p><strong>{deleting.merchant}</strong> · {formatINR(deleting.amountPaise)} · {deleting.date}</p>}
        <p className="text-muted">It stops counting in your totals. The original line stays in the import history. This can&apos;t be undone.</p>
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}><TransactionsView /></Suspense>;
}
