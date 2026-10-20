import { describe, expect, it } from "vitest";
import { verifyProgress } from "./progress";

const r = (date: string, status: "reviewed" | "unreviewed") => ({ date, status });
describe("verifyProgress", () => {
  it("counts only the month asked for", () => {
    const p = verifyProgress([r("2026-09-01", "reviewed"), r("2026-09-05", "unreviewed"), r("2026-09-09", "reviewed"), r("2026-10-01", "unreviewed")], "2026-09");
    expect(p).toEqual({ verified: 2, total: 3, left: 1, pct: 66 });
  });
  it("never shows 100% while something is left, and is 100% for an empty month", () => {
    expect(verifyProgress([...Array(199).fill(r("2026-09-01", "reviewed")), r("2026-09-02", "unreviewed")], "2026-09").pct).toBe(99);
    expect(verifyProgress([], "2026-09")).toEqual({ verified: 0, total: 0, left: 0, pct: 100 });
  });
});
