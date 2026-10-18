"use client";
import { useState } from "react";
import { MOCK_TODAY, ME, accounts, categories, participants, recurringItems } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR, parseRupees } from "@/domain/money";
import { equalSplit, validateSplit } from "@/domain/splits";
import type { ExpenseRecord, SplitConfig, TxnKind } from "@/domain/types";
import { SplitEditor } from "./split-editor";
import { Button, CompactChips, Dialog, FormRow, Input } from "./ui";

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

/** Manual entry. `round` changes after "Add another" so the form resets. */
export function TxnAddDialog({ open, round, onClose, onAnother, onAdded }: { open: boolean; round: number; onClose: () => void; onAnother: () => void; onAdded: (msg: string) => void }) {
  const { month } = useStore();
  const draft: ExpenseRecord = {
    id: "", date: MOCK_TODAY.startsWith(month) ? MOCK_TODAY : `${month}-01`, merchant: "", originalDescription: "Entered manually", amountPaise: 0, currency: "INR",
    accountId: accounts[0].id, categoryId: "uncategorized", kind: "purchase", payerId: ME, shared: false, split: { mode: "personal", participantIds: [ME] },
    excluded: false, status: "reviewed", importSource: "Manual entry",
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add transaction">
      {open && <Form key={round} mode="add" record={draft} onClose={onClose} onAnother={onAnother} onAdded={onAdded} />}
    </Dialog>
  );
}

function Form({ mode, record, onClose, next, onAnother, onAdded }: { mode: "edit" | "add"; record: ExpenseRecord; onClose: () => void; next?: Props["next"]; onAnother?: () => void; onAdded?: (msg: string) => void }) {
  const { updateRecord, addRecord, accountName } = useStore();
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
  const [notes, setNotes] = useState(record.notes ?? "");
  const [excluded, setExcluded] = useState(record.excluded);
  const amountPaise = adding ? (parseRupees(amountText) ?? 0) : record.amountPaise;
  const isUpi = accounts.find((a) => a.id === accountId)?.type === "upi";
  const splitError = validateSplit(amountPaise, split);
  const missing = adding ? (amountPaise <= 0 ? "Enter an amount" : !merchant.trim() ? "Enter a merchant" : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick a date" : null) : null;
  const bad = splitError ?? missing;

  const onAmount = (v: string) => {
    setAmountText(v);
    const p = parseRupees(v) ?? 0;
    if (split.mode === "custom" && p > 0) setSplit({ ...split, values: equalSplit(p, split.participantIds) });
  };

  const save = (action: "close" | "next" | "another") => {
    const fields = {
      merchant: merchant.trim(), categoryId, kind, payerId, split, shared: split.mode !== "personal", notes: notes || undefined, excluded,
      recurringId: recurringId || undefined, fundedBy: isUpi ? fundedBy || undefined : undefined, status: "reviewed" as const,
    };
    if (adding) {
      addRecord({ ...record, ...fields, date, accountId, amountPaise });
      onAdded?.(`Added ${fields.merchant} ${formatINR(amountPaise)}`);
      if (action === "another") onAnother?.(); else onClose();
      return;
    }
    updateRecord(record.id, { ...fields, fundedBy: isUpi ? fundedBy || undefined : record.fundedBy });
    if (action === "next" && next) next.open(); else onClose();
  };

  return (
    <div className="space-y-2.5">
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
      {adding && <FormRow label="Paid with"><CompactChips label="Payment method" options={accounts.map((a) => ({ id: a.id, label: a.name }))} selected={[accountId]} onPick={setAccountId} /></FormRow>}
      <FormRow label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></FormRow>
      <FormRow label="Category"><CompactChips label="Category" options={categories.map((c) => ({ id: c.id, label: c.name }))} selected={[categoryId]} onPick={setCategoryId} /></FormRow>
      <FormRow label="Type"><CompactChips label="Type" options={kinds} selected={[kind]} onPick={setKind} /></FormRow>
      <FormRow label="Paid by"><CompactChips label="Paid by" options={participants.map((p) => ({ id: p.id, label: p.name }))} selected={[payerId]} onPick={setPayerId} /></FormRow>
      {isUpi && (
        <FormRow label="From bank"><CompactChips label="Paid from bank" options={[{ id: "", label: "Unknown" }, ...accounts.filter((a) => a.type === "bank").map((a) => ({ id: a.id, label: a.name }))]} selected={[fundedBy]} onPick={setFundedBy} /></FormRow>
      )}
      <SplitEditor key={split.mode === "custom" ? amountPaise : "s"} total={amountPaise} value={split} onChange={setSplit} />
      <FormRow label="Recurring">
        <CompactChips label="Recurring commitment" options={[{ id: "", label: "None" }, ...recurringItems.map((i) => ({ id: i.id, label: i.place ? `${i.name} · ${i.place.split(",")[0]}` : i.name }))]} selected={[recurringId]} onPick={setRecurringId} />
      </FormRow>
      <FormRow label="Notes">
        <div className="flex items-center gap-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          <button type="button" aria-pressed={excluded} onClick={() => setExcluded(!excluded)} title="Exclude from reports (original record is kept)"
            className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${excluded ? "border-danger bg-danger/10 text-danger" : "border-border bg-surface"}`}>Exclude</button>
        </div>
      </FormRow>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        {adding && <Button onClick={() => save("another")} disabled={!!bad}>Add another</Button>}
        {!adding && next && next.remaining > 0 && <Button onClick={() => save("next")} disabled={!!bad}>Save & next ({next.remaining} left)</Button>}
        <Button variant="primary" onClick={() => save("close")} disabled={!!bad}>{adding ? "Add" : "Save"}</Button>
      </div>
    </div>
  );
}
