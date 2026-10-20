"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@/components/ui";

/**
 * A pop-up that blocks the screen while something slow is happening (reading a statement, asking AI, saving), so it is always clear
 * that work is in progress. It shows how long it has been going and cannot be dismissed by accident.
 */
export function BusyOverlay({ open, title, detail }: { open: boolean; title: string; detail?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) return;
    const started = Date.now();
    const tick = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => { window.clearInterval(tick); setSeconds(0); };
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => e.preventDefault()} aria-labelledby="busy-title" className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-3xl bg-surface p-0 text-center shadow-xl backdrop:bg-black/40">
      {open && (
        <div role="status" aria-live="polite" className="space-y-4 px-6 pb-6 pt-7">
          <div aria-hidden className="mx-auto size-12 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
          <div>
            <h2 id="busy-title" className="text-base font-semibold">{title}</h2>
            {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-border/60"><div className="h-full w-1/3 animate-[busy-slide_1.3s_ease-in-out_infinite] rounded-full bg-accent" /></div>
          <p className="num text-xs text-muted">{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`} · please keep this screen open</p>
        </div>
      )}
    </dialog>
  );
}

/** A problem, shown as a pop-up where the person is looking instead of a message somewhere down the page. */
export function ErrorDialog({ message, onClose, title = "That didn’t work" }: { message: string | null; onClose: () => void; title?: string }) {
  return (
    <Dialog open={!!message} onClose={onClose} title={title}>
      <div className="space-y-3 pb-1 text-sm">
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">{message}</p>
        <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-surface px-4 py-3"><Button variant="primary" onClick={onClose}>OK</Button></div>
      </div>
    </Dialog>
  );
}
