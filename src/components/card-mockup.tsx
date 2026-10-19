// A drawn credit-card picture (no real card data, no number): the card's name, a chip and a colour theme.
// The theme is the person's choice, or a sensible default from the issuer's name.
import type { CardTheme } from "@/domain/types";

export const THEME_STYLE: Record<CardTheme, { bg: string; ink: string; label: string }> = {
  indigo: { bg: "linear-gradient(135deg,#4f46e5,#7c3aed)", ink: "#fff", label: "Indigo" },
  navy: { bg: "linear-gradient(135deg,#0f2a5c,#1e4fa3)", ink: "#fff", label: "Navy" },
  teal: { bg: "linear-gradient(135deg,#0f766e,#14b8a6)", ink: "#fff", label: "Teal" },
  plum: { bg: "linear-gradient(135deg,#6b21a8,#be185d)", ink: "#fff", label: "Plum" },
  graphite: { bg: "linear-gradient(135deg,#1f2937,#4b5563)", ink: "#fff", label: "Graphite" },
  platinum: { bg: "linear-gradient(135deg,#cbd5e1,#f1f5f9 55%,#94a3b8)", ink: "#1e293b", label: "Platinum" },
  ruby: { bg: "linear-gradient(135deg,#9f1239,#e11d48)", ink: "#fff", label: "Ruby" },
  gold: { bg: "linear-gradient(135deg,#a16207,#facc15 60%,#ca8a04)", ink: "#3b2a05", label: "Gold" },
};

const BY_ISSUER: [RegExp, CardTheme][] = [[/amex|american express/i, "platinum"], [/hdfc/i, "navy"], [/sbi/i, "teal"], [/icici/i, "ruby"], [/axis/i, "plum"], [/kotak/i, "ruby"], [/indusind|yes bank|idfc/i, "graphite"]];
const ALL: CardTheme[] = ["indigo", "navy", "teal", "plum", "graphite", "platinum", "ruby", "gold"];

export function themeFor(name: string, theme?: CardTheme): CardTheme {
  if (theme) return theme;
  const hit = BY_ISSUER.find(([re]) => re.test(name));
  if (hit) return hit[1];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % ALL.length;
  return ALL[h];
}

/** A tiny card swatch for lists: just the colour and chip. */
export function CardChip({ name, theme }: { name: string; theme?: CardTheme }) {
  const t = THEME_STYLE[themeFor(name, theme)];
  return <span role="img" aria-label={`${name} card`} className="relative inline-block h-8 w-12 shrink-0 overflow-hidden rounded-md shadow-sm" style={{ background: t.bg }}><span className="absolute bottom-1.5 left-1.5 h-2.5 w-3.5 rounded-[3px] bg-yellow-300/90" /></span>;
}

export function CardMockup({ name, theme, hidden, className = "" }: { name: string; theme?: CardTheme; hidden?: boolean; className?: string }) {
  const t = THEME_STYLE[themeFor(name, theme)];
  return (
    <div role="img" aria-label={`${name} card`} className={`relative aspect-[1.586/1] w-full max-w-[17rem] overflow-hidden rounded-2xl p-4 shadow-md ${hidden ? "opacity-50 grayscale" : ""} ${className}`} style={{ background: t.bg, color: t.ink }}>
      <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/15" aria-hidden />
      <div className="pointer-events-none absolute -bottom-12 -left-6 size-32 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold leading-tight">{name}</span><span className="text-[10px] font-medium uppercase tracking-widest opacity-80">Credit</span></div>
        <div className="h-7 w-9 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500 opacity-90" aria-hidden />
        <div className="text-[11px] tracking-[0.25em] opacity-80" aria-hidden>••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••</div>
      </div>
    </div>
  );
}
