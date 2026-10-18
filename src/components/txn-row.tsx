"use client";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { signedShare, signedSpend } from "@/domain/reports";
import type { ExpenseRecord } from "@/domain/types";
import { Badge } from "./ui";
import { cn } from "@/lib/cn";

/** Amount display with direction. Spending is signed by the domain rule; non-spending kinds show a label. */
export function Amount({ r }: { r: ExpenseRecord }) {
  const v = signedSpend(r);
  const neutral = !r.excluded && v === 0;
  return (
    <span className={cn("num font-medium", v < 0 && "text-accent", (neutral || r.excluded) && "text-muted")}>
      {r.kind === "refund" ? "−" : r.kind === "income" ? "+" : ""}{formatINR(r.amountPaise)}
    </span>
  );
}

export function TxnBadges({ r }: { r: ExpenseRecord }) {
  return (
    <>
      {r.status === "unreviewed" && <Badge tone="warn">Unreviewed</Badge>}
      {r.duplicateOf && <Badge tone="bad">Possible duplicate</Badge>}
      {r.receiptId && <Badge tone="good">Receipt linked</Badge>}
      {r.excluded && <Badge>Excluded</Badge>}
      {r.kind !== "purchase" && <Badge>{r.kind === "cc_payment" ? "Card bill payment" : r.kind}</Badge>}
      {r.shared && <Badge tone="good">Shared</Badge>}
    </>
  );
}

export function TxnCard({ r, onClick }: { r: ExpenseRecord; onClick?: () => void }) {
  const { nameOf, categoryName } = useStore();
  const mine = signedShare(r, "me");
  return (
    <button onClick={onClick} className="block w-full rounded-lg border border-border bg-surface p-3 text-left active:bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{r.merchant}</div>
          <div className="text-xs text-muted">{r.date} · {categoryName(r.categoryId)} · paid by {nameOf(r.payerId)}</div>
        </div>
        <div className="text-right">
          <Amount r={r} />
          {r.shared && !r.excluded && mine !== 0 && <div className="num text-xs text-muted">my share {formatINR(Math.abs(mine))}</div>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1"><TxnBadges r={r} /></div>
    </button>
  );
}
