"use client";
import { useState } from "react";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { categories } from "@/data/mock";
import { useStore } from "@/data/store";

interface Rule { merchant: string; categoryId: string }

export default function Categories() {
  const { records, updateRecord, categoryName } = useStore();
  const [rules, setRules] = useState<Rule[]>([{ merchant: "Swiggy", categoryId: "food_delivery" }, { merchant: "Zepto", categoryId: "groceries" }, { merchant: "Blinkit", categoryId: "groceries" }]);
  const [m, setM] = useState("");
  const [c, setC] = useState("groceries");
  const [msg, setMsg] = useState("");

  const apply = () => {
    let n = 0;
    for (const r of records) {
      const rule = rules.find((x) => x.merchant.toLowerCase() === r.merchant.toLowerCase());
      if (rule && r.status === "unreviewed" && r.categoryId !== rule.categoryId) { updateRecord(r.id, { categoryId: rule.categoryId }); n++; }
    }
    setMsg(`${n} unreviewed record(s) recategorized. You can still override each one.`);
  };

  return (
    <>
      <PageHeader title="Categories & rules" sub="Rules suggest categories for future imports; you can always override." actions={<Badge tone="warn">Not persisted</Badge>} />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardTitle>Merchant rules</CardTitle>
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.merchant} className="flex items-center justify-between py-2 text-sm">
                <span>{r.merchant} → <b>{categoryName(r.categoryId)}</b></span>
                <Button onClick={() => setRules(rules.filter((x) => x !== r))}>Remove</Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="Merchant"><Input value={m} onChange={(e) => setM(e.target.value)} /></Field>
            <Field label="Category"><Select value={c} onChange={(e) => setC(e.target.value)}>{categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <Button disabled={!m.trim()} onClick={() => { setRules([...rules, { merchant: m.trim(), categoryId: c }]); setM(""); }}>Add</Button>
          </div>
          <div className="mt-3"><Button variant="primary" onClick={apply}>Apply to unreviewed</Button> {msg && <span role="status" className="ml-2 text-xs text-muted">{msg}</span>}</div>
        </Card>
        <Card>
          <CardTitle>Categories</CardTitle>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {categories.map((x) => <li key={x.id} className="rounded bg-background px-2 py-1.5">{x.name}</li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">Renaming and adding categories comes with persistence in Stage 3.</p>
        </Card>
      </div>
    </>
  );
}
