"use client";
import { useState } from "react";
import { accounts, categories, participants, recurringItems } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { validateSplit } from "@/domain/splits";
import type { ExpenseRecord, SplitConfig, TxnKind } from "@/domain/types";
import { SplitEditor } from "./split-editor";
import { Button, ChipGroup, Dialog, FormRow, Input } from "./ui";

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
      {record && <Form key={record.id} record={record} onClose={onClose} next={next} />}
    </Dialog>
  );
}

function Form({ record, onClose, next }: { record: ExpenseRecord; onClose: () => void; next?: Props["next"] }) {
  const { updateRecord, accountName } = useStore();
  const [merchant, setMerchant] = useState(record.merchant);
  const [categoryId, setCategoryId] = useState(record.categoryId);
  const [kind, setKind] = useState(record.kind);
  const [payerId, setPayerId] = useState(record.payerId);
  const [split, setSplit] = useState<SplitConfig>(record.split);
  const [recurringId, setRecurringId] = useState(record.recurringId ?? "");
  const [fundedBy, setFundedBy] = useState(record.fundedBy ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [excluded, setExcluded] = useState(record.excluded);
  const isUpi = accounts.find((a) => a.id === record.accountId)?.type === "upi";
  const bad = validateSplit(record.amountPaise, split);

  const save = (andNext: boolean) => {
    updateRecord(record.id, {
      merchant, categoryId, kind, payerId, split, shared: split.mode !== "personal", notes: notes || undefined, excluded,
      recurringId: recurringId || undefined, fundedBy: isUpi ? fundedBy || undefined : record.fundedBy, status: "reviewed",
    });
    if (andNext && next) next.open(); else onClose();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-background p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-lg font-semibold">{formatINR(record.amountPaise)}</span>
          <span className="text-xs text-muted">{record.date} · {accountName(record.accountId)}{record.fundedBy ? ` via ${accountName(record.fundedBy)}` : ""}</span>
        </div>
        <div className="mt-1 truncate font-mono text-xs text-muted" title="Original bank text, never edited">{record.originalDescription}</div>
      </div>

      <FormRow label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></FormRow>
      <FormRow label="Category"><ChipGroup label="Category" options={categories.map((c) => ({ id: c.id, label: c.name }))} value={categoryId} onChange={setCategoryId} /></FormRow>
      <FormRow label="Type"><ChipGroup label="Type" options={kinds} value={kind} onChange={setKind} /></FormRow>
      <FormRow label="Paid by"><ChipGroup label="Paid by" options={participants.map((p) => ({ id: p.id, label: p.name }))} value={payerId} onChange={setPayerId} /></FormRow>
      {isUpi && (
        <FormRow label="Paid from bank"><ChipGroup label="Paid from bank" options={[{ id: "", label: "Unknown" }, ...accounts.filter((a) => a.type === "bank").map((a) => ({ id: a.id, label: a.name }))]} value={fundedBy} onChange={setFundedBy} /></FormRow>
      )}
      <FormRow label="Who owes what"><SplitEditor total={record.amountPaise} value={split} onChange={setSplit} /></FormRow>
      <FormRow label="Recurring">
        <ChipGroup label="Recurring commitment" options={[{ id: "", label: "Not recurring" }, ...recurringItems.map((i) => ({ id: i.id, label: i.place ? `${i.name} · ${i.place.split(",")[0]}` : i.name }))]} value={recurringId} onChange={setRecurringId} />
      </FormRow>
      <FormRow label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></FormRow>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Exclude from reports (original record is kept)
      </label>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        {next && next.remaining > 0 && <Button onClick={() => save(true)} disabled={!!bad}>Save & next ({next.remaining} left)</Button>}
        <Button variant="primary" onClick={() => save(false)} disabled={!!bad}>Save</Button>
      </div>
    </div>
  );
}
