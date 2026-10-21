import type { ReactNode } from "react";

/**
 * Small flat illustrations for empty screens. They use the app's colour tokens, so they follow the theme, and are decorative only
 * (hidden from screen readers; the words next to them say everything).
 */
export type ArtName = "generic" | "groups" | "people" | "transactions" | "chart" | "search" | "receipt" | "done" | "history" | "bills";

const SOFT = "var(--accent-soft)", INK = "var(--accent)", MID = "#a89be8", PAPER = "var(--surface)", GOOD = "var(--good)";

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 120" width="152" height="114" aria-hidden focusable="false" className="mx-auto block">
      <ellipse cx="80" cy="64" rx="62" ry="46" fill={SOFT} />
      <circle cx="26" cy="30" r="3.5" fill={MID} /><circle cx="140" cy="86" r="3" fill={MID} /><circle cx="132" cy="22" r="2.5" fill={INK} opacity=".5" />
      {children}
    </svg>
  );
}
const Person = ({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) => (
  <g fill={fill}><circle cx={x} cy={y} r={r} /><path d={`M${x - r * 1.9} ${y + r * 3.2}a${r * 1.9} ${r * 1.9} 0 0 1 ${r * 3.8} 0z`} /></g>
);
const Line = ({ x, y, w, o = 1 }: { x: number; y: number; w: number; o?: number }) => <rect x={x} y={y} width={w} height="5" rx="2.5" fill={MID} opacity={o} />;

const ART: Record<ArtName, ReactNode> = {
  generic: (
    <g>
      <path d="M44 56l12-16h48l12 16v32a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 56h24a12 12 0 0 0 24 0h24" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="116" cy="28" r="6" fill={INK} /><path d="M116 22v-6M116 40v-6M104 28h-6M134 28h-6" stroke={MID} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  ),
  groups: (
    <g>
      <Person x={46} y={52} r={8} fill={MID} /><Person x={114} y={52} r={8} fill={MID} /><Person x={80} y={44} r={11} fill={INK} />
      <circle cx="124" cy="24" r="10" fill={GOOD} /><path d="M124 19v10M119 24h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  people: (
    <g>
      <Person x={64} y={46} r={12} fill={INK} />
      <circle cx="108" cy="68" r="19" fill={PAPER} stroke={INK} strokeWidth="3" />
      <text x="108" y="75" textAnchor="middle" fontSize="21" fontWeight="700" fill={INK}>₹</text>
    </g>
  ),
  transactions: (
    <g>
      <rect x="38" y="22" width="84" height="76" rx="10" fill={PAPER} stroke={INK} strokeWidth="3" />
      {[40, 60, 80].map((y, i) => (
        <g key={y}><circle cx="56" cy={y} r="6" fill={i === 1 ? INK : MID} /><Line x={68} y={y - 7} w={34} /><Line x={68} y={y + 1} w={20} o={0.55} /></g>
      ))}
    </g>
  ),
  chart: (
    <g>
      <rect x="36" y="24" width="88" height="72" rx="10" fill={PAPER} stroke={INK} strokeWidth="3" />
      <rect x="50" y="64" width="12" height="22" rx="3" fill={MID} /><rect x="74" y="48" width="12" height="38" rx="3" fill={INK} /><rect x="98" y="56" width="12" height="30" rx="3" fill={MID} />
      <path d="M48 44l22-10 18 6 24-14" fill="none" stroke={GOOD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  search: (
    <g>
      <rect x="40" y="26" width="64" height="64" rx="10" fill={PAPER} stroke={MID} strokeWidth="3" />
      <Line x={52} y={40} w={38} /><Line x={52} y={54} w={26} o={0.6} />
      <circle cx="94" cy="68" r="20" fill={PAPER} fillOpacity=".85" stroke={INK} strokeWidth="5" />
      <path d="M109 83l16 16" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    </g>
  ),
  receipt: (
    <g>
      <path d="M50 20h60v76l-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <Line x={60} y={34} w={40} /><Line x={60} y={48} w={28} o={0.6} /><Line x={60} y={62} w={34} o={0.6} />
      <rect x="60" y="74" width="40" height="3" rx="1.5" fill={INK} />
    </g>
  ),
  done: (
    <g>
      <circle cx="80" cy="60" r="30" fill={GOOD} /><path d="M65 61l11 11 20-22" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M120 40l3-8 3 8 8 3-8 3-3 8-3-8-8-3z" fill={INK} />
    </g>
  ),
  history: (
    <g>
      <circle cx="80" cy="60" r="31" fill={PAPER} stroke={INK} strokeWidth="4" />
      <path d="M80 42v19l13 8" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  bills: (
    <g>
      <rect x="40" y="38" width="76" height="48" rx="8" fill={MID} transform="rotate(-9 78 62)" />
      <rect x="44" y="34" width="76" height="50" rx="8" fill={INK} />
      <rect x="44" y="46" width="76" height="9" fill="#fff" opacity=".28" />
      <rect x="54" y="66" width="22" height="7" rx="3.5" fill="#fff" opacity=".85" /><circle cx="108" cy="70" r="6" fill="#fff" opacity=".5" />
    </g>
  ),
};

export function Illustration({ name = "generic" }: { name?: ArtName }) {
  return <Frame>{ART[name]}</Frame>;
}
