/** Shown while a screen loads, so navigation feels instant instead of blank. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 md:space-y-4">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className={`h-40 animate-pulse rounded-[var(--radius-card)] bg-surface ${i === 2 ? "col-span-2 lg:col-span-1" : ""}`} />)}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}
