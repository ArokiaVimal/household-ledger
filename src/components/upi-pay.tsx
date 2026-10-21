"use client";
import { Smartphone } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { upiPayLink } from "@/domain/upi";
import { cn } from "@/lib/cn";

/**
 * "Pay with UPI": opens your UPI app with the person, the amount and a note already filled in; you confirm there. Nothing is paid or
 * recorded from here, so afterwards you still record the payment as settled. Without their UPI id it asks for it once and remembers it.
 */
export function UpiPay({ personId, amountPaise, note, compact }: { personId: string; amountPaise: number; note?: string; compact?: boolean }) {
  const { participants, nameOf, setParticipantUpi } = useStore();
  const person = participants.find((p) => p.id === personId);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!person || amountPaise <= 0) return null;
  const cls = cn("inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface font-medium hover:bg-background", compact ? "min-h-9 px-3 text-sm" : "min-h-10 px-4 text-sm");
  if (person.upiId) {
    return <a href={upiPayLink({ upiId: person.upiId, name: nameOf(personId), amountPaise, note })} className={cls} aria-label={`Pay ${nameOf(personId)} ${formatINR(amountPaise)} with UPI`}><Smartphone size={15} aria-hidden />{compact ? "Pay" : `Pay ${formatINR(amountPaise)} with UPI`}</a>;
  }
  const save = () => { const err = setParticipantUpi(personId, value); if (err) setError(err); else { setOpen(false); setError(null); } };
  return (
    <>
      <button type="button" className={cls} onClick={() => { setValue(""); setError(null); setOpen(true); }}><Smartphone size={15} aria-hidden />{compact ? "Pay" : "Pay with UPI"}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Pay ${nameOf(personId)}`}>
        <form className="space-y-3 pb-1 text-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="text-muted">Add {nameOf(personId)}&apos;s UPI id once. After that, this button opens your UPI app with the amount filled in.</p>
          <Field label="UPI id" error={error}><Input autoFocus value={value} inputMode="email" autoCapitalize="none" autoCorrect="off" maxLength={80} placeholder="name@bank" onChange={(e) => { setValue(e.target.value); setError(null); }} /></Field>
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3"><Button type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!value.trim()}>Save</Button></div>
        </form>
      </Dialog>
    </>
  );
}
