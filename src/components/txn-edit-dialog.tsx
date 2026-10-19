"use client";
import { ArrowLeftRight, Ban, Banknote, CalendarDays, ChevronDown, CreditCard, EyeOff, Plus, Receipt, Repeat, ShoppingBag, SlidersHorizontal, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/data/store";
import { SUGGESTED_VOUCHER_BRANDS } from "@/domain/defaults";
import { CategoryGlyph, Dot, PersonGlyph } from "@/components/glyphs";
import { shortName, walletAccountFor, walletBrandFor } from "@/domain/accounts";
import { knownVoucherSeller } from "@/domain/vouchers";
import { formatINR, parseRupees } from "@/domain/money";
import { equalSplit, validateSplit } from "@/domain/splits";
import type { ExpenseRecord, SplitConfig, TxnKind } from "@/domain/types";
import { SplitEditor } from "./split-editor";
import { MerchantAvatar } from "./txn-row";
import { AiBadge, Button, CompactChips, ConfirmDialog, Dialog, FormRow, Input } from "./ui";

const NEW_RECURRING = "__new_recurring";
const kinds: { id: TxnKind; label: string; icon: ReactNode }[] = [
  { id: "purchase", label: "Purchase", icon: <Dot icon={ShoppingBag} tone="bg-pink-100 text-pink-700" /> },
  { id: "refund", label: "Refund", icon: <Dot icon={Undo2} tone="bg-emerald-100 text-emerald-700" /> },
  { id: "fee", label: "Fee", icon: <Dot icon={Receipt} tone="bg-gray-200 text-gray-700" /> },
  { id: "income", label: "Income", icon: <Dot icon={Banknote} tone="bg-lime-100 text-lime-700" /> },
  { id: "transfer", label: "Transfer", icon: <Dot icon={ArrowLeftRight} tone="bg-sky-100 text-sky-700" /> },
  { id: "cc_payment", label: "Card bill", icon: <Dot icon={CreditCard} tone="bg-indigo-100 text-indigo-700" /> },
];

interface Props { record: ExpenseRecord | null; onClose: () => void; /** Open the next unreviewed record, with how many remain. */ next?: { remaining: number; open: () => void } }

export function TxnEditDialog({ record, onClose, next }: Props) {
  return (
    <Dialog open={!!record} onClose={onClose} title="Edit transaction">
      {record && <Form key={record.id} mode="edit" record={record} onClose={onClose} next={next} />}
    </Dialog>
  );
}

/** Review queue: edit, then approve into the ledger (or reject). Nothing counts until approved. */
export function TxnReviewDialog({ record, onClose, next }: Props) {
  return (
    <Dialog open={!!record} onClose={onClose} title="Review imported transaction">
      {record && <Form key={record.id} mode="review" record={record} onClose={onClose} next={next} />}
    </Dialog>
  );
}

/** Manual entry. `round` changes after "Add another" so the form resets. */
export function TxnAddDialog({ open, round, onClose, onAnother, onAdded }: { open: boolean; round: number; onClose: () => void; onAnother: () => void; onAdded: (msg: string) => void }) {
  const { month, today, meId, accounts } = useStore();
  const draft: ExpenseRecord = {
    id: "", date: today.startsWith(month) ? today : `${month}-01`, merchant: "", originalDescription: "Entered manually", amountPaise: 0, currency: "INR",
    accountId: accounts[0]?.id ?? "", categoryId: "uncategorized", kind: "purchase", payerId: meId, shared: false, split: { mode: "personal", participantIds: [meId] },
    excluded: false, status: "reviewed", importSource: "Manual entry",
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add transaction">
      {open && <Form key={round} mode="add" record={draft} onClose={onClose} onAnother={onAnother} onAdded={onAdded} />}
    </Dialog>
  );
}

function Form({ mode, record, onClose, next, onAnother, onAdded }: { mode: "edit" | "add" | "review"; record: ExpenseRecord; onClose: () => void; next?: Props["next"]; onAnother?: () => void; onAdded?: (msg: string) => void }) {
  const { meId, accounts, participants, recurringItems, categories, records, staged, updateRecord, addRecord, updateStaged, approveStaged, deleteRecords, accountName, saveRecurring, addCategory, voucherBrands, addVoucherBrand } = useStore();
  const [deleting, setDeleting] = useState(false);
  const dupOf = record.duplicateOf ? [...records, ...staged].find((r) => r.id === record.duplicateOf) : undefined;
  const adding = mode === "add";
  const [merchant, setMerchant] = useState(record.merchant);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(record.date);
  // Primary payment method first; its sub payment methods (Amazon Pay, Swiggy Money under Amex) only appear once you choose it.
  // "Direct" means the primary itself (a plain Amex payment).
  const startAcct = accounts.find((a) => a.id === record.accountId);
  const startParent = startAcct?.parentId && accounts.some((a) => a.id === startAcct.parentId) ? startAcct.parentId : "";
  const [primaryId, setPrimaryId] = useState(startParent || record.accountId);
  const [subId, setSubId] = useState(startParent ? record.accountId : "");
  const accountId = subId || primaryId;
  const keep = (a: { id: string; archived?: boolean }) => !a.archived || a.id === record.accountId || a.id === primaryId || a.id === subId;
  const primaries = accounts.filter((a) => (!a.parentId || !accounts.some((x) => x.id === a.parentId)) && keep(a));
  const subs = accounts.filter((a) => a.parentId === primaryId && keep(a));
  const [categoryId, setCategoryId] = useState(record.categoryId);
  const [kind, setKind] = useState(record.kind);
  const [payerId, setPayerId] = useState(record.payerId);
  const [split, setSplit] = useState<SplitConfig>(record.split);
  // An import that looks like a monthly commitment starts with "Repeat every month" selected (or its existing recurring item),
  // so approving it adds it to Recurring. You can switch to None before approving.
  const sameItem = recurringItems.find((i) => { const a = i.name.toLowerCase(), b = record.merchant.toLowerCase(); return !!b && (a.includes(b) || b.includes(a)); });
  const [recurringId, setRecurringId] = useState(record.recurringId ?? (record.recurringHint ? sameItem?.id ?? NEW_RECURRING : ""));
  const [fundedBy, setFundedBy] = useState(record.fundedBy ?? "");
  const [paidCardId, setPaidCardId] = useState(record.paidCardId ?? "");
  // Vouchers. A voucher seller (say Shopwise) asks which voucher this bought; any purchase can be marked as buying one, or as paid with one.
  const promptVoucher = !!record.voucherPending || !!record.voucherBrandId || (record.kind === "purchase" && !record.paidWithVoucherId && !!knownVoucherSeller(record.originalDescription));
  const [voucherId, setVoucherId] = useState(record.voucherBrandId ?? "");
  const [voucherLater, setVoucherLater] = useState(!!record.voucherPending && !record.voucherBrandId && record.status === "reviewed");
  const [paidWithId, setPaidWithId] = useState(record.paidWithVoucherId ?? "");
  // A top-up of a wallet is the owner's own outflow: never split. A purchase made from a wallet is split like any other.
  const topUp = promptVoucher || !!voucherId;
  // Choosing a wallet payment method (Amazon Pay, Swiggy Money) means paying from that voucher wallet.
  const impliedBrand = walletBrandFor(accounts.find((a) => a.id === accountId), voucherBrands);
  const walletId = paidWithId || impliedBrand?.id || "";
  const brandOptions = [
    ...voucherBrands.map((b) => ({ id: b.id, label: b.name, icon: <MerchantAvatar name={b.name} size={24} /> })),
    ...SUGGESTED_VOUCHER_BRANDS.filter((n) => !voucherBrands.some((b) => b.name.toLowerCase() === n.toLowerCase())).map((n) => ({ id: `suggest:${n}`, label: n, icon: <MerchantAvatar name={n} size={24} /> })),
  ];
  const pickBrand = (id: string, set: (v: string) => void) => { if (id.startsWith("suggest:")) { const r = addVoucherBrand(id.slice(8)); if (r.id) set(r.id); } else set(id); };
  const voucherAdder = { label: "Add voucher", placeholder: "e.g. Flipkart, BookMyShow", add: addVoucherBrand };
  const [notes, setNotes] = useState(record.notes ?? "");
  const [excluded, setExcluded] = useState(record.excluded);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [more, setMore] = useState(!!record.recurringId || !!record.recurringHint || record.excluded || record.kind !== "purchase");
  const changed = [kind !== "purchase", !!recurringId, excluded].filter(Boolean).length;
  const dueDay = Math.min(28, Math.max(1, Number(date.slice(8, 10)) || 1));
  const amountPaise = adding ? (parseRupees(amountText) ?? 0) : record.amountPaise;
  // Quick picks for manual entry: the places you pay most often, with the category you used last time.
  const quick = useMemo(() => {
    if (!adding) return [];
    const seen = new Map<string, { merchant: string; categoryId: string; n: number }>();
    for (const r of [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300)) {
      if (r.kind !== "purchase" || !r.merchant.trim()) continue;
      const k = r.merchant.toLowerCase();
      const cur = seen.get(k);
      if (cur) cur.n++; else seen.set(k, { merchant: r.merchant, categoryId: r.categoryId, n: 1 });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [adding, records]);
  const sharing = split.mode !== "personal" || payerId !== meId;
  const isUpi = accounts.find((a) => a.id === accountId)?.type === "upi";
  const splitError = topUp ? null : validateSplit(amountPaise, split);
  const missing = adding ? (!accountId ? "Add a payment method first (Settings)" : amountPaise <= 0 ? "Enter an amount" : !merchant.trim() ? "Enter a merchant" : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick a date" : null) : null;
  // New rows must say which voucher (or decide later). Editing something that is already approved is never blocked by it.
  const voucherProblem = promptVoucher && !voucherId && !voucherLater && record.status !== "reviewed" ? "Pick the wallet that was topped up, or choose Decide later" : voucherId && walletId ? "A payment cannot both buy a voucher and be paid with one" : null;
  const bad = splitError ?? missing ?? voucherProblem;

  const onAmount = (v: string) => {
    setAmountText(v);
    const p = parseRupees(v) ?? 0;
    if (split.mode === "custom" && p > 0) setSplit({ ...split, values: equalSplit(p, split.participantIds) });
  };

  const save = (action: "close" | "next" | "another" | "draft") => {
    // "Repeat every month": turn this payment into a recurring item (usual amount, due day, split) and link it.
    let linkId = recurringId;
    if (recurringId === NEW_RECURRING) {
      linkId = `rc_${Math.random().toString(36).slice(2, 10)}`;
      const err = saveRecurring({ id: linkId, name: merchant.trim() || "Recurring payment", categoryId, dueDay, expectedPaise: amountPaise, payerId, split });
      if (err) { setRecurringError(err); setMore(true); return; }
    }
    const fields = {
      merchant: merchant.trim(), categoryId, kind: voucherId ? ("purchase" as const) : kind, voucherBrandId: voucherId || undefined, paidWithVoucherId: walletId || undefined, voucherPending: voucherLater && !voucherId ? true : undefined, payerId, split: topUp ? { mode: "personal" as const, participantIds: [payerId] } : split, shared: topUp ? false : split.mode !== "personal", notes: notes || undefined, excluded,
      recurringId: linkId || undefined, paidCardId: kind === "cc_payment" ? paidCardId || undefined : undefined, recurringHint: undefined, fundedBy: isUpi ? fundedBy || undefined : undefined, status: "reviewed" as const,
    };
    if (adding) {
      // Bought from a wallet: it belongs to the card that topped the wallet up last (the wallet itself is the funding source).
      // The wallet's own payment method when there is one (Amazon Pay under Amex), otherwise the card that last topped it up.
      const brand = voucherBrands.find((b) => b.id === paidWithId);
      const topUpAccount = paidWithId ? walletAccountFor(brand, accounts)?.id ?? [...records].filter((r) => r.voucherBrandId === paidWithId).sort((a, b) => b.date.localeCompare(a.date))[0]?.accountId : undefined;
      addRecord({ ...record, ...fields, date, accountId: topUpAccount ?? accountId, amountPaise });
      onAdded?.(`Added ${fields.merchant} ${formatINR(amountPaise)}`);
      if (action === "another") onAnother?.(); else onClose();
      return;
    }
    const patch = { ...fields, fundedBy: isUpi ? fundedBy || undefined : record.fundedBy };
    if (mode === "review") {
      if (action === "draft") updateStaged(record.id, patch); else approveStaged(record.id, patch);
      if (action === "next" && next) next.open(); else onClose();
      return;
    }
    updateRecord(record.id, patch);
    if (action === "next" && next) next.open(); else onClose();
  };

  return (
    <div className="space-y-4">
      {adding ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/[0.04] p-4">
          <label className="min-w-[10rem] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted/80">Amount</span>
            <span className="flex items-baseline gap-1.5"><span className="text-3xl font-semibold text-accent">₹</span>
              <input autoFocus aria-label="Amount" inputMode="decimal" placeholder="0.00" className="num w-full min-w-0 bg-transparent text-4xl font-semibold tracking-tight placeholder:text-muted/40 focus:outline-none" value={amountText} onChange={(e) => onAmount(e.target.value)} /></span>
          </label>
          <label className="relative inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-sm font-medium shadow-sm focus-within:outline-2 focus-within:outline-accent">
            <CalendarDays size={16} aria-hidden className="text-accent" />
            <span className="num">{date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Pick a date"}</span>
            <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </div>
      ) : (
        <div className="rounded-xl bg-background p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="num text-lg font-semibold">{formatINR(record.amountPaise)}</span>
            <span className="text-xs text-muted">{record.date} · {accountName(record.accountId)}{record.fundedBy ? ` via ${accountName(record.fundedBy)}` : ""}</span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted" title="Original bank text, never edited">{record.originalDescription}</div>
        </div>
      )}
      {mode === "review" && (record.suggested === "ai" || record.suggested === "ai_unsure") && (
        <p className="flex items-center gap-2 text-xs text-muted"><AiBadge tone={record.suggested === "ai" ? "ai" : "unsure"}>{record.suggested === "ai" ? "AI-powered" : "AI unsure"}</AiBadge>The merchant name and category were suggested by AI. Approving confirms them and teaches the app.</p>
      )}
      {mode === "review" && record.suggested === "memory" && <p className="text-xs text-muted">Filled in from what you approved before.</p>}
      {mode === "review" && dupOf && (
        <p role="note" className="rounded-xl bg-warn-soft p-2.5 text-xs text-warn">Possible duplicate of {dupOf.merchant} on {dupOf.date} ({formatINR(dupOf.amountPaise)}). Approve only if this is a separate purchase; otherwise reject it.</p>
      )}
      {adding && !paidWithId && <FormRow label="Paid with"><CompactChips label="Payment method" options={primaries.map((a) => ({ id: a.id, label: shortName(a.name), icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[primaryId]} onPick={(id) => { setPrimaryId(id); setSubId(""); }} /></FormRow>}
      {adding && !paidWithId && subs.length > 0 && (
        <FormRow label="Via">
          <CompactChips label="Sub payment method" options={[{ id: "", label: "Direct" }, ...subs.map((a) => ({ id: a.id, label: shortName(a.name), icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[subId]} onPick={setSubId} />
          <p className="mt-1.5 text-xs text-muted">{subId ? "" : `Direct means paid with ${accounts.find((a) => a.id === primaryId)?.name} itself. `}Pick a sub payment method only if the money went through it.</p>
        </FormRow>
      )}
      {adding && impliedBrand && <p className="-mt-1 rounded-xl bg-accent/5 px-3 py-2 text-xs text-muted">Paid from the {impliedBrand.name} wallet: it is not counted as spending again (the top-up already was). Split it below and the others owe you their share.</p>}
      {voucherBrands.length > 0 && !topUp && !impliedBrand && kind === "purchase" && (!!paidWithId || !accounts.some((a) => a.type === "wallet" && !a.archived)) && (
        <FormRow label="From wallet">
          <CompactChips label="Paid from a voucher wallet" options={[{ id: "", label: "No" }, ...voucherBrands.map((b) => ({ id: b.id, label: `${b.name} wallet` }))]} selected={[paidWithId]} onPick={setPaidWithId} />
          {paidWithId && <p className="mt-1.5 text-xs text-muted">Paid from the {voucherBrands.find((b) => b.id === paidWithId)?.name} wallet, so it is not counted as spending again (the top-up already was). Split it below and the others owe you their share.</p>}
        </FormRow>
      )}
      <FormRow label="Merchant">
        <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Where did you pay?" />
        {adding && !merchant && quick.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Places you pay often">
            {quick.map((q) => <button key={q.merchant} type="button" onClick={() => { setMerchant(q.merchant); setCategoryId(q.categoryId); }} className="rounded-full bg-background px-2.5 py-1 text-xs text-muted hover:text-foreground">{q.merchant}</button>)}
          </div>
        )}
      </FormRow>
      <FormRow label="Note">
        <Input aria-label="Note" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="What was this for? Helps AI" />
      </FormRow>
      <FormRow label="Category"><CompactChips label="Category" options={categories.map((c) => ({ id: c.id, label: c.name, icon: <CategoryGlyph name={c.name} icon={c.icon} /> }))} selected={[categoryId]} onPick={setCategoryId} adder={{ label: "Add category", placeholder: "New category, e.g. Pet care", add: addCategory }} /></FormRow>
      {promptVoucher && (
        <FormRow label="Wallet">
          <CompactChips label="Wallet topped up" options={[...brandOptions, { id: "__later", label: "Decide later" }]} selected={voucherLater && !voucherId ? ["__later"] : voucherId ? [voucherId] : []}
            onPick={(id) => { if (id === "__later") { setVoucherLater(true); setVoucherId(""); } else { setVoucherLater(false); pickBrand(id, setVoucherId); } }} adder={voucherAdder} />
          <p className="mt-1.5 text-xs text-muted">Which wallet is this topping up? It is recorded under {accountName(accountId)} › {merchant || "this merchant"} › the wallet you pick, adds to that wallet&apos;s balance, and counts once as money spent. It is never split. Statement text is never changed.</p>
          {!voucherId && !voucherLater && record.status !== "reviewed" && <p role="alert" className="mt-1 text-xs font-medium text-warn">Choose a wallet to continue.</p>}
        </FormRow>
      )}
      {topUp
        ? <p className="border-t border-border pt-3 text-xs text-muted">A wallet top-up is your own money going into the wallet, so it is not split or shared. Split the purchases you make from the wallet instead.</p>
        : <div className="border-t border-border pt-3"><SplitEditor key={split.mode === "custom" ? amountPaise : "s"} total={amountPaise} value={split} onChange={setSplit} /></div>}
      {(sharing || !adding) && !topUp && <FormRow label="Paid by"><CompactChips label="Paid by" options={participants.map((p) => ({ id: p.id, label: p.name, icon: <PersonGlyph name={p.name} id={p.id} /> }))} selected={[payerId]} onPick={setPayerId} /></FormRow>}
      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 text-left transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">
        <Dot icon={SlidersHorizontal} tone="bg-accent/10 text-accent" size={32} />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">More options</span><span className="block truncate text-xs text-muted">Type, recurring, hide from reports</span></span>
        {!more && changed > 0 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{changed} set</span>}
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && (
        <div className="space-y-2.5">
          <FormRow label="Type"><CompactChips label="Type" options={kinds} selected={[kind]} onPick={setKind} /></FormRow>
          {!promptVoucher && kind === "purchase" && !walletId && (!!voucherId || !accounts.some((x) => x.type === "wallet" && !x.archived)) && (
            <FormRow label="Tops up wallet"><CompactChips label="Wallet topped up" options={[{ id: "", label: "No", icon: <Dot icon={Ban} /> }, ...brandOptions]} selected={[voucherId]} onPick={(id) => pickBrand(id, setVoucherId)} adder={voucherAdder} /></FormRow>
          )}
          {kind === "cc_payment" && (
            <FormRow label="Which card"><CompactChips label="Credit card that was paid" options={[{ id: "", label: "Not sure" }, ...accounts.filter((a) => a.type === "credit_card").map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[paidCardId]} onPick={setPaidCardId} /></FormRow>
          )}
          {isUpi && (
            <FormRow label="From bank"><CompactChips label="Paid from bank" options={[{ id: "", label: "Unknown" }, ...accounts.filter((a) => a.type === "bank").map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[fundedBy]} onPick={setFundedBy} /></FormRow>
          )}
          <FormRow label="Recurring">
            <CompactChips label="Recurring commitment" options={[{ id: "", label: "None", icon: <Dot icon={Ban} /> }, ...recurringItems.map((i) => ({ id: i.id, label: i.place ? `${i.name} · ${i.place.split(",")[0]}` : i.name, icon: <Dot icon={Repeat} tone="bg-red-100 text-red-700" /> })), { id: NEW_RECURRING, label: "Repeat every month", icon: <Dot icon={Plus} tone="bg-accent/10 text-accent" /> }]} selected={[recurringId]} onPick={(v) => { setRecurringId(v); setRecurringError(null); }} />
            {record.recurringHint && !record.recurringId && <p className="mt-1.5 text-xs text-muted">This looks like a monthly payment (EMI, rent, premium or similar). Approving it adds it to Recurring; choose None if it is not.</p>}
            {recurringId === NEW_RECURRING && <p className="mt-1.5 text-xs text-muted">Adds “{merchant.trim() || "this payment"}” to Recurring: {formatINR(amountPaise)} due on the {dueDay}{[11, 12, 13].includes(dueDay) ? "th" : ["th", "st", "nd", "rd"][dueDay % 10 < 4 ? dueDay % 10 : 0]} each month, split the same way. You can change it later under Recurring.</p>}
            {recurringError && <p role="alert" className="mt-1.5 text-xs text-danger">{recurringError}</p>}
          </FormRow>
          <FormRow label="Reports">
            <button type="button" aria-pressed={excluded} onClick={() => setExcluded(!excluded)} title="Exclude from reports (original record is kept)"
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm ${excluded ? "border-danger bg-danger/10 text-danger" : "border-transparent bg-background"}`}><EyeOff size={16} aria-hidden />{excluded ? "Excluded from reports" : "Exclude from reports"}</button>
          </FormRow>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center">
        {/* One clear main action; the rest sit quietly beside or below it. */}
        <Button variant="primary" className="w-full sm:order-last sm:ml-auto sm:w-auto" onClick={() => save(mode !== "add" && next && next.remaining > 0 ? "next" : "close")} disabled={!!bad}>
          {adding ? "Add" : mode === "review" ? (next && next.remaining > 0 ? `Approve & next (${next.remaining})` : "Approve") : next && next.remaining > 0 ? `Save & next (${next.remaining})` : "Save"}
        </Button>
        <div className="flex items-center justify-between gap-1 sm:justify-start">
          {mode !== "add" && <Button variant="danger" onClick={() => setDeleting(true)} className="border-0" aria-label="Delete transaction"><Trash2 size={15} aria-hidden /><span>Delete</span></Button>}
          {mode === "review" && <Button onClick={() => save("draft")} disabled={!!bad} className="border-0">Save draft</Button>}
          {mode !== "review" && <Button onClick={onClose} className="border-0">Cancel</Button>}
          {adding && <Button onClick={() => save("another")} disabled={!!bad} className="border-0">Add another</Button>}
          {mode !== "add" && next && next.remaining > 0 && <Button onClick={() => save("close")} disabled={!!bad} className="border-0">{mode === "review" ? "Approve only" : "Save only"}</Button>}
        </div>
        {mode !== "add" && (
          <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} title="Delete this transaction?" onConfirm={() => { deleteRecords([record.id]); onClose(); }}>
            <p><strong>{record.merchant}</strong> · {formatINR(record.amountPaise)} · {record.date}</p>
            <p className="text-muted">{record.status === "reviewed" ? "It will disappear from your reports, balances and dashboard. " : "It will be removed from the review queue. "}The original line stays in the import history, so you can tell what was removed. This cannot be undone.</p>
          </ConfirmDialog>
        )}
      </div>
    </div>
  );
}
