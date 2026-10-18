"use client";
import { useState } from "react";
import { accounts, categories, participants } from "@/data/mock";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { validateSplit } from "@/domain/splits";
import type { ExpenseRecord, SplitConfig, TxnKind } from "@/domain/types";
import { SplitEditor } from "./split-editor";
import { Button, Dialog, Field, Input, Select } from "./ui";

const kinds: TxnKind[] = ["purchase", "refund", "income", "transfer", "cc_payment", "fee"];

export function TxnEditDialog({ record, onClose }: { record: ExpenseRecord | null; onClose: () => void }) {
  return (
    <Dialog open={!!record} onClose={onClose} title="Edit transaction">
      {record && <Form key={record.id} record={record} onClose={onClose} />}
    </Dialog>
  );
}

function Form({ record, onClose }: { record: ExpenseRecord; onClose: () => void }) {
  const { updateRecord } = useStore();
  const [merchant, setMerchant] = useState(record.merchant);
  const [categoryId, setCategoryId] = useState(record.categoryId);
  const [kind, setKind] = useState(record.kind);
  const [payerId, setPayerId] = useState(record.payerId);
  const [split, setSplit] = useState<SplitConfig>(record.split);
  const [notes, setNotes] = useState(record.notes ?? "");
  const [excluded, setExcluded] = useState(record.excluded);
  const bad = validateSplit(record.amountPaise, split);

  const save = () => {
    updateRecord(record.id, { merchant, categoryId, kind, payerId, split, shared: split.mode !== "personal", notes: notes || undefined, excluded, status: "reviewed" });
    onClose();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-background p-2.5 text-xs text-muted">
        <div>Original (read-only): <span className="font-mono">{record.originalDescription}</span></div>
        <div className="num">{record.date} · {formatINR(record.amountPaise)} · {record.importSource}</div>
      </div>
      <Field label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as TxnKind)}>{kinds.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Paid by"><Select value={payerId} onChange={(e) => setPayerId(e.target.value)}>{participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Account"><Input value={accounts.find((a) => a.id === record.accountId)?.name} readOnly /></Field>
      </div>
      <Field label="Who owes what"><SplitEditor total={record.amountPaise} value={split} onChange={setSplit} /></Field>
      <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Exclude from reports (original record is kept)
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!!bad}>Save</Button>
      </div>
    </div>
  );
}
