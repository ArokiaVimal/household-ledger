"use client";
import { useState } from "react";
import { Badge, Button, Card, CardTitle, Field, PageHeader, Select } from "@/components/ui";
import Link from "next/link";
import { mockImportRows } from "@/data/mock";
import { LiveImport } from "./live-import";
import { useStore } from "@/data/store";
import { planImport } from "@/domain/dedupe";
import { suggestCategory } from "@/domain/rules";
import type { ExpenseRecord } from "@/domain/types";
import { formatINR } from "@/domain/money";

const history = [
  { file: "HDFC_Aug2026.csv", date: "2026-09-01", status: "Saved", n: 31 },
  { file: "SBI_Aug2026.pdf", date: "2026-09-01", status: "Failed — password protected", n: 0 },
];

export default function ImportCentre() {
  const { live, meId, accounts, accountName, records, staged, stageRecords, rules } = useStore();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState<{ sent: number; skipped: number } | null>(null);
  const plan = planImport(mockImportRows, [...records, ...staged]);
  const rows = plan.map((p) => ({ ...p.row, dup: p.dup }));
  const toStage = rows.filter((r) => r.dup.status !== "exact");
  const fresh = rows.filter((r) => r.dup.status === "none").length;

  const sendToReview = () => {
    const file = "HDFC_Sep2026_sample.csv (simulated)";
    stageRecords(toStage.map((r): ExpenseRecord => ({
      id: "", date: r.date, merchant: r.merchant, originalDescription: r.description, amountPaise: r.amountPaise, currency: "INR", accountId: r.accountId,
      categoryId: suggestCategory(rules, r.merchant), kind: "purchase", payerId: meId, shared: false, split: { mode: "personal", participantIds: [meId] },
      excluded: false, status: "unreviewed", importSource: file, referenceId: r.referenceId, duplicateOf: r.dup.status === "possible" ? r.dup.matchId : undefined,
    })));
    setDone({ sent: toStage.length, skipped: rows.length - toStage.length });
  };

  if (live) return <LiveImport />;

  return (
    <>
      <PageHeader title="Import" sub="Guided flow. Nothing is added to your ledger until you approve it in the review queue. Prototype: no file is read, rows are simulated." actions={<Badge tone="warn">Simulated</Badge>} />
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs">
        {["Month & file", "Source", "Preview & duplicates", "To review queue"].map((s, i) => (
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
              <p className="text-xs text-muted">We never ask for bank passwords, UPI PINs or full card numbers. Upload password-protected PDFs unlocked.</p>
              <Button variant="primary" onClick={() => setStep(2)}>Use sample file</Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Field label="Source account"><Select defaultValue="cc_hdfc">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
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
                <div className="space-y-2 text-sm">
                  <p><b>{done.sent} row{done.sent === 1 ? "" : "s"} sent to the review queue</b>; {done.skipped} exact duplicate{done.skipped === 1 ? "" : "s"} skipped. Nothing is in your ledger or reports until you approve it.</p>
                  <Link href="/review" className="inline-block rounded-full bg-accent px-4 py-2 font-medium text-white">Review now</Link>
                </div>
              ) : (
                <>
                  <p className="text-sm">{fresh} new and {toStage.length - fresh} possible-duplicate rows go to the review queue, where you check category, split and payer and approve each one. Exact duplicates are skipped.</p>
                  <Button variant="primary" onClick={sendToReview} disabled={toStage.length === 0}>Send {toStage.length} to review queue</Button>
                </>
              )}
              <Button onClick={() => { setStep(1); setDone(null); }}>Start over</Button>
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
