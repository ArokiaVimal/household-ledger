"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Glyph } from "@/components/glyphs";
import { AiBadge, Button } from "@/components/ui";
import { useStore } from "@/data/store";
import type { IconPick } from "@/lib/icons/ai";
import { logoSrc } from "@/lib/logos";
import { cn } from "@/lib/cn";

const KIND: Record<IconPick["kind"], string> = { category: "Category", account: "Payment method", merchant: "Merchant" };
const keyOf = (p: IconPick) => `${p.kind}-${p.ref}`;

/**
 * Asks AI for icons and brand logos for anything new (categories, payment methods, merchants). Only names are sent. For a merchant
 * AI may also point at one of our own logo files; you choose the logo or the icon for each, and nothing changes until you save.
 */
export function IconsCard({ live, aiEnabled }: { live: boolean; aiEnabled: boolean }) {
  const { applyIcons } = useStore();
  const [busy, setBusy] = useState<"new" | "all" | null>(null);
  const [picks, setPicks] = useState<IconPick[] | null>(null);
  const [use, setUse] = useState<Record<string, "logo" | "icon">>({});
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async (all: boolean) => {
    setBusy(all ? "all" : "new"); setMsg(null); setPicks(null);
    try {
      const res = await fetch("/api/icons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all }) });
      const data = (await res.json().catch(() => ({}))) as { picks?: IconPick[]; error?: string; message?: string };
      if (!res.ok) setMsg(data.error ?? "Could not refresh icons.");
      else if (!data.picks?.length) setMsg(data.message ?? "Nothing new needs an icon or logo.");
      else { setPicks(data.picks); setUse(Object.fromEntries(data.picks.map((p) => [keyOf(p), p.logo ? "logo" : "icon"]))); }
    } catch { setMsg("Network problem. Try again."); }
    setBusy(null);
  };
  const apply = () => {
    if (!picks) return;
    applyIcons({
      categories: picks.filter((p) => p.kind === "category").map((p) => ({ id: p.ref, icon: p.icon })),
      accounts: picks.filter((p) => p.kind === "account").map((p) => ({ id: p.ref, icon: p.icon })),
      merchants: picks.filter((p) => p.kind === "merchant").map((p) => (p.logo && use[keyOf(p)] === "logo" ? { name: p.ref, logo: p.logo } : { name: p.ref, icon: p.icon })),
    });
    setMsg(`Saved ${picks.length} item${picks.length === 1 ? "" : "s"}.`); setPicks(null);
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">Icons and logos <AiBadge /></div>
          <p className="text-sm text-muted">Suggests an icon, and a brand logo where it recognizes one, for categories, payment methods and merchants. Only names are sent. You choose, then save.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void refresh(false)} disabled={!!busy || !live || !aiEnabled}>{busy === "new" ? "Looking…" : "Suggest for new items"}</Button>
        <Button variant="ghost" onClick={() => void refresh(true)} disabled={!!busy || !live || !aiEnabled}>{busy === "all" ? "Looking…" : "Redo everything"}</Button>
      </div>
      {!live && <p className="text-xs text-muted">This needs a signed-in account. The demo has no AI.</p>}
      {live && !aiEnabled && <p className="text-xs text-muted">AI is off. Add an Anthropic API key to turn it on.</p>}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
      {picks && (
        <div className="space-y-2">
          <ul className="max-h-72 divide-y divide-border overflow-auto rounded-xl bg-background px-3 text-sm">
            {picks.map((p) => {
              const k = keyOf(p);
              const choice = p.logo ? use[k] ?? "logo" : "icon";
              return (
                <li key={k} className="flex items-center gap-2.5 py-2">
                  <span className="grid size-8 shrink-0 place-items-center">
                    {choice === "logo" && p.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoSrc(p.logo)} alt="" width={26} height={26} className="rounded-sm object-contain" />
                    ) : <Glyph iconKey={p.icon} size={30} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block text-xs text-muted">{KIND[p.kind]}</span></span>
                  {p.logo && (
                    <span role="radiogroup" aria-label={`Show ${p.name} as`} className="flex shrink-0 rounded-full bg-border/60 p-0.5 text-xs">
                      {(["logo", "icon"] as const).map((o) => (
                        <button key={o} type="button" role="radio" aria-checked={choice === o} onClick={() => setUse((u) => ({ ...u, [k]: o }))} className={cn("min-h-8 rounded-full px-3 font-medium capitalize", choice === o ? "bg-surface text-foreground shadow-sm" : "text-muted")}>{o}</button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2"><Button variant="primary" onClick={apply}>Save</Button><Button onClick={() => setPicks(null)}>Discard</Button></div>
        </div>
      )}
    </div>
  );
}
