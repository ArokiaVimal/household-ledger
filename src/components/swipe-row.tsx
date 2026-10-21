"use client";
import { Check, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const THRESHOLD = 84;
const MAX = 120;

/**
 * A row you can swipe on a touch screen: right to confirm (green check), left to delete (red bin). Nothing happens
 * until you let go past the threshold, and the delete still asks for confirmation. Taps and vertical scrolling are untouched.
 */
export function SwipeRow({ children, onRight, onLeft, rightLabel = "Verify", className }: { children: ReactNode; onRight?: () => void; onLeft?: () => void; rightLabel?: string; className?: string }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);
  const dragged = useRef(false);
  const dxRef = useRef(0);

  const move = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    if (!horizontal.current) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) horizontal.current = true; else return; }
    dragged.current = true;
    const allowed = mx > 0 ? !!onRight : !!onLeft;
    dxRef.current = allowed ? Math.max(-MAX, Math.min(MAX, mx)) : 0;
    setDx(dxRef.current);
  };
  const end = () => {
    const was = dxRef.current;
    dxRef.current = 0;
    start.current = null; horizontal.current = false;
    setDx(0);
    if (was >= THRESHOLD) onRight?.(); else if (was <= -THRESHOLD) onLeft?.();
    // The tap that follows a drag must not open the row.
    if (dragged.current) setTimeout(() => { dragged.current = false; }, 50);
  };

  return (
    <div className={cn("relative overflow-hidden rounded-[var(--radius-card)] bg-surface", className)}>
      {dx > 0 && <div aria-hidden className="absolute inset-0 flex items-center bg-good px-4 text-sm font-semibold text-white"><Check size={18} className="mr-1.5" />{rightLabel}</div>}
      {dx < 0 && <div aria-hidden className="absolute inset-0 flex items-center justify-end bg-danger px-4 text-sm font-semibold text-white">Delete<Trash2 size={18} className="ml-1.5" /></div>}
      <div
        onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; horizontal.current = false; }}
        onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
        onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); } }}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 180ms ease-out" : "none", touchAction: "pan-y" }}
        className="relative bg-surface"
      >
        {children}
      </div>
    </div>
  );
}
