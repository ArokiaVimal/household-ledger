"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// The browser's own speech recognition (Chrome, Edge, Safari). The audio is handled by the browser vendor's speech service; the app never
// receives or stores any audio, only the text. Where it is missing (some phones' home-screen apps), `supported` is false and the voice
// panel falls back to typing or the keyboard's microphone key.
interface RecognitionEvent { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;
const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** What a speech error means to a person, in one line. `aborted` (we stopped it ourselves) says nothing. */
export function speechErrorText(code: string): string | null {
  switch (code) {
    case "aborted": return null;
    case "not-allowed": case "service-not-allowed": return "The microphone is blocked. Allow it for this site in your browser settings, or type it below.";
    case "no-speech": return "I did not hear anything. Tap the microphone and try again.";
    case "audio-capture": return "No microphone was found.";
    case "network": return "Speech recognition needs an internet connection.";
    case "language-not-supported": return "That language is not supported by this browser.";
    default: return "Could not listen. Type it below instead.";
  }
}

/** Listens until stopped (or the browser ends it) and keeps the words so far. `onEnd` gets the final text once. */
export function useSpeech(lang: string, onEnd: (text: string) => void) {
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const endRef = useRef(onEnd);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { endRef.current = onEnd; }, [onEnd]);
  useEffect(() => { const t = setTimeout(() => setSupported(!!ctor()), 0); return () => { clearTimeout(t); rec.current?.abort(); }; }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
    finalText.current = ""; setLive(""); setError(null);
    const r = new C();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText.current = `${finalText.current} ${piece}`.trim(); else interim += piece;
      }
      setLive(`${finalText.current} ${interim}`.trim());
    };
    r.onerror = (e) => setError(speechErrorText(e.error));
    r.onend = () => { rec.current = null; setListening(false); const text = finalText.current.trim() || ""; endRef.current(text); };
    rec.current = r;
    try { r.start(); setListening(true); } catch { rec.current = null; setError("Could not start the microphone."); }
  }, [lang]);
  const stop = useCallback(() => { rec.current?.stop(); }, []);
  return { supported, listening, live, error, start, stop, clearError: () => setError(null) };
}
