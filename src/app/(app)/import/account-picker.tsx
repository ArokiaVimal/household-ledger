"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { MerchantAvatar } from "@/components/txn-row";
import { useStore } from "@/data/store";
import { cn } from "@/lib/cn";
import type { Account } from "@/domain/types";

const GROUPS: { title: string; types: Account["type"][] }[] = [
  { title: "Bank accounts", types: ["bank"] },
  { title: "Credit cards", types: ["credit_card"] },
  { title: "UPI apps", types: ["upi"] },
  { title: "Wallets", types: ["wallet", "cash"] },
];
const NEW_TYPES: { id: "bank" | "credit_card" | "upi"; label: string }[] = [{ id: "bank", label: "Bank account" }, { id: "credit_card", label: "Credit card" }, { id: "upi", label: "UPI app" }];

/** Payment methods grouped as bank accounts, credit cards and UPI apps, with a way to add one without leaving the import. */
export function AccountPicker({ accounts, selected, onPick, rank }: { accounts: Account[]; selected: string[]; onPick: (id: string) => void; /** Higher first inside each group (for example the ones the statement seems to be about). */ rank?: (a: Account) => number }) {
  const { addAccount, accounts: all } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"bank" | "credit_card" | "upi">("credit_card");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const banks = all.filter((a) => a.type === "bank" && !a.archived);

  const save = () => {
    const problem = type === "upi" && !parent ? "Choose the bank this UPI app pays from." : addAccount(name, type, type === "upi" ? parent : undefined);
    if (problem) return setError(problem);
    setAdded(name.trim()); setName(""); setError(null); setAdding(false);
  };

  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const items = accounts.filter((a) => g.types.includes(a.type)).sort((x, y) => (rank ? rank(y) - rank(x) : 0));
        if (items.length === 0) return null;
        return (
          <fieldset key={g.title} className="min-w-0">
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted/80">{g.title}</legend>
            <div className="flex flex-wrap gap-1.5">
              {items.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button key={a.id} type="button" aria-pressed={on} onClick={() => onPick(a.id)} className={cn("flex min-h-10 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3.5 text-sm transition-colors", on ? "border-accent bg-accent font-medium text-white" : "border-transparent bg-background text-foreground hover:border-border")}>
                    <MerchantAvatar name={a.name} size={26} />{a.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {added && !adding && <p role="status" className="text-sm text-good">{added} was added. Pick it above.</p>}
      {adding ? (
        <div className="space-y-2 rounded-2xl border border-border p-3">
          <div className="text-sm font-medium">Add a payment method</div>
          <Input aria-label="Name" placeholder="Name, for example ICICI Coral" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {NEW_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          {type === "upi" && (
            <Select aria-label="Pays from" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Pays from which bank?</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2"><Button onClick={() => { setAdding(false); setError(null); }}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>Add</Button></div>
        </div>
      ) : (
        <Button onClick={() => { setAdding(true); setAdded(null); }}><Plus size={16} aria-hidden />Add payment method</Button>
      )}
    </div>
  );
}
