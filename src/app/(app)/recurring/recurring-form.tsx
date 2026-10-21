"use client";
import { useState } from "react";
import { CategoryGlyph, PersonGlyph } from "@/components/glyphs";
import { PaymentPicker } from "@/components/payment-picker";
import { SplitEditor } from "@/components/split-editor";
import { Button, CompactChips, Dialog, Field, FormRow, Input, Select } from "@/components/ui";
import { useStore } from "@/data/store";
import { parseRupees } from "@/domain/money";
import { equalSplit } from "@/domain/splits";
import { plannedFor } from "@/domain/recurring";
import { formatINR } from "@/domain/money";
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
  const { categories, participants, nameOf, recurringItems, meId, saveRecurring, addCategory, month: viewMonth } = useStore();
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? (plannedFor(item, viewMonth) / 100).toFixed(2) : "");
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? 1));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "rent");
  const [place, setPlace] = useState(item?.place ?? "");
  const [accountId, setAccountId] = useState(item?.accountId ?? "");
  const [incoming, setIncoming] = useState(item?.direction === "in");
  const [until, setUntil] = useState(item?.until?.slice(0, 7) ?? "");
  const [forever, setForever] = useState(!item?.until);
  const [every, setEvery] = useState(String(item?.everyMonths ?? 1));
  const [startMonth, setStartMonth] = useState(item?.startMonth ?? viewMonth);
  const [varies, setVaries] = useState(!!item?.amountVaries);
  // Changing the amount of an existing item: from which month does the new amount apply?
  const [changeFrom, setChangeFrom] = useState(viewMonth);
  const [changeMode, setChangeMode] = useState<"from" | "all">("from");
  const [payerId, setPayerId] = useState(item?.payerId ?? meId);
  const [split, setSplit] = useState<SplitConfig>(item?.split ?? { mode: "personal", participantIds: [meId] });
  const [error, setError] = useState<string | null>(null);
  const expectedPaise = parseRupees(amount) ?? 0;
  const places = [...new Set(recurringItems.map((r) => r.place).filter((p): p is string => !!p))];
  const sharing = split.mode !== "personal" || payerId !== meId;
  const amountChanged = !!item && expectedPaise > 0 && expectedPaise !== plannedFor(item, viewMonth);
  const category = categories.some((c) => c.id === categoryId) ? categoryId : categories[0]?.id ?? "uncategorized";

  const onAmount = (v: string) => {
    setAmount(v);
    const p = parseRupees(v) ?? 0;
    if (split.mode === "custom" && p > 0) setSplit({ ...split, values: equalSplit(p, split.participantIds) });
  };
  const save = () => {
    let base = expectedPaise;
    let changes = item?.changes;
    if (item && !varies && amountChanged) {
      if (changeMode === "all") changes = undefined;
      else { base = item.expectedPaise; changes = [...(item.changes ?? []).filter((c) => c.from !== changeFrom), { from: changeFrom, paise: expectedPaise }].sort((a, b) => a.from.localeCompare(b.from)); }
    }
    if (!forever && !until) return setError("Pick the last month, or choose Forever.");
    const err = saveRecurring({ id: item?.id, name, categoryId: category, dueDay: Number(dueDay), expectedPaise: base, payerId, split, place, ...(incoming ? { direction: "in" as const } : {}), ...(accountId ? { accountId } : {}), ...(!forever && until ? { until } : {}), ...(Number(every) > 1 ? { everyMonths: Number(every), startMonth } : {}), ...(varies ? { amountVaries: true } : {}), ...(changes?.length ? { changes } : {}) });
    if (err) return setError(err);
    onClose();
  };

  return (
    <div className="space-y-3">
      <FormRow label="Type"><CompactChips label="Money going out or coming in" options={[{ id: "out", label: "Money going out" }, { id: "in", label: "Money coming in" }]} selected={[incoming ? "in" : "out"]} onPick={(id) => setIncoming(id === "in")} /></FormRow>
      <FormRow label="Name"><Input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder={incoming ? "e.g. Salary, Rent from tenant" : "e.g. Rent, Car EMI, Life insurance"} maxLength={80} /></FormRow>
      <FormRow label="Amount" tip="For bills that change (electricity, phone), choose Different each bill. We expect about the last amount.">
        <div className="flex items-center gap-2"><span className="text-lg font-semibold">₹</span><Input aria-label="Usual monthly amount" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="0.00" className="max-w-40" /><span className="text-xs text-muted">every month</span></div>
      </FormRow>
      <FormRow label="Each bill"><CompactChips label="Amount pattern" options={[{ id: "same", label: "Same amount" }, { id: "varies", label: "Different each bill" }]} selected={[varies ? "varies" : "same"]} onPick={(id) => setVaries(id === "varies")} /></FormRow>
      {item && !varies && amountChanged && (
        <div className="space-y-2 rounded-xl bg-accent/5 p-3 text-xs text-muted">
          <div>The amount changed from {formatINR(plannedFor(item, viewMonth))} to {formatINR(expectedPaise)} (a rent increase, for example). Earlier months keep the old amount.</div>
          <CompactChips label="When the new amount applies" options={[{ id: "from", label: "From a month" }, { id: "all", label: "I mistyped: fix all months" }]} selected={[changeMode]} onPick={(id) => setChangeMode(id)} />
          {changeMode === "from" && <div className="flex items-center gap-2"><span>Applies from</span><Input type="month" aria-label="New amount applies from" value={changeFrom} onChange={(e) => setChangeFrom(e.target.value)} className="max-w-44" /></div>}
        </div>
      )}
      {item?.changes?.length ? <p className="text-xs text-muted">Planned changes: {item.changes.map((c) => `${formatINR(c.paise)} from ${c.from}`).join(", ")}.</p> : null}
      <FormRow label="Billed"><CompactChips label="How often it is billed" options={[{ id: "1", label: "Every month" }, { id: "2", label: "Every 2 months" }, { id: "3", label: "Every 3 months" }, { id: "6", label: "Every 6 months" }, { id: "12", label: "Yearly" }]} selected={[every]} onPick={setEvery} /></FormRow>
      {Number(every) > 1 && <FormRow label="First bill"><Input type="month" aria-label="Month of the first bill" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="max-w-44" /></FormRow>}
      <FormRow label="Due on">
        <Select aria-label="Due day" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="max-w-40">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{ordinal(d)} of the month</option>)}
        </Select>
      </FormRow>
      <FormRow label="Until" tip="Pick a last month for something that ends, like an EMI.">
        <div className="space-y-2">
          <CompactChips label="Until when" options={[{ id: "forever", label: "Forever" }, { id: "month", label: "Until a month" }]} selected={[forever ? "forever" : "month"]} onPick={(id) => { setForever(id === "forever"); if (id === "month" && !until) setUntil(viewMonth); }} />
          {!forever && <Input type="month" aria-label="Recurring until" value={until} onChange={(e) => setUntil(e.target.value)} className="max-w-44" />}
        </div>
      </FormRow>
      <PaymentPicker optional value={accountId} onChange={setAccountId} />
      <FormRow label="Category"><CompactChips label="Category" options={categories.map((c) => ({ id: c.id, label: c.name, icon: <CategoryGlyph name={c.name} icon={c.icon} /> }))} selected={[category]} onPick={setCategoryId} adder={{ label: "Add category", placeholder: "New category, e.g. Pet care", add: addCategory }} /></FormRow>
      <Field label="Where (optional)">
        <Input list="recurring-places" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Our apartment, Parents' house" maxLength={120} />
        <datalist id="recurring-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <div className="border-t border-border pt-3"><SplitEditor key={split.mode === "custom" ? expectedPaise : "s"} total={expectedPaise} value={split} onChange={(v) => { setSplit(v); setError(null); }} /></div>
      {sharing && <FormRow label="Paid by"><CompactChips label="Paid by" options={participants.map((p) => ({ id: p.id, label: nameOf(p.id), icon: <PersonGlyph name={nameOf(p.id)} id={p.id} /> }))} selected={[payerId]} onPick={setPayerId} /></FormRow>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim() || expectedPaise <= 0} onClick={save}>{item ? "Save" : "Add"}</Button>
      </div>
    </div>
  );
}
