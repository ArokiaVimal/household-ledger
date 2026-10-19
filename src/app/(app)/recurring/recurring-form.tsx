"use client";
import { useState } from "react";
import { SplitEditor } from "@/components/split-editor";
import { Button, CompactChips, Dialog, Field, FormRow, Input, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { parseRupees } from "@/domain/money";
import { equalSplit } from "@/domain/splits";
import type { RecurringItem, SplitConfig } from "@/domain/types";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Add or change a monthly commitment (rent, EMI, insurance, bills). `item` null = closed; `"new"` = blank form. */
export function RecurringDialog({ item, onClose }: { item: RecurringItem | "new" | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onClose={onClose} title={item === "new" ? "Add a recurring payment" : "Edit recurring payment"}>
      {item && <Form key={item === "new" ? "new" : item.id} item={item === "new" ? null : item} onClose={onClose} />}
    </Dialog>
  );
}

function Form({ item, onClose }: { item: RecurringItem | null; onClose: () => void }) {
  const { categories, participants, recurringItems, meId, saveRecurring, addCategory } = useStore();
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? (item.expectedPaise / 100).toFixed(2) : "");
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? 1));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "rent");
  const [place, setPlace] = useState(item?.place ?? "");
  const [payerId, setPayerId] = useState(item?.payerId ?? meId);
  const [split, setSplit] = useState<SplitConfig>(item?.split ?? { mode: "personal", participantIds: [meId] });
  const [error, setError] = useState<string | null>(null);
  const expectedPaise = parseRupees(amount) ?? 0;
  const places = [...new Set(recurringItems.map((r) => r.place).filter((p): p is string => !!p))];
  const sharing = split.mode !== "personal" || payerId !== meId;
  const category = categories.some((c) => c.id === categoryId) ? categoryId : categories[0]?.id ?? "uncategorized";

  const onAmount = (v: string) => {
    setAmount(v);
    const p = parseRupees(v) ?? 0;
    if (split.mode === "custom" && p > 0) setSplit({ ...split, values: equalSplit(p, split.participantIds) });
  };
  const save = () => {
    const err = saveRecurring({ id: item?.id, name, categoryId: category, dueDay: Number(dueDay), expectedPaise, payerId, split, place });
    if (err) return setError(err);
    onClose();
  };

  return (
    <div className="space-y-3">
      <FormRow label="Name"><Input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Rent, Car EMI, Life insurance" maxLength={80} /></FormRow>
      <FormRow label="Amount">
        <div className="flex items-center gap-2"><span className="text-lg font-semibold">₹</span><Input aria-label="Usual monthly amount" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="0.00" className="max-w-40" /><span className="text-xs text-muted">every month</span></div>
      </FormRow>
      <FormRow label="Due on">
        <Select aria-label="Due day" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="max-w-40">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{ordinal(d)} of the month</option>)}
        </Select>
      </FormRow>
      <FormRow label="Category"><CompactChips label="Category" options={categories.map((c) => ({ id: c.id, label: c.name }))} selected={[category]} onPick={setCategoryId} adder={{ label: "Add category", placeholder: "New category, e.g. Pet care", add: addCategory }} /></FormRow>
      <Field label="Where (optional)">
        <Input list="recurring-places" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Our apartment, Parents' house" maxLength={120} />
        <datalist id="recurring-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <div className="border-t border-border pt-3"><SplitEditor key={split.mode === "custom" ? expectedPaise : "s"} total={expectedPaise} value={split} onChange={(v) => { setSplit(v); setError(null); }} /></div>
      {sharing && <FormRow label="Paid by"><CompactChips label="Paid by" options={participants.map((p) => ({ id: p.id, label: p.name }))} selected={[payerId]} onPick={setPayerId} /></FormRow>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim() || expectedPaise <= 0} onClick={save}>{item ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
