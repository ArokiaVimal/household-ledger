"use client";
import { Gauge } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorDialog } from "@/components/feedback";
import { Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { estimateInr, featureRows, totalTokens, type MonthUsage, type Rates } from "@/domain/ai-usage";

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n));
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

/**
 * How much AI this profile has used: the exact token counts Claude reports for every answer (input, output, cache writes and cache
 * reads, the same total as the Anthropic dashboard's Token volume), by month and by feature. The cost is an estimate from the
 * prices you enter, because prices change; the Anthropic dashboard has the exact bill.
 */
export function AiUsageCard({ live }: { live: boolean }) {
  const [months, setMonths] = useState<MonthUsage[] | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ inputUsdPerMTok: "", outputUsdPerMTok: "", inrPerUsd: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-usage", { method: "POST", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { months?: MonthUsage[]; rates?: Rates | null; error?: string };
      if (!res.ok) return setError(data.error ?? "Could not load your AI usage.");
      setMonths(data.months ?? []); setRates(data.rates ?? null);
    } catch { setError("Network problem. Try again."); }
  }, []);
  useEffect(() => { if (live) void Promise.resolve().then(load); }, [live, load]);

  const saveRates = async (clear = false) => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-usage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rates: clear ? null : draft }) });
      const data = (await res.json().catch(() => ({}))) as { rates?: Rates | null; error?: string };
      if (!res.ok) setError(data.error ?? "Could not save that.");
      else { setRates(data.rates ?? null); setEditing(false); }
    } catch { setError("Network problem. Try again."); }
    setSaving(false);
  };

  if (!live) return <Card><CardTitle>AI usage</CardTitle><p className="text-sm text-muted">This needs a signed-in account. The demo has no AI.</p></Card>;
  const now = months?.find((m) => m.month === thisMonth());
  const cost = now ? estimateInr(now, rates) : null;
  const rows = now ? featureRows(now) : [];
  return (
    <Card className="space-y-4">
      <CardTitle><span className="inline-flex items-center gap-2"><Gauge size={16} aria-hidden className="text-accent" />AI usage</span></CardTitle>
      {months === null ? <p className="text-sm text-muted">Loading…</p> : (
        <>
          <div>
            <div className="text-xs text-muted">{monthName(thisMonth())}</div>
            <div className="num text-3xl font-semibold tracking-tight">{tokens(now ? totalTokens(now) : 0)} <span className="text-base font-normal text-muted">tokens</span></div>
            <p className="text-sm text-muted">{now?.calls ?? 0} AI request{now?.calls === 1 ? "" : "s"}{now ? ` · ${tokens(now.inputTokens + now.cacheWriteTokens + now.cacheReadTokens)} in, ${tokens(now.outputTokens)} out` : ""}{cost !== null ? ` · about ${rupees(cost)}` : ""}</p>
            {cost === null && <p className="mt-1 text-xs text-muted">Add the model&apos;s prices below to see an estimated cost.</p>}
          </div>

          {rows.length > 0 && (
            <ul className="space-y-2" aria-label="Usage by feature">
              {rows.map((r) => (
                <li key={r.feature} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate">{r.label}</span><span className="num shrink-0 text-muted">{tokens(totalTokens(r.bucket))}{estimateInr(r.bucket, rates) !== null ? ` · ${rupees(estimateInr(r.bucket, rates)!)}` : ""}</span></div>
                  <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, Math.round(r.share * 100))}%` }} /></div>
                </li>
              ))}
            </ul>
          )}

          {months.filter((m) => m.month !== thisMonth()).length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-foreground">Earlier months</summary>
              <ul className="mt-2 divide-y divide-border">
                {months.filter((m) => m.month !== thisMonth()).map((m) => (
                  <li key={m.month} className="flex items-center justify-between gap-2 py-2"><span>{monthName(m.month)}</span><span className="num text-muted">{tokens(totalTokens(m))}{estimateInr(m, rates) !== null ? ` · ${rupees(estimateInr(m, rates)!)}` : ""}</span></li>
                ))}
              </ul>
            </details>
          )}

          {!editing ? (
            <Button onClick={() => { setDraft({ inputUsdPerMTok: rates ? String(rates.inputUsdPerMTok) : "", outputUsdPerMTok: rates ? String(rates.outputUsdPerMTok) : "", inrPerUsd: rates ? String(rates.inrPerUsd) : "" }); setEditing(true); }}>{rates ? "Change prices" : "Add prices for a cost estimate"}</Button>
          ) : (
            <div className="space-y-3 rounded-xl bg-background p-3">
              <p className="text-xs text-muted">Copy the prices for your model from Anthropic&apos;s pricing page. Cache reads and writes are priced from the input price automatically.</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Input $/M"><Input inputMode="decimal" value={draft.inputUsdPerMTok} onChange={(e) => setDraft({ ...draft, inputUsdPerMTok: e.target.value })} placeholder="1.00" /></Field>
                <Field label="Output $/M"><Input inputMode="decimal" value={draft.outputUsdPerMTok} onChange={(e) => setDraft({ ...draft, outputUsdPerMTok: e.target.value })} placeholder="5.00" /></Field>
                <Field label="₹ per $"><Input inputMode="decimal" value={draft.inrPerUsd} onChange={(e) => setDraft({ ...draft, inrPerUsd: e.target.value })} placeholder="85" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={saving} onClick={() => void saveRates()}>{saving ? "Saving…" : "Save prices"}</Button>
                <Button onClick={() => setEditing(false)}>Cancel</Button>
                {rates && <Button variant="ghost" disabled={saving} onClick={() => void saveRates(true)}>Remove prices</Button>}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">Counted from what Claude reports for each answer, the same way as the token volume on the Anthropic dashboard. That dashboard has the exact bill for the whole account.</p>
        </>
      )}
      <ErrorDialog message={error} onClose={() => setError(null)} />
    </Card>
  );
}
