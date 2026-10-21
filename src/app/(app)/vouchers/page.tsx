"use client";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MerchantAvatar } from "@/components/txn-row";
import { Button, Card, CompactChips, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import type { VoucherBrand } from "@/domain/types";
import type { ExpenseRecord } from "@/domain/types";
import { brandSummaries, isVoucherPurchase, monthlyPurchases, reconcileVouchers, voucherOutflow, voucherTree, walletActivity, walletUse, type BrandSummary, type TreeNode } from "@/domain/vouchers";

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Vouchers you buy (for example through Shopwise): per brand, per month, from the card down to each transaction. */
export default function Vouchers() {
  const { records, voucherBrands, accounts, month, today, accountName, addVoucherBrand } = useStore();
  const [accountId, setAccountId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<VoucherBrand | null>(null);

  const scoped = useMemo(() => (accountId ? records.filter((r) => r.accountId === accountId) : records), [records, accountId]);
  const sum = useMemo(() => brandSummaries(voucherBrands, scoped, month), [voucherBrands, scoped, month]);
  const tree = useMemo(() => voucherTree(scoped, accounts, voucherBrands, month), [scoped, accounts, voucherBrands, month]);
  const recon = useMemo(() => reconcileVouchers(scoped, month), [scoped, month]);
  const monthly = useMemo(() => monthlyPurchases(voucherBrands, scoped).slice(0, 6), [voucherBrands, scoped]);
  const outflow = voucherOutflow(scoped, month);
  const usedMonth = sum.brands.reduce((s, b) => s + b.month.usedPaise, 0);
  const cardsWithVouchers = accounts.filter((a) => records.some((r) => r.accountId === a.id && isVoucherPurchase(r)));
  const any = records.some((r) => isVoucherPurchase(r) || r.paidWithVoucherId) || voucherBrands.length > 0;

  const create = () => { const r = addVoucherBrand(newName); if (r.error) return setAddError(r.error); setNewName(""); setAddError(null); setAdding(false); };

  return (
    <>
      <PageHeader tip="A voucher tops up a wallet. The top-up is the cost; wallet spending isn't counted again." title="Voucher wallets" sub="Vouchers top up wallets like Amazon or Swiggy. Wallet spending can be split and is never counted twice." actions={<Button onClick={() => { setNewName(""); setAddError(null); setAdding(true); }}><Plus size={16} aria-hidden />Add voucher</Button>} />

      {!any ? (
        <Card><EmptyState title="No voucher purchases yet" hint="Voucher purchases from imports show up here after review." /></Card>
      ) : (
        <div className="space-y-5">
          {cardsWithVouchers.length > 1 && <CompactChips label="Payment method" options={[{ id: "", label: "All cards" }, ...cardsWithVouchers.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[accountId]} onPick={setAccountId} />}

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Topped up</div><div className="num text-base font-semibold sm:text-2xl">{formatINR(outflow)}</div><div className="hidden text-xs text-muted sm:block">the one cash outflow, not shared</div></Card>
            <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Used</div><div className="num text-base font-semibold sm:text-2xl">{formatINR(usedMonth)}</div><div className="hidden text-xs text-muted sm:block">not added to your spending again</div></Card>
            <Card className="px-3 py-2.5 sm:p-4"><div className="text-xs text-muted">Waiting</div><div className="num text-base font-semibold sm:text-2xl">{formatINR(sum.unassigned.purchasedPaise)}</div>{sum.unassigned.purchases > 0 ? <Link href={`/transactions?month=${month}&voucher=none`} className="text-xs text-accent underline-offset-2 hover:underline">{sum.unassigned.purchases} purchase{sum.unassigned.purchases === 1 ? "" : "s"}, pick the brand</Link> : <div className="text-xs text-muted">nothing waiting</div>}</Card>
          </div>

          <section aria-label="By brand" className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted">By brand · {monthName(month)}</h2>
            {sum.brands.length === 0 ? <p className="px-1 text-sm text-muted">No voucher brands yet. Add one, or choose one when you review a voucher purchase.</p> : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">{sum.brands.map((b) => <li key={b.brand.id}><BrandCard s={b} month={month} records={scoped} onEdit={() => setEditing(b.brand)} /></li>)}</ul>
            )}
          </section>

          {tree.length > 0 && (
            <section aria-label="From the card down" className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted">From the card down · {monthName(month)}</h2>
              <Card className="space-y-1 p-3">{tree.map((n) => <Branch key={n.id} node={n} depth={0} month={month} />)}</Card>
            </section>
          )}

          {recon.length > 0 && (
            <section aria-label="Reconciliation" className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted">Does it add up?</h2>
              <ul className="space-y-2">
                {recon.map((g) => (
                  <li key={`${g.accountId}|${g.merchant}`}>
                    <Card className="space-y-1 p-4 text-sm">
                      <div className="font-medium">{g.merchant} on {accountName(g.accountId)}: <span className="num">{formatINR(g.outflowPaise)}</span> left the card for vouchers</div>
                      <div className="text-muted"><span className="num">{formatINR(g.attributedPaise)}</span> sits under a brand{g.waitingPaise > 0 ? <>, <span className="num text-warn">{formatINR(g.waitingPaise)}</span> still needs a brand</> : ", every rupee accounted for"}.</div>
                      {g.unmarkedCount > 0 && <div className="text-warn">{g.unmarkedCount} other {g.merchant} transaction{g.unmarkedCount === 1 ? "" : "s"} ({formatINR(g.unmarkedPaise)}) {g.unmarkedCount === 1 ? "is" : "are"} not marked as vouchers. <Link href={`/transactions?month=${month}&merchant=${encodeURIComponent(g.merchant)}&account=${g.accountId}`} className="underline underline-offset-2">Check them</Link></div>}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {monthly.length > 0 && voucherBrands.length > 0 && (
            <section aria-label="Month by month" className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted">Month by month (bought)</h2>
              <Card className="overflow-x-auto p-3">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-3 font-medium">Month</th>{voucherBrands.map((b) => <th key={b.id} className="px-2 py-1 text-right font-medium">{b.name}</th>)}<th className="px-2 py-1 text-right font-medium">Total</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {monthly.map((m) => (
                      <tr key={m.month}><td className="py-2 pr-3">{shortMonth(m.month)}</td>{voucherBrands.map((b) => <td key={b.id} className="num px-2 py-2 text-right">{m.byBrand[b.id] ? formatINR(m.byBrand[b.id]) : "—"}</td>)}<td className="num px-2 py-2 text-right font-medium">{formatINR(m.total)}{m.unassigned > 0 && <span className="block text-xs font-normal text-warn">{formatINR(m.unassigned)} no brand</span>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}
          <p className="px-1 text-xs text-muted">Today is {today}. Buying a voucher is not the same as spending it, so remaining value is shown only when you give a balance or record every use.</p>
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a voucher">
        <form className="space-y-3 pb-1" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <Field label="Voucher name" error={addError}><Input autoFocus value={newName} maxLength={40} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} placeholder="e.g. Flipkart, BookMyShow" /></Field>
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button type="button" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!newName.trim()}>Add voucher</Button></div>
        </form>
      </Dialog>
      <BrandEditor brand={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function BrandCard({ s, month, records, onEdit }: { s: BrandSummary; month: string; records: ExpenseRecord[]; onEdit: () => void }) {
  const { categoryName, nameOf, meId } = useStore();
  const r = s.remaining;
  const use = walletUse(s.brand.id, records, month);
  const activity = walletActivity(s.brand.id, records);
  const topCats = Object.entries(use.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3"><MerchantAvatar name={s.brand.name} size={36} /><h3 className="min-w-0 flex-1 truncate font-semibold">{s.brand.name}</h3><button type="button" aria-label={`Edit ${s.brand.name}`} title="Edit" onClick={onEdit} className="grid size-10 place-items-center rounded-full text-muted hover:bg-background"><Pencil size={15} aria-hidden /></button></div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted">Topped up this month</dt><dd className="num text-lg font-semibold">{formatINR(s.month.purchasedPaise)}</dd><dd className="text-xs text-muted">{s.month.purchases} purchase{s.month.purchases === 1 ? "" : "s"}</dd></div>
        <div><dt className="text-xs text-muted">Bought from it this month</dt><dd className="num text-lg font-semibold">{formatINR(s.month.usedPaise)}</dd><dd className="text-xs text-muted">{s.month.uses} transaction{s.month.uses === 1 ? "" : "s"}</dd></div>
      </dl>
      <div className="rounded-xl bg-background p-3 text-sm">
        {r ? (
          <>
            <div className="flex items-baseline justify-between gap-2"><span className="text-muted">Wallet balance</span><span className={`num font-semibold ${r.inconsistent ? "text-warn" : ""}`}>{formatINR(r.amountPaise)}</span></div>
            <p className="mt-1 text-xs text-muted">{r.basis === "balance" ? `From the balance you recorded on ${s.brand.balance?.asOf}, plus purchases and recorded use since.` : "Bought minus used, because you record every use of this voucher."}{r.inconsistent ? " Recorded use is more than the voucher explains, so check the entries or the balance." : ""}</p>
          </>
        ) : <p className="text-xs text-muted"><b>Balance not confirmed.</b> Top-ups minus the spending you recorded is <span className="num font-medium text-foreground">{formatINR(Math.max(0, s.total.purchasedPaise - s.total.usedPaise))}</span>, but some orders may not be in the app. Add the balance from the {s.brand.name} app, or mark that you record every use, to show it as your balance.</p>}
      </div>
      {use.count > 0 && (
        <div className="space-y-1 text-sm">
          <div className="text-xs text-muted">Bought from the wallet in {monthName(month)}: {formatINR(use.totalPaise)} in {use.count} purchase{use.count === 1 ? "" : "s"}{topCats.length > 0 ? ` (${topCats.map(([c, v]) => `${categoryName(c)} ${formatINR(v)}`).join(", ")})` : ""}</div>
          {use.othersOweePaise > 0 && <div className="rounded-lg bg-good-soft px-3 py-2 text-xs text-good">Others owe you <b className="num">{formatINR(use.othersOweePaise)}</b> for these. <Link href="/settlements" className="font-medium underline">Settle up</Link></div>}
        </div>
      )}
      {activity.length > 0 && (
        <details className="group text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-foreground"><ChevronDown size={14} aria-hidden className="-rotate-90 group-open:rotate-0" />Wallet activity ({activity.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {[...activity].reverse().map((l) => {
              const others = l.type === "use" ? l.record.split.participantIds.filter((id) => id !== meId && id !== l.record.payerId) : [];
              return (
                <li key={l.record.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0"><span className="block truncate">{l.type === "topup" ? `Top-up via ${l.record.merchant}` : l.record.merchant}</span><span className="block truncate text-xs text-muted">{l.record.date}{l.type === "use" ? ` · ${categoryName(l.record.categoryId)}` : ""}{others.length > 0 ? ` · split with ${others.map(nameOf).join(", ")}` : ""}</span></span>
                  <span className="text-right"><span className={`num block font-medium ${l.deltaPaise > 0 ? "text-good" : ""}`}>{l.deltaPaise > 0 ? "+" : "−"}{formatINR(Math.abs(l.deltaPaise))}</span><span className="num block text-xs text-muted">tracked {formatINR(l.trackedPaise)}</span></span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>All time: bought <b className="num text-foreground">{formatINR(s.total.purchasedPaise)}</b>, used <b className="num text-foreground">{formatINR(s.total.usedPaise)}</b></span>
        <Link href={`/transactions?month=${month}&voucher=${s.brand.id}`} className="text-accent underline-offset-2 hover:underline">Purchases</Link>
        <Link href={`/transactions?month=${month}&paidWith=${s.brand.id}`} className="text-accent underline-offset-2 hover:underline">Spending</Link>
      </div>
    </Card>
  );
}

/** One level of the hierarchy: card, then merchant, then voucher brand; the last level lists the transactions. */
function Branch({ node, depth, month }: { node: TreeNode; depth: number; month: string }) {
  const { voucherBrands } = useStore();
  const leaf = node.children.length === 0;
  const brandId = depth === 2 ? node.id.split("|")[2] : "";
  return (
    <details open={depth < 2} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2 hover:bg-background" style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}>
        <ChevronDown size={14} aria-hidden className="shrink-0 -rotate-90 text-muted group-open:rotate-0" />
        <span className={`min-w-0 flex-1 truncate ${depth === 0 ? "font-semibold" : depth === 1 ? "font-medium" : ""}`}>{node.label}</span>
        <span className="text-xs text-muted">{node.count}</span>
        <span className="num text-sm font-semibold">{formatINR(node.totalPaise)}</span>
      </summary>
      <div>
        {node.children.map((c) => <Branch key={c.id} node={c} depth={depth + 1} month={month} />)}
        {leaf && (
          <ul className="space-y-0.5 pb-1" style={{ paddingLeft: `${0.5 + (depth + 1) * 1.1}rem` }}>
            {node.records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0"><span className="block truncate">{r.merchant}</span><span className="block truncate text-xs text-muted">{r.date} · {r.originalDescription}</span></span>
                <span className="num shrink-0">{formatINR(r.amountPaise)}</span>
              </li>
            ))}
            {brandId && brandId !== "none" && <li className="px-2 pt-1 text-xs"><Link href={`/transactions?month=${month}&voucher=${brandId}`} className="text-accent underline-offset-2 hover:underline">Open in Transactions ({voucherBrands.find((b) => b.id === brandId)?.name})</Link></li>}
          </ul>
        )}
      </div>
    </details>
  );
}

function BrandEditor({ brand, onClose }: { brand: VoucherBrand | null; onClose: () => void }) {
  return (
    <Dialog open={!!brand} onClose={onClose} title={brand ? `Edit ${brand.name}` : "Edit voucher"}>
      {brand && <EditorForm key={brand.id} brand={brand} onClose={onClose} />}
    </Dialog>
  );
}

function EditorForm({ brand, onClose }: { brand: VoucherBrand; onClose: () => void }) {
  const { updateVoucherBrand, deleteVoucherBrand, today } = useStore();
  const [name, setName] = useState(brand.name);
  const [balance, setBalance] = useState(brand.balance ? (brand.balance.amountPaise / 100).toFixed(2) : "");
  const [asOf, setAsOf] = useState(brand.balance?.asOf ?? today);
  const [all, setAll] = useState(!!brand.tracksAllUse);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const save = () => {
    const paise = balance.trim() ? parseRupees(balance) : null;
    if (balance.trim() && (paise === null || paise < 0)) return setError("Enter the balance as an amount, or leave it empty.");
    const err = updateVoucherBrand(brand.id, { name, balance: paise === null ? null : { amountPaise: paise, asOf }, tracksAllUse: all });
    if (err) return setError(err);
    onClose();
  };
  return (
    <div className="space-y-3 pb-1 text-sm">
      <Field label="Name"><Input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setError(null); }} /></Field>
      <div className="space-y-2 rounded-xl bg-background p-3">
        <div className="font-medium">Current balance (optional)</div>
        <p className="text-xs text-muted">Read it off the {brand.name} app or its statement. With a balance, remaining value = balance + later purchases − later recorded use.</p>
        <div className="grid grid-cols-2 gap-3"><Field label="Balance (₹)"><Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Leave empty if unknown" /></Field><Field label="As of"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field></div>
      </div>
      <label className="flex items-start gap-2 rounded-xl bg-background p-3"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" /><span><b>I record every use of this voucher.</b> <span className="text-muted">Then remaining value = bought − used. Leave it off if some orders will not be in the app.</span></span></label>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3">
        <Button variant="danger" onClick={() => setRemoving(true)}><Trash2 size={14} aria-hidden />Remove</Button>
        <div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></div>
      </div>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} title={`Remove ${brand.name}?`} confirmLabel="Remove" onConfirm={() => { const err = deleteVoucherBrand(brand.id); if (err) setError(err); else onClose(); }}>
        <p>This only works when no transaction is attributed to it. Otherwise rename it instead.</p>
      </ConfirmDialog>
    </div>
  );
}
