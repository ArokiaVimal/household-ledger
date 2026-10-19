"use client";
import { AlertTriangle, Lightbulb, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { AiBadge, Button, Card } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { Analysis } from "@/lib/insights/ai";

interface Saved { analysis: Analysis; generatedAt: string }
const key = (m: string) => `insights:${m}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

/** AI analysis of the selected month. It only runs when you press Analyse or Refresh; the last result is kept on this device. */
export default function Insights() {
  const { live, aiEnabled, month, records } = useStore();
  // The last analysis of each month is kept on this device and read after the page appears (it is not available on the server).
  const [byMonth, setByMonth] = useState<Record<string, Saved | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = records.filter((r) => r.date.startsWith(month) && r.status === "reviewed").length;

  const saved = byMonth[month] ?? null;
  useEffect(() => {
    void Promise.resolve().then(() => {
      let found: Saved | null = null;
      try { const raw = localStorage.getItem(key(month)); found = raw ? (JSON.parse(raw) as Saved) : null; } catch { /* storage unavailable */ }
      setByMonth((m) => (month in m ? m : { ...m, [month]: found }));
    });
  }, [month]);

  const analyse = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/insights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; analysis?: Analysis; generatedAt?: string };
      if (!res.ok || !data.analysis) { setError(data.error ?? "Something went wrong."); return; }
      const next = { analysis: data.analysis, generatedAt: data.generatedAt ?? new Date().toISOString() };
      setByMonth((m) => ({ ...m, [month]: next }));
      try { localStorage.setItem(key(month), JSON.stringify(next)); } catch { /* storage unavailable: still shown */ }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const off = !live ? "AI analysis reads your real entries, so it works once you are signed in." : !aiEnabled ? "AI is off on this server. Add an Anthropic API key to switch it on." : null;
  const a = saved?.analysis;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">AI insights <AiBadge>AI-powered</AiBadge></h1>
          <p className="text-sm text-muted">Tips and a plain-English look at your month. It only runs when you ask.</p>
        </div>
      </div>

      <Card className="mb-4 space-y-3 bg-gradient-to-br from-accent/10 via-surface to-surface p-5 ring-1 ring-accent/20">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white"><Sparkles size={20} /></span>
          <div className="min-w-0">
            <h2 className="font-semibold">{monthName(month)}</h2>
            <p className="text-sm text-muted">{count > 0 ? `${count} approved transaction${count === 1 ? "" : "s"} this month.` : "No approved transactions this month yet."}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="min-h-11 px-5" disabled={busy || !!off || count === 0} onClick={() => void analyse()}>
            {busy ? <><RefreshCw size={16} className="animate-spin" aria-hidden />Analysing…</> : a ? <><RefreshCw size={16} aria-hidden />Refresh analysis</> : <><Sparkles size={16} aria-hidden />Analyse {monthName(month).split(" ")[0]}</>}
          </Button>
          {saved && <span className="text-xs text-muted">Last analysed {new Date(saved.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
        </div>
        <p className="text-xs text-muted">{off ?? "Pressing the button sends this month's totals, category and merchant names, card-bill dates and the short notes you wrote on payments (long numbers hidden) to Claude. Never bank text or account numbers."}</p>
      </Card>

      {error && <p role="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {a && (
        <div className="space-y-4">
          <Card className="space-y-2 p-5">
            <h2 className="text-sm font-medium text-muted">How the month went</h2>
            <p className="text-base leading-relaxed">{a.summary}</p>
          </Card>

          {a.watch.length > 0 && (
            <Card className="space-y-2 border border-warn/30 bg-warn-soft/50 p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium text-warn"><AlertTriangle size={15} aria-hidden />Keep an eye on</h2>
              <ul className="space-y-1.5 text-sm">{a.watch.map((w) => <li key={w}>{w}</li>)}</ul>
            </Card>
          )}

          {a.highlights.length > 0 && (
            <section aria-label="Highlights" className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted"><TrendingUp size={15} aria-hidden />What stands out</h2>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
                {a.highlights.map((h) => <li key={h.title}><Card className="h-full space-y-1 p-4"><h3 className="font-medium">{h.title}</h3><p className="text-sm text-muted">{h.detail}</p></Card></li>)}
              </ul>
            </section>
          )}

          {a.tips.length > 0 && (
            <section aria-label="Tips" className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted"><Lightbulb size={15} aria-hidden />Tips for you</h2>
              <ol className="space-y-3">
                {a.tips.map((t, i) => (
                  <li key={t.title}>
                    <Card className="flex gap-3 p-4">
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">{i + 1}</span>
                      <div className="min-w-0 space-y-1"><h3 className="font-medium">{t.title}</h3><p className="text-sm text-muted">{t.detail}</p>{t.saveRupees && <p className="text-xs font-medium text-good">Could save about {formatINR(t.saveRupees * 100)} a month</p>}</div>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <p className="px-1 text-xs text-muted">Written by AI from your own figures. It is a nudge, not financial advice, so check anything important.</p>
        </div>
      )}

      {!a && !error && !busy && !off && count > 0 && (
        <Card className="p-6 text-center"><p className="text-sm text-muted">Press <b>Analyse</b> to get your tips for {monthName(month)}.</p></Card>
      )}
    </>
  );
}
