"use client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardTitle, CompactChips, ConfirmDialog, Dialog, Field, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { categoryUsage, checkDelete, MAX_CATEGORY_NAME } from "@/domain/categories";
import { PROTECTED_CATEGORY_IDS } from "@/domain/categories";

export default function Categories() {
  const { live, recurringItems, categories, rules, records, staged, updateStaged, categoryName, addCategory, renameCategory, deleteCategory, addRule, removeRule } = useStore();
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removingRule, setRemovingRule] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [delError, setDelError] = useState<string | null>(null);
  const [m, setM] = useState("");
  const [c, setC] = useState("groceries");
  const [msg, setMsg] = useState("");

  const usage = (id: string) => categoryUsage(records, id) + categoryUsage(staged, id);
  const recurringUsing = (id: string) => recurringItems.filter((i) => i.categoryId === id).map((i) => i.name);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const err = addCategory(name).error ?? null;
    setAddError(err);
    if (!err) setName("");
  };

  const saveEdit = () => {
    if (!editing) return;
    const err = renameCategory(editing.id, editing.value);
    setEditError(err);
    if (!err) setEditing(null);
  };

  const target = deleting ? categories.find((x) => x.id === deleting) : null;
  const check = deleting ? checkDelete(deleting, { records: usage(deleting), recurringItems: recurringUsing(deleting) }) : null;
  const confirmDelete = () => {
    if (!deleting) return;
    const err = deleteCategory(deleting, moveTo || undefined);
    setDelError(err);
    if (!err) { setDeleting(null); setMoveTo(""); }
  };

  const apply = () => {
    let n = 0;
    for (const r of staged) {
      const rule = rules.find((x) => x.merchant.toLowerCase() === r.merchant.toLowerCase());
      if (rule && r.categoryId !== rule.categoryId) { updateStaged(r.id, { categoryId: rule.categoryId }); n++; }
    }
    setMsg(`${n} row${n === 1 ? "" : "s"} in the review queue recategorized. Nothing is approved; you still confirm each one.`);
  };

  return (
    <>
      <PageHeader title="Categories & rules" sub="Your categories. Add your own, rename any, delete ones you don't use." actions={live ? undefined : <Badge tone="warn">Prototype</Badge>} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Categories</CardTitle>
          <form onSubmit={add} className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="New category name" placeholder="New category, e.g. Pet care" maxLength={MAX_CATEGORY_NAME + 5} value={name} onChange={(e) => { setName(e.target.value); setAddError(null); }} />
              <Button type="submit" variant="primary" disabled={!name.trim()} className="sm:shrink-0">Add category</Button>
            </div>
            {addError && <p role="alert" className="text-xs text-danger">{addError}</p>}
          </form>
          <ul className="divide-y divide-border">
            {categories.map((x) => (
              <li key={x.id} className="flex min-h-12 items-center gap-2 py-1.5 text-sm">
                {editing?.id === x.id ? (
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex flex-wrap gap-2">
                      <Input className="min-w-0 flex-1 basis-40" aria-label={`Rename ${x.name}`} autoFocus value={editing.value} onChange={(e) => { setEditing({ id: x.id, value: e.target.value }); setEditError(null); }} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} />
                      <Button variant="primary" onClick={saveEdit}>Save</Button>
                      <Button onClick={() => { setEditing(null); setEditError(null); }}>Cancel</Button>
                    </div>
                    {editError && <p role="alert" className="text-xs text-danger">{editError}</p>}
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{x.name}{PROTECTED_CATEGORY_IDS.includes(x.id) && <span className="ml-1.5 text-xs font-normal text-muted">fallback</span>}</span>
                    <span className="num shrink-0 text-xs text-muted">{usage(x.id)}<span className="hidden sm:inline"> used</span></span>
                    <button aria-label={`Rename ${x.name}`} title="Rename" onClick={() => { setEditing({ id: x.id, value: x.name }); setEditError(null); }} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-background sm:size-8"><Pencil size={14} aria-hidden /></button>
                    {!PROTECTED_CATEGORY_IDS.includes(x.id) && <button aria-label={`Delete ${x.name}`} title="Delete" onClick={() => { setDeleting(x.id); setMoveTo(""); setDelError(null); }} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger sm:size-8"><Trash2 size={14} aria-hidden /></button>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3">
          <CardTitle>Merchant rules</CardTitle>
          <p className="text-xs text-muted">A rule pre-fills the category for a merchant in the review queue. You still approve each row.</p>
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.merchant} className="flex min-h-12 items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">{r.merchant} → <b>{categoryName(r.categoryId)}</b></span>
                <Button variant="danger" className="shrink-0" onClick={() => setRemovingRule(r.merchant)}>Remove</Button>
              </li>
            ))}
            {rules.length === 0 && <li className="py-2 text-sm text-muted">No rules yet.</li>}
          </ul>
          <div className="space-y-2 rounded-xl bg-background p-3">
            <Field label="Merchant"><Input value={m} onChange={(e) => setM(e.target.value)} placeholder="e.g. Swiggy" /></Field>
            <CompactChips label="Rule category" options={categories.map((x) => ({ id: x.id, label: x.name }))} selected={[c]} onPick={setC} />
            <Button className="w-full sm:w-auto" disabled={!m.trim()} onClick={() => { addRule({ merchant: m.trim(), categoryId: c }); setM(""); }}>Add rule</Button>
          </div>
          <div className="space-y-2"><Button variant="primary" className="w-full sm:w-auto" onClick={apply}>Apply to review queue</Button>{msg && <p role="status" className="text-xs text-muted">{msg}</p>}</div>
        </Card>
      </div>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete “${target?.name ?? ""}”?`}>
        {deleting && check && (
          <div className="space-y-3 pb-1 text-sm">
            {!check.ok ? (
              <p role="alert" className="text-danger">{check.reason}</p>
            ) : check.needsMove ? (
              <>
                <p>{usage(deleting)} transaction{usage(deleting) === 1 ? "" : "s"} use this category. Choose where they should go. Merchant rules move with them.</p>
                <CompactChips label="Move to" options={categories.filter((x) => x.id !== deleting).map((x) => ({ id: x.id, label: x.name }))} selected={moveTo ? [moveTo] : []} onPick={setMoveTo} />
              </>
            ) : (
              <p>No transactions use this category. It will be removed, along with any rules pointing to it.</p>
            )}
            {delError && <p role="alert" className="text-danger">{delError}</p>}
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              {check.ok && <Button variant="danger" onClick={confirmDelete} disabled={check.needsMove && !moveTo}>Delete{check.needsMove ? " and move" : ""}</Button>}
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!removingRule} onClose={() => setRemovingRule(null)} title="Remove this rule?" confirmLabel="Remove" onConfirm={() => removingRule && removeRule(removingRule)}>
        <p>Future imports will no longer pre-fill the category for <strong>{removingRule}</strong>. Transactions you already have are not changed.</p>
      </ConfirmDialog>
    </>
  );
}
