"use client";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { MerchantAvatar } from "@/components/txn-row";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { recurringItems } from "@/data/mock";
import { useStore } from "@/data/store";
import { commitmentTotals } from "@/domain/recurring";
import { formatINR } from "@/domain/money";
import type { RecurringState } from "@/domain/recurring";

const tone: Record<RecurringState, "good" | "warn" | "bad"> = { paid: "good", upcoming: "warn", overdue: "bad" };
const text: Record<RecurringState, string> = { paid: "Paid", upcoming: "Upcoming", overdue: "Overdue" };

export default function Recurring() {
  const { recurring, scoped, month, nameOf, categoryName, accountName } = useStore();
  const totals = commitmentTotals(recurringItems);
  const paid = recurring.filter((r) => r.state === "paid").reduce((s, r) => s + r.actualPaise, 0);
  const left = recurring.filter((r) => r.state !== "paid").reduce((s, r) => s + r.item.expectedPaise, 0);
  const groups = [...new Set(recurring.map((r) => r.item.place ?? "Personal"))];

  return (
    <>
      <PageHeader title="Recurring" sub={`Monthly commitments · ${month}`} actions={<Link href={`/transactions?month=${month}&recurring=1`} className="rounded-full border border-border bg-surface px-3 py-2 text-sm">View payments</Link>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card><div className="text-xs text-muted">Expected each month</div><div className="num text-xl font-semibold">{formatINR(totals.monthlyPaise)}</div><div className="text-xs text-muted">≈ {formatINR(totals.yearlyPaise)} a year</div></Card>
        <Card><div className="text-xs text-muted">Paid this month</div><div className="num text-xl font-semibold text-good">{formatINR(paid)}</div></Card>
        <Card><div className="text-xs text-muted">Still to pay</div><div className="num text-xl font-semibold">{formatINR(left)}</div><div className="text-xs text-muted">based on expected amounts</div></Card>
      </div>
      {scoped.length === 0 ? <EmptyState title="No data for this month" hint="Statuses need imported transactions for the month." /> : (
        <div className="space-y-4">
          {groups.map((place) => (
            <section key={place} aria-label={place}>
              <h2 className="mb-2 px-1 text-sm font-medium text-muted">{place}</h2>
              <ul className="space-y-2">
                {recurring.filter((r) => (r.item.place ?? "Personal") === place).sort((a, b) => a.item.dueDay - b.item.dueDay).map((r) => {
                  const rec = r.records[0];
                  return (
                    <li key={r.item.id}>
                      <Link href={`/transactions?month=${month}&recurring=${r.item.id}`} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-surface p-4 hover:shadow-md">
                        <MerchantAvatar name={r.item.name} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{r.item.name}</div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden />Due on {r.item.dueDay}</span>
                            <span>{categoryName(r.item.categoryId)}</span>
                            <span>{r.item.split.mode === "personal" ? `Mine` : `Split with ${r.item.split.participantIds.filter((i) => i !== "me").map(nameOf).join(", ")}`}</span>
                            {rec && <span>{accountName(rec.accountId)}{rec.fundedBy ? ` via ${accountName(rec.fundedBy)}` : ""}</span>}
                          </div>
                        </div>
                        <div className="num text-right">
                          <div className="font-semibold">{formatINR(r.state === "paid" ? r.actualPaise : r.item.expectedPaise)}</div>
                          <div className="text-xs text-muted">{r.state === "paid" ? (r.variancePaise === 0 ? "as expected" : `${r.variancePaise > 0 ? "+" : "−"}${formatINR(Math.abs(r.variancePaise))} vs expected`) : "expected"}</div>
                        </div>
                        <Badge tone={tone[r.state]}>{text[r.state]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Amounts are fictional. Link a payment to an item from the transaction edit dialog; auto-detection of recurring patterns is not built yet. “Today” is fixed at 24 Sep 2026 in the prototype.</p>
    </>
  );
}
