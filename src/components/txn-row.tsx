"use client";
import { useState, type ReactNode } from "react";
import { brandBadge, logoFor, logoSrc } from "@/lib/logos";
import { Glyph } from "./glyphs";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { signedShare, signedSpend } from "@/domain/reports";
import { needsVoucherBrand } from "@/domain/vouchers";
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

/** `quiet` leaves out the everyday states (Reviewed, Receipt linked) so a list only flags what needs a look. */
export function TxnBadges({ r, quiet, hideStatus }: { r: ExpenseRecord; quiet?: boolean; hideStatus?: boolean }) {
  const { voucherBrands } = useStore();
  const brand = (id?: string) => voucherBrands.find((b) => b.id === id)?.name ?? "voucher";
  return (
    <>
      {hideStatus ? null : r.status === "unreviewed" ? <Badge tone="warn">Unverified</Badge> : quiet ? null : <Badge tone="good">Verified</Badge>}
      {r.duplicateOf && <Badge tone="bad">Possible duplicate</Badge>}
      {r.receiptId && !quiet && <Badge tone="good">Receipt linked</Badge>}
      {r.excluded && <Badge>Excluded</Badge>}
      {r.voucherBrandId && <Badge tone="good">Voucher: {brand(r.voucherBrandId)}</Badge>}
      {needsVoucherBrand(r) && <Badge tone="warn">Needs a voucher brand</Badge>}
      {r.paidWithVoucherId && <Badge>Paid with {brand(r.paidWithVoucherId)} voucher</Badge>}
      {r.kind !== "purchase" && <Badge>{r.kind === "cc_payment" ? "Card bill payment" : r.kind}</Badge>}
      {r.shared && !hideStatus && <Badge tone="good">{r.sharedWithPartner ? "Shared with partner" : "Shared"}</Badge>}
    </>
  );
}

const tints = ["bg-accent-soft text-accent", "bg-good-soft text-good", "bg-warn-soft text-warn", "bg-background text-foreground"];
/**
 * The picture for a merchant: a logo you or AI chose, else a known brand's logo or badge, else a chosen icon, else `fallback`
 * (for example the category's icon), else the first letter.
 */
export function MerchantAvatar({ name, size = 40, fallback }: { name: string; size?: number; fallback?: ReactNode }) {
  const badge = brandBadge(name);
  const { iconsByName, logosByName } = useStore();
  const chosenLogo = logosByName[name.trim().toLowerCase()];
  const logo = chosenLogo ? logoSrc(chosenLogo) : badge ? null : logoFor(name);
  const [failed, setFailed] = useState(false);
  const chosen = iconsByName[name.trim().toLowerCase()];
  if (logo && !failed) {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-full border border-border bg-white" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={size * 0.6} height={size * 0.6} onError={() => setFailed(true)} className="rounded-sm object-contain" />
      </span>
    );
  }
  if (badge && !logo) return <span aria-hidden style={{ width: size, height: size, background: badge.bg, color: badge.fg, fontSize: size * (badge.mark.length > 2 ? 0.28 : badge.mark.length > 1 ? 0.36 : 0.5) }} className="grid shrink-0 place-items-center rounded-full font-bold leading-none tracking-tight">{badge.mark}</span>;
  if (chosen && (!logo || failed)) return <Glyph iconKey={chosen} size={size} />;
  if (fallback) return <>{fallback}</>;
  const tint = tints[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % tints.length];
  return <span aria-hidden style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-full text-sm font-semibold", tint)}>{name[0]?.toUpperCase()}</span>;
}

export function TxnCard({ r, onClick }: { r: ExpenseRecord; onClick?: () => void }) {
  const { nameOf, categoryName, meId, attributionOf, activeGroup } = useStore();
  const mine = signedShare(r, meId);
  const counted = attributionOf(r)?.allocatedPaise ?? 0;
  return (
    <button onClick={onClick} className="block w-full rounded-2xl bg-surface p-3 text-left active:bg-background">
      <div className="flex items-start justify-between gap-3">
        <MerchantAvatar name={r.merchant} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{r.merchant}</div>
          <div className="truncate text-xs text-muted">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {categoryName(r.categoryId)}{r.payerId !== meId ? ` · paid by ${nameOf(r.payerId)}` : ""}</div>
        </div>
        <div className="text-right">
          <Amount r={r} />
          {r.shared && !r.excluded && mine !== 0 && <div className="num text-xs text-muted">my share {formatINR(Math.abs(mine))}</div>}
          {counted !== 0 && Math.abs(counted) !== r.amountPaise && !(r.shared && !r.excluded && Math.abs(counted) === Math.abs(mine)) && <div className="num text-xs text-muted">counts {formatINR(Math.abs(counted))} in {activeGroup.name}</div>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden"><TxnBadges r={r} quiet /></div>
    </button>
  );
}
