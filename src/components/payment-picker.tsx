"use client";
// "Paid with" and "Via": pick a primary payment method, and only then (when it has any) one of the sub methods under it, or Direct.
// Same behaviour as the add-transaction form. `value` is the account id to store (the sub method when one is picked).
import { MerchantAvatar } from "@/components/txn-row";
import { CompactChips, FormRow } from "@/components/ui";
import { useStore } from "@/data/store";
import { shortName } from "@/domain/accounts";

export function PaymentPicker({ value, onChange, optional }: { value: string; onChange: (accountId: string) => void; /** Adds a "Not set" choice. */ optional?: boolean }) {
  const { accounts } = useStore();
  const cur = accounts.find((a) => a.id === value);
  const parent = cur?.parentId && accounts.some((a) => a.id === cur.parentId) ? cur.parentId : "";
  const primaryId = parent || (cur ? cur.id : "");
  const subId = parent ? value : "";
  const keep = (a: { id: string; archived?: boolean }) => !a.archived || a.id === primaryId || a.id === subId;
  const primaries = accounts.filter((a) => (!a.parentId || !accounts.some((x) => x.id === a.parentId)) && keep(a));
  const subs = accounts.filter((a) => a.parentId === primaryId && keep(a));
  const icon = (name: string) => <MerchantAvatar name={name} size={24} />;
  return (
    <>
      <FormRow label="Paid with"><CompactChips label="Payment method" options={[...(optional ? [{ id: "", label: "Not set" }] : []), ...primaries.map((a) => ({ id: a.id, label: shortName(a.name), icon: icon(a.name) }))]} selected={[primaryId]} onPick={(id) => onChange(id)} /></FormRow>
      {primaryId && subs.length > 0 && (
        <FormRow label="Via">
          <CompactChips label="Sub payment method" options={[{ id: "", label: "Direct" }, ...subs.map((a) => ({ id: a.id, label: shortName(a.name), icon: icon(a.name) }))]} selected={[subId]} onPick={(id) => onChange(id || primaryId)} />
          <p className="mt-1.5 text-xs text-muted">{subId ? "" : `Direct means paid with ${cur?.name ?? "it"} itself. `}Pick a sub payment method only if the money went through it.</p>
        </FormRow>
      )}
    </>
  );
}
