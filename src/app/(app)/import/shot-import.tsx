"use client";
import { Image as ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiBadge, Button, Dialog, Input } from "@/components/ui";
import { MerchantAvatar } from "@/components/txn-row";
import { useStore } from "@/data/store";
import { formatINR } from "@/domain/money";
import { imageToJpegDataUrl } from "@/lib/image";
import { brandFor, planShots, shotNote, type ShotLike, type ShotPlan } from "@/domain/import/screenshot";

const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** Read payments from a screenshot with AI, match them to what you already have, then save only what you confirm. */
export function ShotImport({ open, onClose, aiEnabled }: { open: boolean; onClose: () => void; aiEnabled: boolean }) {
  const { accounts, accountName, records, staged, voucherBrands, addVoucherBrand, updateRecord, updateStaged } = useStore();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [source, setSource] = useState("");
  const [plans, setPlans] = useState<ShotPlan[] | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [accountId, setAccountId] = useState("");
  const [unreadable, setUnreadable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pool = useMemo(() => [...records, ...staged], [records, staged]);
  const usable = accounts.filter((a) => a.type !== "cash" && !a.archived);
  const reset = () => { setImage(null); setPlans(null); setOff(new Set()); setError(null); setDone(null); setUnreadable(0); if (file.current) file.current.value = ""; };
  const close = () => { reset(); onClose(); };

  const pick = async (f: File | undefined | null) => {
    if (!f) return;
    setError(null); setDone(null); setPlans(null);
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return setError("Use a PNG, JPG or WebP screenshot.");
    try { setImage({ url: await imageToJpegDataUrl(f), name: f.name || "Pasted screenshot" }); } catch { setError("Could not open that image."); }
  };
  // Paste a screenshot straight from the clipboard while the pop-up is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void pick(f); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const read = async () => {
    if (!image) return;
    setBusy(true); setError(null); setPlans(null);
    try {
      const res = await fetch("/api/import/screenshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", image: image.url, source }) });
      const r = (await res.json()) as { ok?: boolean; error?: string; items?: ShotLike[]; unreadable?: number };
      if (!res.ok || !r.items) return setError(r.error ?? "Could not read that screenshot.");
      if (r.items.length === 0) return setError("No payments found in that screenshot.");
      const next = planShots(r.items, pool);
      setPlans(next); setUnreadable(r.unreadable ?? 0); setOff(new Set());
      // Payment method for new rows: the card the matched payments are on, else the card most used for this merchant, else the first card.
      const tagged = next.find((p) => p.action === "tag");
      const fromMatch = tagged?.action === "tag" ? tagged.record.accountId : undefined;
      const merchant = r.items[0]?.merchant.toLowerCase();
      const common = merchant ? mostUsed(pool.filter((x) => x.merchant.toLowerCase() === merchant).map((x) => x.accountId)) : undefined;
      setAccountId(fromMatch ?? common ?? usable.find((a) => a.type === "credit_card")?.id ?? usable[0]?.id ?? "");
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  };

  const active = (plans ?? []).map((p, i) => ({ p, i })).filter(({ p, i }) => p.action !== "skip" && !off.has(i));
  const tags = active.filter(({ p }) => p.action === "tag");
  const adds = active.filter(({ p }) => p.action === "add");
  const skips = (plans ?? []).filter((p) => p.action === "skip");

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      // Voucher brands first (a new one is created once per name).
      const brandIds = new Map<string, string>();
      const brandOf = (item: ShotLike): string | undefined => {
        if (!item.voucherBrand) return undefined;
        const key = item.voucherBrand.toLowerCase();
        if (brandIds.has(key)) return brandIds.get(key);
        const have = brandFor(item.voucherBrand, voucherBrands);
        const id = have?.id ?? (() => { const a = addVoucherBrand(item.voucherBrand!); return a.id; })();
        if (id) brandIds.set(key, id);
        return id;
      };
      for (const { p } of tags) {
        if (p.action !== "tag") continue;
        const brandId = brandOf(p.item);
        const patch = { ...(brandId ? { voucherBrandId: brandId, voucherPending: false } : {}), notes: shotNote(p.item, p.record.notes) };
        if (records.some((r) => r.id === p.record.id)) updateRecord(p.record.id, patch); else updateStaged(p.record.id, patch);
      }
      let added = 0;
      if (adds.length > 0) {
        const rows = adds.map(({ p }) => ({ date: p.item.date, merchant: p.item.merchant, amountPaise: p.item.amountPaise, orderId: p.item.orderId, voucherBrandId: brandOf(p.item), note: shotNote(p.item) }));
        const res = await fetch("/api/import/screenshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", accountId, rows }) });
        const r = (await res.json()) as { ok?: boolean; error?: string; result?: { counts: { staged: number } } };
        if (!res.ok) return setError(r.error ?? "Could not save the new payments.");
        added = r.result?.counts.staged ?? 0;
      }
      setDone([tags.length ? `${tags.length} matched and tagged` : "", added ? `${added} added as unverified` : ""].filter(Boolean).join(" · ") || "Nothing to save.");
      setPlans(null); setImage(null);
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={close} title="Read a screenshot">
      <div className="space-y-4 pb-1 text-sm">
        {done ? (
          <div className="space-y-3">
            <p role="status" className="rounded-xl bg-good-soft p-3 text-good">{done}</p>
            <div className="flex gap-2"><Button variant="primary" onClick={() => { close(); router.push("/transactions?v=unverified"); }}>See unverified</Button><Button onClick={close}>Close</Button></div>
          </div>
        ) : !plans ? (
          <>
            <p className="text-muted">Add a screenshot of payments or orders. Claude reads it and you confirm everything before it is saved.</p>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label="Choose a screenshot" onChange={(e) => void pick(e.target.files?.[0])} />
            <button type="button" onClick={() => file.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background p-4 text-center text-muted hover:border-accent">
              {image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={image.url} alt="Your screenshot" className="max-h-56 rounded-lg" />
                : <><ImageIcon size={22} aria-hidden /><span>Choose a screenshot, or paste one</span></>}
            </button>
            <label className="block space-y-1"><span className="text-xs font-medium text-muted">What is it? (optional)</span>
              <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} placeholder="e.g. Shopwise orders" /></label>
            <p className="rounded-xl bg-background p-3 text-xs text-muted">Claude sees the whole picture, so hide anything private first. It is not stored.</p>
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!image || busy || !aiEnabled} onClick={() => void read()}>{busy ? "Reading…" : "Read with AI"}<AiBadge /></Button>
              <Button onClick={close}>Cancel</Button>
              {!aiEnabled && <span className="text-xs text-muted">AI is off on this server.</span>}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Here is what we found</h3><AiBadge /></div>
            <p className="text-xs text-muted">{tags.length} match what you have · {adds.length} new · {skips.length} skipped{unreadable ? ` · ${unreadable} unreadable` : ""}. Check each amount.</p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {plans.map((p, i) => {
                const skip = p.action === "skip";
                return (
                  <li key={i} className={`flex items-center gap-3 p-3 ${skip ? "opacity-60" : ""}`}>
                    <input type="checkbox" aria-label={`Include ${p.item.merchant} ${formatINR(p.item.amountPaise)}`} disabled={skip} checked={!skip && !off.has(i)} onChange={() => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="size-4 accent-[var(--color-accent,#5b3fd6)]" />
                    <MerchantAvatar name={p.item.voucherBrand ?? p.item.merchant} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.item.voucherBrand ?? p.item.merchant}</span>
                      <span className="block truncate text-xs text-muted">
                        {[p.item.faceValuePaise ? `${formatINR(p.item.faceValuePaise)} card` : "", p.action === "skip" ? p.why : p.action === "tag" ? `Matches ${accountName(p.record.accountId)} · ${dateLabel(p.record.date)}` : "New"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="num shrink-0 font-medium">{formatINR(p.item.amountPaise)}<span className="block text-right text-xs font-normal text-muted">{dateLabel(p.item.date)}</span></span>
                  </li>
                );
              })}
            </ul>
            {adds.length > 0 && (
              <label className="block space-y-1"><span className="text-xs font-medium text-muted">Payment method for the new ones</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
                  {usable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></label>
            )}
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={busy || active.length === 0 || (adds.length > 0 && !accountId)} onClick={() => void apply()}>{busy ? "Saving…" : `Apply ${active.length}`}</Button>
              <Button onClick={() => setPlans(null)}>Back</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function mostUsed(ids: string[]): string | undefined {
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
