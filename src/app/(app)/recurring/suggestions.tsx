"use client";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { MerchantAvatar } from "@/components/txn-row";
import { Badge, Button, Card } from "@/components/ui";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { monthLabel } from "@/domain/months";
import type { Flag, Suggestion } from "@/domain/recurring-detect";

const CADENCE = { monthly: "every month", bimonthly: "every 2 months", yearly: "every year" } as const;
const FLAG: Record<Flag, { text: string; tone: "bad" | "warn" }> = { price_up: { text: "Price went up", tone: "warn" }, missing: { text: "Payment missing", tone: "bad" }, duplicate: { text: "Possible duplicate charge", tone: "bad" } };
const prettyDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Likely subscriptions and bills found in your approved history, by rules. Suggestions only: yes adds it to Recurring, no hides it. */
export function Suggestions() {
  const { recurringSuggestions, confirmRecurringSuggestion, dismissRecurringSuggestion } = useStore();
  const [error, setError] = useState<string | null>(null);
  if (recurringSuggestions.length === 0) return null;
  const yearly = recurringSuggestions.reduce((s, x) => s + x.annualPaise, 0);
  const confirm = (s: Suggestion) => setError(confirmRecurringSuggestion(s));
  return (
    <section id="suggestions" aria-labelledby="sugg-h" className="mb-4 space-y-2">
      <div className="flex items-center gap-2 px-1"><Lightbulb size={16} aria-hidden className="text-accent" /><h2 id="sugg-h" className="text-sm font-medium">Found in your history</h2><Badge>{recurringSuggestions.length}</Badge></div>
      <p className="px-1 text-xs text-muted">These look like regular bills. Nothing is added until you say yes. Together they cost about {formatINR(yearly)} a year.</p>
      <ul className="space-y-2">
        {recurringSuggestions.map((s) => (
          <li key={s.key}>
            <Card className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <MerchantAvatar name={s.merchant} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.merchant}</div>
                  <div className="text-xs text-muted">{s.fixed ? formatINR(s.amountPaise) : `About ${formatINR(s.amountPaise)}`} {CADENCE[s.cadence]} · {formatINR(s.annualPaise)} a year</div>
                  <div className="text-xs text-muted">Last paid {prettyDate(s.lastDate)} ({formatINR(s.lastAmountPaise)}) · next expected {prettyDate(s.nextExpected)}</div>
                </div>
                <Badge>{s.confidence} confidence</Badge>
              </div>
              {s.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.flags.map((f) => <Badge key={f} tone={FLAG[f].tone === "bad" ? "bad" : "warn"}>{FLAG[f].text}{f === "price_up" && s.priceChange ? `: ${formatINR(s.priceChange.fromPaise)} to ${formatINR(s.priceChange.toPaise)}` : f === "missing" ? ` since ${monthLabel(s.nextExpected.slice(0, 7))}` : ""}</Badge>)}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => dismissRecurringSuggestion(s.key)}>Not recurring</Button>
                <Button variant="primary" onClick={() => confirm(s)}>Add to Recurring</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
