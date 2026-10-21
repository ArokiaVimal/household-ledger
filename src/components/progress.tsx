/** A small ring showing a percentage, like a fitness ring. */
export function ProgressRing({ pct, size = 44, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  return (
    <span role="img" aria-label={label ?? `${pct}% verified`} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} className="stroke-border" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className={`transition-[stroke-dashoffset] duration-500 ${pct === 100 ? "stroke-good" : "stroke-accent"}`} />
      </svg>
      <span className="num absolute text-[11px] font-semibold">{pct}%</span>
    </span>
  );
}

/** A slim bar with "x of y verified". */
export function ProgressBar({ verified, total, pct }: { verified: number; total: number; pct: number }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Verified transactions" className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-muted"><span>{verified} of {total} verified</span><span className="num">{pct}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className={`h-full rounded-full transition-[width] duration-500 ${pct === 100 ? "bg-good" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
