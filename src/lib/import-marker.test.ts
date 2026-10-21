import { describe, expect, it } from "vitest";
import { clearImportMarker, interruptedImport, markImportStart } from "./import-marker";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe("interrupted import note", () => {
  it("is empty until an import starts, ignores one still running, and reports one that never finished", () => {
    const s = memory();
    expect(interruptedImport(s, 1_000_000)).toBeNull();
    markImportStart("Statement.pdf", "save", s, 1_000_000);
    expect(interruptedImport(s, 1_005_000)).toBeNull(); // 5 seconds in: still running
    expect(interruptedImport(s, 1_060_000)).toEqual({ at: 1_000_000, name: "Statement.pdf", phase: "save" });
  });
  it("disappears when the import finishes, and survives broken storage", () => {
    const s = memory();
    markImportStart("a.pdf", "read", s, 0);
    clearImportMarker(s);
    expect(interruptedImport(s, 999_999)).toBeNull();
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(() => markImportStart("a", "read", broken)).not.toThrow();
    expect(interruptedImport(broken)).toBeNull();
    s.setItem("pf-import-running", "not json");
    expect(interruptedImport(s)).toBeNull();
  });
});
