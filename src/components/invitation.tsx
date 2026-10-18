"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui";
import type { InviteOffer } from "@/lib/households/types";

/** Shown instead of the app when someone has been invited to share, before anything is created for them. */
export function Invitation({ offers, firstName }: { offers: InviteOffer[]; firstName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offer = offers[0];

  const call = async (payload: object, tag: string) => {
    setBusy(tag); setError(null);
    try {
      const res = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.");
      router.refresh();
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-md space-y-5 rounded-[28px] bg-background p-7 shadow-[0_24px_80px_-24px_rgba(58,35,153,0.45)] sm:p-9">
        <LogoMark size={48} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
          <p className="mt-2 text-muted"><b className="text-foreground">{offer.inviterName}</b> invited you to share expenses on Personal Finance App.</p>
        </div>
        <ul className="space-y-2 rounded-2xl bg-surface p-4 text-sm text-muted">
          <li>Joining lets you split expenses with {offer.inviterName} and see what is shared.</li>
          <li>You can also keep your own private tracking. Nothing is shared until you choose.</li>
        </ul>
        {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="min-h-11 text-[15px]" disabled={!!busy} onClick={() => call({ action: "accept", hash: offer.hash }, "accept")}>{busy === "accept" ? "Joining…" : `Join ${offer.inviterName}`}</Button>
          <Button className="min-h-11 text-[15px]" disabled={!!busy} onClick={() => call({ action: "start" }, "start")}>{busy === "start" ? "Setting up…" : "Start on my own for now"}</Button>
        </div>
        <p className="text-xs text-muted">Starting on your own is fine: the invitation stays valid for a week, and you can join later from Settings → Sharing as long as you have not added data.</p>
      </div>
    </main>
  );
}
