"use client";
import { AlertTriangle, CalendarClock, CircleDashed, Info } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { monthLabel } from "@/domain/months";
import { buildTimeline, type ConfidenceLevel, type TimelineEvent } from "@/domain/timeline";

const TYPE_LABEL: Record<TimelineEvent["type"], string> = { spend: "Spent", income: "Income", refund: "Refund", card_bill_paid: "Card bill paid", transfer: "Transfer", card_bill: "Card bill due", recurring_out: "Recurring", recurring_in: "Expected income" };
const CONF: Record<ConfidenceLevel, { text: string; tone: "good" | "warn" | "bad" | "neutral" }> = { high: { text: "High confidence", tone: "good" }, medium: { text: "Medium confidence", tone: "warn" }, low: { text: "Low confidence", tone: "bad" }, none: { text: "No balance", tone: "neutral" } };
const prettyDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const money = (p: number) => `${p < 0 ? "−" : ""}${formatINR(Math.abs(p))}`;

/** What happened this month, what is coming, and a forecast balance. Recorded figures are solid; everything else says it is an estimate. */
export default function Timeline() {
  const { month, today, shown: records, accounts, cardBills, recurringItems, accountName, live } = useStore();
  const t = useMemo(() => buildTimeline({ month, today, records, accounts, cardBills, recurringItems, accountName }), [month, today, records, accounts, cardBills, recurringItems, accountName]);
  const isPast = month < today.slice(0, 7);
  const groups = useMemo(() => {
    const out: { date: string; items: TimelineEvent[] }[] = [];
    for (const e of t.events) { const g = out[out.length - 1]; if (g && g.date === e.date) g.items.push(e); else out.push({ date: e.date, items: [e] }); }
    return out;
  }, [t.events]);
  const c = CONF[t.confidence.level];

  return (
    <>
      <PageHeader title="Timeline" tip="Your month in order. Estimates use your transactions, verified or not, and items you added. Nothing is guessed." sub={`${monthLabel(month)} · ${live ? "your real entries" : "sample data"}`} />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Card className="col-span-2 px-3.5 py-3 sm:col-span-1 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted">Recorded balance</span>{t.recorded && <Badge tone="good">Recorded</Badge>}</div>
          {t.recorded ? (<>
            <div className="num mt-2 text-2xl font-semibold">{money(t.recorded.totalPaise)}</div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">{t.recorded.accounts.map((a) => <li key={a.id}>{a.name}: {money(a.amountPaise)} as of {prettyDate(a.asOf)}</li>)}</ul>
          </>) : (<>
            <div className="mt-2 text-sm text-muted">None yet.</div>
            <Link href="/settings?s=methods" className="mt-1 inline-block text-xs font-medium text-accent underline">Add a balance in Payment methods</Link>
          </>)}
        </Card>
        <Card className="border border-dashed border-border bg-background px-3.5 py-3 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted">Estimated today</span><Badge>Estimate</Badge></div>
          <div className="num mt-1.5 text-xl font-semibold text-muted sm:mt-2 sm:text-2xl">{t.estimatedTodayPaise === null ? "—" : `≈ ${money(t.estimatedTodayPaise)}`}</div>
          <p className="mt-1 hidden text-xs text-muted sm:block">Recorded balance plus confirmed transactions since its date. Not a confirmed balance.</p>
        </Card>
        <Card className="border border-dashed border-border bg-background px-3.5 py-3 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted">Forecast, end of {monthLabel(month).split(" ")[0]}</span><Badge>Forecast</Badge></div>
          <div className={`num mt-1.5 text-xl font-semibold sm:mt-2 sm:text-2xl ${t.forecastEndPaise !== null && t.forecastEndPaise < 0 ? "text-danger" : "text-muted"}`}>{t.forecastEndPaise === null ? "—" : `≈ ${money(t.forecastEndPaise)}`}</div>
          <p className="mt-1 hidden text-xs text-muted sm:block">{isPast ? "A past month has no forecast." : "After the bills, recurring payments and income you have entered."}</p>
        </Card>
      </div>

      <Card className="mb-4 space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2"><Info size={15} aria-hidden className="text-muted" /><span className="text-sm font-medium">How sure is this forecast?</span><Badge tone={c.tone}>{c.text}</Badge></div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{t.confidence.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </Card>

      {t.warnings.filter((w) => w.kind !== "no_balance").length > 0 && (
        <Card className="mb-4 space-y-1.5 border border-warn/30 bg-warn-soft/50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-warn"><AlertTriangle size={15} aria-hidden />Heads up</h2>
          <ul className="space-y-1 text-sm">{t.warnings.filter((w) => w.kind !== "no_balance").map((w) => <li key={w.text}>{w.text}{w.date ? ` (${prettyDate(w.date)})` : ""}</li>)}</ul>
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Chip label="In so far" value={money(t.totals.actualIn)} /><Chip label="Out so far" value={money(-t.totals.actualOut)} />
        <Chip label="Still expected in" value={money(t.totals.expectedIn)} dashed /><Chip label="Still expected out" value={money(-t.totals.expectedOut)} dashed />
      </div>

      {groups.length === 0 ? <Card><EmptyState art="history" title="Nothing on the timeline" hint="Verify transactions or add a bill to fill this in." /></Card> : (
        <Card className="p-0">
          <CardTitle>{" "}</CardTitle>
          <ol className="relative divide-y divide-border">
            {groups.map((g) => (
              <li key={g.date} className="px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><CalendarClock size={13} aria-hidden />{prettyDate(g.date)}{g.date === today && <Badge tone="good">Today</Badge>}</div>
                <ul className="space-y-2">
                  {g.items.map((e) => {
                    const row = (
                      <div className="flex items-start gap-3">
                        <span aria-hidden className={`mt-1.5 size-3 shrink-0 rounded-full ${e.kind === "actual" ? "bg-accent" : "border-2 border-dashed border-accent bg-surface"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium">{e.label}</span>{e.unverified && <CircleDashed size={14} role="img" aria-label="Unverified" className="shrink-0 text-warn" />}{e.kind === "expected" && <Badge>Expected</Badge>}{e.estimated && <Badge tone="warn">Estimate</Badge>}{e.overdue && <Badge tone="bad">Overdue</Badge>}</div>
                          <div className="text-xs text-muted">{TYPE_LABEL[e.type]}</div>
                        </div>
                        <div className="num text-right">
                          <div className={`text-sm font-semibold ${e.kind === "expected" ? "italic" : ""} ${e.amountPaise > 0 ? "text-good" : ""}`}>{e.type === "transfer" ? "—" : `${e.estimated ? "≈ " : ""}${money(e.amountPaise)}`}</div>
                          {e.balanceAfterPaise !== undefined && <div className={`text-xs italic ${e.balanceAfterPaise < 0 ? "text-danger" : "text-muted"}`}>forecast ≈ {money(e.balanceAfterPaise)}</div>}
                        </div>
                      </div>
                    );
                    return <li key={e.id}>{e.href ? <Link href={e.href} className="block rounded-lg hover:bg-background">{row}</Link> : row}</li>;
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted">Solid dots are confirmed. Hollow dots are expected, from card bills and recurring items.</p>
    </>
  );
}

function Chip({ label, value, dashed }: { label: string; value: string; dashed?: boolean }) {
  return <div className={`rounded-xl bg-surface px-3 py-2 ${dashed ? "border border-dashed border-border" : ""}`}><div className="text-muted">{label}</div><div className="num text-sm font-semibold">{value}</div></div>;
}
