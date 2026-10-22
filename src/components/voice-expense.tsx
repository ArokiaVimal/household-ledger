"use client";
import { Camera, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/lib/speech";
import { useStore } from "@/data/store";
import { resolveVoice, type VoiceFacts, type VoiceFill } from "@/domain/voice-expense";
import { Button } from "./ui";

/** What the Add form applies: the first answer from Claude, or one more detail the person chose (a card, an added friend). */
export type VoicePatch = Partial<Omit<VoiceFill, "withIds">> & { withIds?: string[]; addWithIds?: string[] };

const EXAMPLE = "Lunch with Varru and Meera at A2B for 365, split by 3, paid with Amex";

/** A round icon button for an AI action in the Amount box. The small sparkle says it is AI. No text, so a label is required. */
export function AiIconButton({ label, children, active, className, ...rest }: { label: string; children: ReactNode; active?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cn("relative grid size-8 shrink-0 place-items-center rounded-full shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40", active ? "bg-danger text-white" : "bg-surface text-accent hover:bg-accent/10", className)}>
      {children}
      <span aria-hidden className={cn("absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full ring-2 ring-white", active ? "bg-white text-danger" : "bg-accent text-white")}><Sparkles size={8} fill="currentColor" /></span>
    </button>
  );
}

/** The camera icon (scan, upload or drop a bill) in the same style, so the two AI actions sit side by side. */
export function BillIconButton(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <AiIconButton label="Scan, upload or drop a bill" {...props}><Camera size={15} aria-hidden /></AiIconButton>;
}

/**
 * "Speak your expense" for the Add form. The browser turns the voice into text, Claude pulls the expense out of it (an AI step), and the
 * form is filled in for review. Names that are not contacts and cards that match more than one are asked about, never guessed. Nothing
 * is saved from here. Returns the microphone icon (for the Amount box header) and a compact status area (for under the amount).
 */
export function useVoiceExpense(onFill: (p: VoicePatch) => void): { mic: ReactNode; panel: ReactNode } {
  const { aiEnabled, live, participants, meId, accounts, categories, addParticipant, nameOf } = useStore();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<VoiceFill | null>(null);

  const run = async (spoken: string) => {
    const t = spoken.trim();
    if (t.length < 3) return;
    setBusy(true); setError(null); setOpen(null); setEditing(false);
    try {
      const res = await fetch("/api/voice-expense", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: t, categories: categories.map((c) => c.name) }) });
      const r = (await res.json()) as { facts?: VoiceFacts; warnings?: string[]; error?: string };
      if (!res.ok || !r.facts) { setError(r.error ?? "Could not understand that."); return; }
      const fill = resolveVoice(r.facts, {
        meId, contacts: participants.filter((p) => p.id !== meId).map((p) => ({ id: p.id, name: p.name, nickname: p.nickname })),
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, parentId: a.parentId, archived: a.archived })), categories: categories.map((c) => ({ id: c.id, name: c.name })),
      }, r.warnings ?? []);
      onFill(fill);
      setOpen(fill);
    } catch (e) { setError((e as Error).message || "Could not understand that."); } finally { setBusy(false); }
  };

  const speech = useSpeech("en-IN", (final) => { if (final) { setText(final); void run(final); } });
  const off = !live || !aiEnabled;
  const label = speech.listening ? "Stop and fill the form" : speech.supported ? "Speak your expense" : "Type your expense";

  const mic = (
    <AiIconButton label={off ? (live ? "Voice needs AI, which is off on this server" : "Voice works once you are signed in") : label} disabled={off || busy} active={speech.listening} aria-pressed={speech.listening}
      onClick={() => { if (!speech.supported) setEditing((v) => !v); else if (speech.listening) speech.stop(); else speech.start(); }}>
      {busy ? <Loader2 size={15} aria-hidden className="animate-spin" /> : speech.listening ? <Square size={13} aria-hidden fill="currentColor" /> : <Mic size={15} aria-hidden />}
      {speech.listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-danger/40" />}
    </AiIconButton>
  );

  // Resolving an open question updates the form and removes the question.
  const update = (fn: (f: VoiceFill) => VoiceFill, patch: VoicePatch) => { onFill(patch); setOpen((f) => (f ? fn(f) : f)); };
  const addPerson = (name: string, asPayer: boolean) => {
    const r = addParticipant(name);
    if (!r.id) { setError(r.error ?? "Could not add that person."); return; }
    update((f) => ({ ...f, unknownPeople: asPayer ? f.unknownPeople : f.unknownPeople.filter((n) => n !== name), unknownPayer: asPayer ? undefined : f.unknownPayer }), { addWithIds: [r.id], ...(asPayer ? { payerId: r.id } : {}) });
  };
  const pending = !!open && (open.unknownPeople.length > 0 || open.ambiguousPeople.length > 0 || open.accountOptions.length > 0 || !!open.unknownPayer || open.warnings.length > 0);
  // When the microphone cannot be used, the typing box opens by itself (the phone keyboard's microphone key works there too).
  const speechError = open ? null : speech.error; // an old microphone problem is not shown once the form has been filled
  const showType = editing || !!speechError;
  const idle = !speech.listening && !busy && !error && !speechError && !text && !pending && !showType;

  const panel = idle ? null : (
    <div className="mt-3 space-y-2 border-t border-accent/15 pt-3 text-sm">
      {speech.listening && <p role="status" className="text-sm"><span className="text-xs text-muted">Listening… tap the microphone to stop.</span><br />{speech.live || <span className="text-muted">{EXAMPLE}</span>}</p>}
      {busy && <p role="status" className="text-xs text-muted">Understanding what you said…</p>}
      {!speech.listening && !busy && text && !showType && (
        <p className="flex items-start gap-2 text-xs text-muted"><span className="min-w-0 flex-1" title={text}>You said: “{text}”</span><button type="button" onClick={() => setEditing(true)} className="shrink-0 text-accent hover:underline">Edit</button></p>
      )}
      {showType && (
        <div className="space-y-2">
          <textarea aria-label="Describe the expense" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={`${EXAMPLE}${speech.supported ? "" : " (use your keyboard's microphone to speak)"}`}
            className="min-h-16 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent" />
          <Button type="button" variant="primary" disabled={busy || text.trim().length < 3} onClick={() => void run(text)}>Fill the form</Button>
        </div>
      )}
      {(speechError || error) && <p role="alert" className="text-xs text-danger">{speechError ?? error}</p>}
      {pending && open && (
        <div className="space-y-2">
          {open.warnings.map((w) => <p key={w} role="status" className="text-xs text-warn">{w}</p>)}
          {open.accountOptions.length > 0 && (
            <div><p className="text-xs text-muted">Which card did you mean?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{open.accountOptions.map((a) => <button key={a.id} type="button" onClick={() => update((f) => ({ ...f, accountOptions: [] }), { accountId: a.id })} className="min-h-9 rounded-full border border-border bg-surface px-3 text-sm hover:bg-background">{a.name}</button>)}</div></div>
          )}
          {open.unknownPeople.map((n) => (
            <div key={n} className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{n} is not in your contacts.</span>
              <button type="button" onClick={() => addPerson(n, false)} className="min-h-9 rounded-full bg-accent px-3 text-sm font-medium text-white">Add {n}</button>
              <button type="button" onClick={() => update((f) => ({ ...f, unknownPeople: f.unknownPeople.filter((x) => x !== n) }), {})} className="min-h-9 rounded-full px-2 text-xs text-muted hover:underline">Leave out</button></div>
          ))}
          {open.unknownPayer && (
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{open.unknownPayer} paid, but is not in your contacts.</span>
              <button type="button" onClick={() => addPerson(open.unknownPayer!, true)} className="min-h-9 rounded-full bg-accent px-3 text-sm font-medium text-white">Add {open.unknownPayer}</button></div>
          )}
          {open.ambiguousPeople.map((q) => (
            <div key={q.spoken}><p className="text-xs text-muted">Which {q.spoken}?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{q.options.map((o) => <button key={o.id} type="button" onClick={() => update((f) => ({ ...f, ambiguousPeople: f.ambiguousPeople.filter((x) => x.spoken !== q.spoken) }), { addWithIds: [o.id] })} className="min-h-9 rounded-full border border-border bg-surface px-3 text-sm hover:bg-background">{nameOf(o.id)}</button>)}</div></div>
          ))}
        </div>
      )}
    </div>
  );
  return { mic, panel };
}
