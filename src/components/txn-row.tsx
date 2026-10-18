"use client";
import { useState } from "react";
import { logoFor } from "@/lib/logos";
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
      {r.status === "unreviewed" ? <Badge tone="warn">Unreviewed</Badge> : <Badge tone="good">Reviewed</Badge>}
      {r.duplicateOf && <Badge tone="bad">Possible duplicate</Badge>}
      {r.receiptId && <Badge tone="good">Receipt linked</Badge>}
      {r.excluded && <Badge>Excluded</Badge>}
      {r.kind !== "purchase" && <Badge>{r.kind === "cc_payment" ? "Card bill payment" : r.kind}</Badge>}
      {r.shared && <Badge tone="good">{r.sharedWithPartner ? "Shared with partner" : "Shared"}</Badge>}
    </>
  );
}

const tints = ["bg-accent-soft text-accent", "bg-good-soft text-good", "bg-warn-soft text-warn", "bg-background text-foreground"];
export function MerchantAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const logo = logoFor(name);
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-full border border-border bg-white" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={size * 0.6} height={size * 0.6} onError={() => setFailed(true)} className="rounded-sm object-contain" />
      </span>
    );
  }
  const tint = tints[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % tints.length];
  return <span aria-hidden style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-full text-sm font-semibold", tint)}>{name[0]?.toUpperCase()}</span>;
}

export function TxnCard({ r, onClick }: { r: ExpenseRecord; onClick?: () => void }) {
  const { nameOf, categoryName, meId } = useStore();
  const mine = signedShare(r, meId);
  return (
    <button onClick={onClick} className="block w-full rounded-2xl bg-surface p-3 text-left active:bg-background">
      <div className="flex items-start justify-between gap-3">
        <MerchantAvatar name={r.merchant} />
        <div className="min-w-0 flex-1">
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
