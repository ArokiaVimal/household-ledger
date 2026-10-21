// A phone can stop the app in the middle of an import (switching apps, locking the screen, low memory). The page then starts again
// with no memory of it. This leaves a small note on the device while an import is running and removes it when the import finishes,
// so a note that is still there on the next start means "this one was interrupted: check Earlier imports before trying again".

const KEY = "pf-import-running";
export interface ImportMarker { at: number; name: string; phase: "read" | "save" }

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function markImportStart(name: string, phase: ImportMarker["phase"], store: Store | null = local(), now = Date.now()) {
  try { store?.setItem(KEY, JSON.stringify({ at: now, name: name.slice(0, 80), phase } satisfies ImportMarker)); } catch { /* storage unavailable */ }
}
export function clearImportMarker(store: Store | null = local()) {
  try { store?.removeItem(KEY); } catch { /* storage unavailable */ }
}
/** The note left by an import that never finished, or null. A very fresh note belongs to an import still running, so it is ignored. */
export function interruptedImport(store: Store | null = local(), now = Date.now()): ImportMarker | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<ImportMarker>;
    if (typeof m.at !== "number" || typeof m.name !== "string" || (m.phase !== "read" && m.phase !== "save")) return null;
    return now - m.at < 15_000 ? null : { at: m.at, name: m.name, phase: m.phase };
  } catch { return null; }
}
