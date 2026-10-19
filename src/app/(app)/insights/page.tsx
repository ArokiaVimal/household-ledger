"use client";
import { AlertTriangle, ClipboardCheck, FileUp, Lightbulb, RefreshCw, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AiBadge, Button, Card } from "@/components/ui";
import { IconsCard } from "../settings/icons-card";
import { NotesAi } from "../transactions/notes-ai";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import type { Analysis } from "@/lib/insights/ai";

interface Saved { analysis: Analysis; generatedAt: string }
const key = (m: string) => `insights:${m}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

function AiTool({ icon: I, title, where, blurb, children }: { icon: LucideIcon; title: string; where: string; blurb: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><I size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">{title} <AiBadge /></div>
          <p className="text-sm text-muted">{blurb}</p>
          <p className="mt-0.5 text-xs text-muted">{where}</p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

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
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">AI <AiBadge>AI-powered</AiBadge></h1>
          <p className="text-sm text-muted">Tips for your month and every AI tool in one place. Nothing runs until you press a button.</p>
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

      <section id="tools" aria-labelledby="tools-h" className="mt-8 space-y-3">
        <div>
          <h2 id="tools-h" className="text-lg font-semibold tracking-tight">All AI tools</h2>
          <p className="text-sm text-muted">Every AI feature in the app, in one place. Each one runs only when you press its button, shows you what it found, and nothing counts until you approve it. Some also live where you use them.</p>
        </div>
        <ul className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-2">
          <li><AiTool icon={Sparkles} title="Read notes with AI" where="Also on Transactions" blurb="Reads the notes you wrote on payments and suggests the category each one really belongs to. You pick which suggestions to apply."><NotesAi /></AiTool></li>
          <li><IconsCard live={live} aiEnabled={aiEnabled} /></li>
          <li><AiTool icon={FileUp} title="Read statements and describe payments" where="Also on Import" blurb="Reads a bank, card or UPI statement the app has not seen before, or turns a sentence like “paid 450 at Swiggy” into a transaction. It senses the payment method, EMIs and recurring payments, and the card bill due amount and date."><Link href="/import" className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-background">Go to Import</Link></AiTool></li>
          <li><AiTool icon={ClipboardCheck} title="Name and sort merchants" where="Also in Review" blurb="Names merchants and suggests categories for imported rows, marked with an AI badge until you approve them. It remembers what you approve, so each month needs less review."><Link href="/review" className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-background">Go to Review</Link></AiTool></li>
        </ul>
        {off && <p className="px-1 text-xs text-muted">{off}</p>}
        <p className="px-1 text-xs text-muted">Privacy: only text you choose to send leaves the app, after a click. Account numbers, emails and phone numbers are hidden first; your name and the original files are never sent. <Link href="/settings#ai" className="text-accent underline">AI settings</Link></p>
      </section>
    </>
  );
}
