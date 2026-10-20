/** Undoes one import: removes the transactions it added (the server refuses if any were settled) and marks the import as undone. */
export async function undoImport(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "batch.rollback", id }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "Could not undo that import." };
  } catch {
    return { ok: false, error: "Network problem. Try again." };
  }
}
