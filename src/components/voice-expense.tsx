"use client";
import { Loader2, Mic, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/lib/speech";
import { useStore } from "@/data/store";
import { resolveVoice, type VoiceFacts, type VoiceFill } from "@/domain/voice-expense";
import { AiBadge, Button } from "./ui";

/** What the Add form applies: the first answer from Claude, or one more detail the person chose (a card, an added friend). */
export type VoicePatch = Partial<Omit<VoiceFill, "withIds">> & { withIds?: string[]; addWithIds?: string[] };

const EXAMPLE = "Lunch with Varru and Meera at A2B for 365, split by 3, paid with Amex";

/**
 * "Speak your expense" for the Add form. The browser turns the voice into text, Claude pulls the expense out of it (an AI step,
 * labelled), and the form is filled in for review. Names that are not contacts and cards that match more than one are asked about,
 * never guessed. Nothing is saved from here.
 */
export function VoiceExpense({ onFill }: { onFill: (p: VoicePatch) => void }) {
  const { aiEnabled, live, participants, meId, accounts, categories, addParticipant, nameOf } = useStore();
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<VoiceFill | null>(null);

  const run = async (spoken: string) => {
    const t = spoken.trim();
    if (t.length < 3) return;
    setBusy(true); setError(null); setOpen(null);
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
  const ready = !off && !busy;

  // Resolving an open question updates the form and removes the question.
  const update = (fn: (f: VoiceFill) => VoiceFill, patch: VoicePatch) => { onFill(patch); setOpen((f) => (f ? fn(f) : f)); };
  const addPerson = (name: string, asPayer: boolean) => {
    const r = addParticipant(name);
    if (!r.id) { setError(r.error ?? "Could not add that person."); return; }
    update((f) => ({ ...f, unknownPeople: asPayer ? f.unknownPeople : f.unknownPeople.filter((n) => n !== name), unknownPayer: asPayer ? undefined : f.unknownPayer }), { addWithIds: [r.id], ...(asPayer ? { payerId: r.id } : {}) });
  };
  const pending = open && (open.unknownPeople.length > 0 || open.ambiguousPeople.length > 0 || open.accountOptions.length > 0 || !!open.unknownPayer || open.warnings.length > 0);

  return (
    <div className="rounded-2xl border border-dashed border-accent/40 bg-accent/5 p-3">
      <div className="flex items-center gap-3">
        <button type="button" disabled={!speech.supported || off || busy} onClick={() => (speech.listening ? speech.stop() : speech.start())}
          aria-label={speech.listening ? "Stop and fill the form" : "Speak your expense"} aria-pressed={speech.listening}
          className={cn("relative grid size-11 shrink-0 place-items-center rounded-full text-white shadow-sm transition-colors disabled:opacity-40", speech.listening ? "bg-danger" : "bg-accent hover:bg-accent/90")}>
          {busy ? <Loader2 size={18} aria-hidden className="animate-spin" /> : speech.listening ? <Square size={16} aria-hidden fill="currentColor" /> : <Mic size={18} aria-hidden />}
          {speech.listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-danger/40" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{busy ? "Understanding…" : speech.listening ? "Listening… tap to stop" : "Speak your expense"}</span><AiBadge /></div>
          <p className="truncate text-xs text-muted">{speech.listening ? (speech.live || "Say what you spent, with whom and how you paid") : off ? (live ? "AI is off on this server." : "Voice works with your real account, once you are signed in.") : `Try: “${EXAMPLE}”`}</p>
        </div>
        {ready && <button type="button" onClick={() => setTyping((v) => !v)} className="shrink-0 rounded-full px-2.5 text-xs text-accent hover:underline">{typing ? "Hide" : "Type it"}</button>}
      </div>

      {(typing || (!speech.supported && !off)) && (
        <div className="mt-2 space-y-2">
          <textarea aria-label="Describe the expense" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.supported ? EXAMPLE : `${EXAMPLE} (use your keyboard's microphone to speak)`}
            className="min-h-16 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent" />
          <Button type="button" variant="primary" disabled={!ready || text.trim().length < 3} onClick={() => void run(text)}>Fill the form</Button>
        </div>
      )}
      {!typing && !speech.listening && text && !busy && <p className="mt-2 truncate text-xs text-muted" title={text}>You said: “{text}”</p>}
      {(speech.error || error) && <p role="alert" className="mt-2 text-xs text-danger">{speech.error ?? error}</p>}

      {pending && open && (
        <div className="mt-3 space-y-2 border-t border-accent/20 pt-3 text-sm">
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
}
