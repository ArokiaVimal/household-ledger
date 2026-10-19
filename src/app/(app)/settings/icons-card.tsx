"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Glyph } from "@/components/glyphs";
import { AiBadge, Button } from "@/components/ui";
import { useStore } from "@/data/store";
import type { IconPick } from "@/lib/icons/ai";

const KIND: Record<IconPick["kind"], string> = { category: "Category", account: "Payment method", merchant: "Merchant" };

/** Asks AI for icons for anything new (categories, payment methods, merchants). Only names are sent; you review before anything changes. */
export function IconsCard() {
  const { applyIcons } = useStore();
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<IconPick[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true); setMsg(null); setPicks(null);
    try {
      const res = await fetch("/api/icons", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { picks?: IconPick[]; error?: string; message?: string };
      if (!res.ok) setMsg(data.error ?? "Could not refresh icons.");
      else if (!data.picks?.length) setMsg(data.message ?? "Nothing new needs an icon.");
      else setPicks(data.picks);
    } catch { setMsg("Network problem. Try again."); }
    setBusy(false);
  };
  const apply = () => {
    if (!picks) return;
    applyIcons({
      categories: picks.filter((p) => p.kind === "category").map((p) => ({ id: p.ref, icon: p.icon })),
      accounts: picks.filter((p) => p.kind === "account").map((p) => ({ id: p.ref, icon: p.icon })),
      merchants: picks.filter((p) => p.kind === "merchant").map((p) => ({ name: p.ref, icon: p.icon })),
    });
    setMsg(`Saved ${picks.length} icon${picks.length === 1 ? "" : "s"}.`); setPicks(null);
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">Refresh icons <AiBadge /></div>
          <p className="text-sm text-muted">Goes through categories, payment methods and merchants you added since, and suggests an icon for each. Only the names are sent, never amounts or notes. Icons come from the app&apos;s built-in set, and you review them before they are saved.</p>
        </div>
      </div>
      <Button onClick={() => void refresh()} disabled={busy}>{busy ? "Looking…" : "Refresh icons with AI"}</Button>
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
      {picks && (
        <div className="space-y-2">
          <ul className="max-h-64 divide-y divide-border overflow-auto rounded-xl bg-background px-3 text-sm">
            {picks.map((p) => <li key={`${p.kind}-${p.ref}`} className="flex items-center gap-2.5 py-2"><Glyph iconKey={p.icon} size={28} /><span className="min-w-0 flex-1 truncate font-medium">{p.name}</span><span className="text-xs text-muted">{KIND[p.kind]}</span></li>)}
          </ul>
          <div className="flex gap-2"><Button variant="primary" onClick={apply}>Save these icons</Button><Button onClick={() => setPicks(null)}>Discard</Button></div>
        </div>
      )}
    </div>
  );
}
