"use client";
import { useState } from "react";
import { Badge, Button, Card, CardTitle, Field, PageHeader, Select } from "@/components/ui";
import { mockImportRows, accounts, initialRecords } from "@/data/mock";
import { useStore } from "@/data/store";
import { detectDuplicate } from "@/domain/dedupe";
import { formatINR } from "@/domain/money";

const history = [
  { file: "HDFC_Aug2026.csv", date: "2026-09-01", status: "Saved", n: 31 },
  { file: "SBI_Aug2026.pdf", date: "2026-09-01", status: "Failed — password protected", n: 0 },
];

export default function ImportCentre() {
  const { accountName } = useStore();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const rows = mockImportRows.map((r) => ({ ...r, dup: detectDuplicate(r, initialRecords) }));
  const fresh = rows.filter((r) => r.dup.status === "none").length;

  return (
    <>
      <PageHeader title="Import centre" sub="Guided flow. In this prototype no file is read: the preview uses simulated rows." actions={<Badge tone="warn">Simulated</Badge>} />
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs">
        {["Month & file", "Source", "Preview & duplicates", "Confirm"].map((s, i) => (
          <li key={s} className={`rounded px-2 py-1 ${step === i + 1 ? "bg-accent text-white" : "bg-surface text-muted border border-border"}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          {step === 1 && (
            <div className="space-y-3">
              <Field label="Statement month"><Select defaultValue="2026-09"><option value="2026-09">September 2026</option></Select></Field>
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
                File upload arrives in Stage 4 (CSV/XLSX first, then PDF). Do not upload real statements to this prototype.
              </div>
              <p className="text-xs text-muted">We never ask for bank passwords, UPI PINs or full card numbers. For a password-protected PDF, upload an unlocked copy.</p>
              <Button variant="primary" onClick={() => setStep(2)}>Use sample file</Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Field label="Source account"><Select defaultValue="cc1">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
              <Field label="Statement type"><Select><option>Credit-card statement</option><option>Bank statement</option><option>UPI export</option></Select></Field>
              <div className="flex gap-2"><Button onClick={() => setStep(1)}>Back</Button><Button variant="primary" onClick={() => setStep(3)}>Parse sample</Button></div>
            </div>
          )}
          {step === 3 && (
            <div>
              <CardTitle>Preview — {rows.length} rows from sample file</CardTitle>
              <ul className="divide-y divide-border">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div><div className="font-medium">{r.merchant}</div><div className="text-xs text-muted">{r.date} · {r.description} · {accountName(r.accountId)}</div></div>
                    <div className="flex items-center gap-2">
                      {r.dup.status === "exact" && <Badge tone="bad">Already imported — skipped</Badge>}
                      {r.dup.status === "possible" && <Badge tone="warn">Possible duplicate — review</Badge>}
                      {r.dup.status === "none" && <Badge tone="good">New</Badge>}
                      <span className="num">{formatINR(r.amountPaise)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2"><Button onClick={() => setStep(2)}>Back</Button><Button variant="primary" onClick={() => setStep(4)}>Continue</Button></div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              {done ? (
                <p className="text-sm"><b>Simulated:</b> {fresh} new records would be saved, {rows.length - fresh} skipped or held for review. Nothing was written.</p>
              ) : (
                <>
                  <p className="text-sm">{fresh} new rows will be saved for review. Exact duplicates are skipped; possible duplicates stay unmerged until you decide.</p>
                  <Button variant="primary" onClick={() => setDone(true)}>Confirm (simulated)</Button>
                </>
              )}
              <Button onClick={() => { setStep(1); setDone(false); }}>Start over</Button>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>Import history (mock)</CardTitle>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.file}><div className="font-medium">{h.file}</div><div className="text-xs text-muted">{h.date} · {h.n} records · {h.status}</div></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Re-uploading a file with the same hash is detected and blocked (domain logic implemented, UI wiring pending).</p>
        </Card>
      </div>
    </>
  );
}
