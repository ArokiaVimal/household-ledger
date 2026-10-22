"use client";
import { GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyOverlay, ErrorDialog } from "@/components/feedback";
import { Button } from "@/components/ui";

interface Result { counts: { verified: number; added: number; upgraded: number; kept: number; icons: number; categories: number; accounts: number; merchantIcons: number }; lessons: { topic: string; text: string }[] }
const TOPIC: Record<string, string> = { overview: "Overview", merchants: "Merchants and categories", payment: "Payment methods", splits: "Splitting", vouchers: "Vouchers", check: "Worth a look" };

/** Learns from what you have verified (no AI, your data only) and tidies icons. Shows exactly what it learned. */
export function LearnCard({ live }: { live: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/learn", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || !data.lessons || !data.counts) setError(data.error ?? "Could not learn from your transactions.");
      else { setResult(data as Result); router.refresh(); }
    } catch { setError("Network problem. Try again."); }
    setBusy(false);
  };
  const groups = result ? Object.keys(TOPIC).map((t) => ({ t, items: result.lessons.filter((l) => l.topic === t) })).filter((g) => g.items.length) : [];
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><GraduationCap size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Learn from my verified transactions</div>
          <p className="text-sm text-muted">Remembers each merchant&apos;s category and type from what you verified, finds your habits, and fills any missing icons and brand logos. Uses only your own data, no AI. A choice you made is never replaced.</p>
        </div>
      </div>
      <Button variant="primary" onClick={() => void run()} disabled={busy || !live}>{busy ? "Learning…" : "Learn and update icons"}</Button>
      {!live && <p className="text-xs text-muted">This needs a signed-in account.</p>}
      <BusyOverlay open={busy} title="Learning from your transactions…" detail="Reading what you verified and saving what it learned." />
      <ErrorDialog message={error} onClose={() => setError(null)} />
      {result && (
        <div className="space-y-3" role="status">
          <p className="rounded-xl bg-good-soft p-3 text-sm text-good">Done. {result.counts.added} new and {result.counts.upgraded} updated merchants remembered; {result.counts.icons} icons and logos filled in ({result.counts.categories} categories, {result.counts.accounts} payment methods, {result.counts.merchantIcons} merchants).</p>
          {groups.map((g) => (
            <section key={g.t}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/80">{TOPIC[g.t]}</h3>
              <ul className="space-y-1.5 text-sm">{g.items.map((l, i) => <li key={i} className="rounded-xl bg-background px-3 py-2">{l.text}</li>)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
