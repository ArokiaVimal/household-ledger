"use client";
import { ChevronDown, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { equalSplit, validateSplit } from "@/domain/splits";
import type { ExpenseRecord, SplitConfig, TxnKind } from "@/domain/types";
import { SplitEditor } from "./split-editor";
import { MerchantAvatar } from "./txn-row";
import { AiBadge, Button, CompactChips, ConfirmDialog, Dialog, FormRow, Input } from "./ui";

const NEW_RECURRING = "__new_recurring";
const kinds: { id: TxnKind; label: string }[] = [
  { id: "purchase", label: "Purchase" },
  { id: "refund", label: "Refund" },
  { id: "fee", label: "Fee" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
  { id: "cc_payment", label: "Card bill" },
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
  const { meId, accounts, participants, recurringItems, categories, records, staged, updateRecord, addRecord, updateStaged, approveStaged, deleteRecords, accountName, saveRecurring, addCategory } = useStore();
  const [deleting, setDeleting] = useState(false);
  const dupOf = record.duplicateOf ? [...records, ...staged].find((r) => r.id === record.duplicateOf) : undefined;
  const adding = mode === "add";
  const [merchant, setMerchant] = useState(record.merchant);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(record.date);
  const [accountId, setAccountId] = useState(record.accountId);
  const [categoryId, setCategoryId] = useState(record.categoryId);
  const [kind, setKind] = useState(record.kind);
  const [payerId, setPayerId] = useState(record.payerId);
  const [split, setSplit] = useState<SplitConfig>(record.split);
  const [recurringId, setRecurringId] = useState(record.recurringId ?? "");
  const [fundedBy, setFundedBy] = useState(record.fundedBy ?? "");
  const [paidCardId, setPaidCardId] = useState(record.paidCardId ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [excluded, setExcluded] = useState(record.excluded);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [more, setMore] = useState(!!record.recurringId || record.excluded || record.kind !== "purchase");
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
  const splitError = validateSplit(amountPaise, split);
  const missing = adding ? (!accountId ? "Add a payment method first (Settings)" : amountPaise <= 0 ? "Enter an amount" : !merchant.trim() ? "Enter a merchant" : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick a date" : null) : null;
  const bad = splitError ?? missing;

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
      merchant: merchant.trim(), categoryId, kind, payerId, split, shared: split.mode !== "personal", notes: notes || undefined, excluded,
      recurringId: linkId || undefined, paidCardId: kind === "cc_payment" ? paidCardId || undefined : undefined, fundedBy: isUpi ? fundedBy || undefined : undefined, status: "reviewed" as const,
    };
    if (adding) {
      addRecord({ ...record, ...fields, date, accountId, amountPaise });
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
    <div className="space-y-3">
      {adding ? (
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-background p-3">
          <label className="flex items-center gap-1.5"><span className="text-lg font-semibold">₹</span>
            <Input autoFocus aria-label="Amount" inputMode="decimal" placeholder="0.00" className="text-lg font-semibold" value={amountText} onChange={(e) => onAmount(e.target.value)} /></label>
          <Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
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
      {adding && <FormRow label="Paid with"><CompactChips label="Payment method" options={accounts.map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))} selected={[accountId]} onPick={setAccountId} /></FormRow>}
      <FormRow label="Merchant">
        <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Where did you pay?" />
        {adding && !merchant && quick.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Places you pay often">
            {quick.map((q) => <button key={q.merchant} type="button" onClick={() => { setMerchant(q.merchant); setCategoryId(q.categoryId); }} className="rounded-full bg-background px-2.5 py-1 text-xs text-muted hover:text-foreground">{q.merchant}</button>)}
          </div>
        )}
      </FormRow>
      <FormRow label="Category"><CompactChips label="Category" options={categories.map((c) => ({ id: c.id, label: c.name }))} selected={[categoryId]} onPick={setCategoryId} adder={{ label: "Add category", placeholder: "New category, e.g. Pet care", add: addCategory }} /></FormRow>
      <div className="border-t border-border pt-3"><SplitEditor key={split.mode === "custom" ? amountPaise : "s"} total={amountPaise} value={split} onChange={setSplit} /></div>
      {(sharing || !adding) && <FormRow label="Paid by"><CompactChips label="Paid by" options={participants.map((p) => ({ id: p.id, label: p.name }))} selected={[payerId]} onPick={setPayerId} /></FormRow>}
      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex w-full items-center gap-1.5 border-t border-border pt-3 text-sm font-medium text-muted hover:text-foreground">
        <ChevronDown size={16} aria-hidden className={more ? "" : "-rotate-90"} /> More options <span className="text-xs font-normal">type, recurring, notes</span>
      </button>
      {more && (
        <div className="space-y-2.5">
          <FormRow label="Type"><CompactChips label="Type" options={kinds} selected={[kind]} onPick={setKind} /></FormRow>
          {kind === "cc_payment" && (
            <FormRow label="Which card"><CompactChips label="Credit card that was paid" options={[{ id: "", label: "Not sure" }, ...accounts.filter((a) => a.type === "credit_card").map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[paidCardId]} onPick={setPaidCardId} /></FormRow>
          )}
          {isUpi && (
            <FormRow label="From bank"><CompactChips label="Paid from bank" options={[{ id: "", label: "Unknown" }, ...accounts.filter((a) => a.type === "bank").map((a) => ({ id: a.id, label: a.name, icon: <MerchantAvatar name={a.name} size={24} /> }))]} selected={[fundedBy]} onPick={setFundedBy} /></FormRow>
          )}
          <FormRow label="Recurring">
            <CompactChips label="Recurring commitment" options={[{ id: "", label: "None" }, ...recurringItems.map((i) => ({ id: i.id, label: i.place ? `${i.name} · ${i.place.split(",")[0]}` : i.name })), { id: NEW_RECURRING, label: "Repeat every month" }]} selected={[recurringId]} onPick={(v) => { setRecurringId(v); setRecurringError(null); }} />
            {recurringId === NEW_RECURRING && <p className="mt-1.5 text-xs text-muted">Adds “{merchant.trim() || "this payment"}” to Recurring: {formatINR(amountPaise)} due on the {dueDay}{[11, 12, 13].includes(dueDay) ? "th" : ["th", "st", "nd", "rd"][dueDay % 10 < 4 ? dueDay % 10 : 0]} each month, split the same way. You can change it later under Recurring.</p>}
            {recurringError && <p role="alert" className="mt-1.5 text-xs text-danger">{recurringError}</p>}
          </FormRow>
          <FormRow label="Notes">
            <div className="flex items-center gap-2">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              <button type="button" aria-pressed={excluded} onClick={() => setExcluded(!excluded)} title="Exclude from reports (original record is kept)"
                className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${excluded ? "border-danger bg-danger/10 text-danger" : "border-border bg-surface"}`}>Exclude</button>
            </div>
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
