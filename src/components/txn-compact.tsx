"use client";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { Amount, MerchantAvatar } from "@/components/txn-row";
import { SwipeRow } from "@/components/swipe-row";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { signedShare } from "@/domain/reports";
import type { ExpenseRecord } from "@/domain/types";

/** What deserves a look on an unverified row, in a few words. */
export function attentionOf(r: ExpenseRecord): { text: string; bad: boolean } | null {
  if (r.status !== "unreviewed") return null;
  if (r.duplicateOf) return { text: "Possible duplicate", bad: true };
  if (r.suggested === "ai_unsure") return { text: "AI unsure", bad: false };
  if (!r.suggested && r.categoryId === "uncategorized" && !r.voucherBrandId) return { text: "Needs a category", bad: false };
  return null;
}

/**
 * One transaction in two tight lines: merchant (with an amber dot while unverified and a people icon when shared) and amount, then
 * category, any flag and your share. Swipe right to verify an unverified row, left to delete it.
 */
export function CompactRow({ r, onOpen, onVerify, onDelete, showDate, leading }: { r: ExpenseRecord; onOpen: () => void; onVerify?: () => void; onDelete?: () => void; showDate?: boolean; leading?: ReactNode }) {
  const { categoryName, meId } = useStore();
  const mine = signedShare(r, meId);
  const flag = attentionOf(r);
  const unverified = r.status === "unreviewed";
  return (
    <SwipeRow onRight={unverified ? onVerify : undefined} onLeft={onDelete}>
      <div className="flex items-center gap-2 pl-3 pr-3">
        {leading}
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left active:bg-background">
          <MerchantAvatar name={r.merchant} size={34} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{r.merchant}</span>
              {unverified && <span role="img" aria-label="Unverified" className="size-2 shrink-0 rounded-full bg-warn" />}
              {r.shared && <Users size={13} aria-label="Shared" className="shrink-0 text-good" />}
            </span>
            <span className="block truncate text-xs text-muted">
              {showDate ? `${new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ` : ""}{categoryName(r.categoryId)}
              {flag && <span className={flag.bad ? " font-medium text-danger" : " font-medium text-warn"}> · {flag.text}</span>}
            </span>
          </span>
          <span className="text-right">
            <Amount r={r} />
            {r.shared && !r.excluded && mine !== 0 && <span className="num block text-[11px] leading-tight text-muted">mine {formatINR(Math.abs(mine))}</span>}
          </span>
        </button>
      </div>
    </SwipeRow>
  );
}
