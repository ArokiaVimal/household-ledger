import { describe, expect, it } from "vitest";
import { addDays, daysInMonth, isIsoDate, monthGrid, monthName, monthTitle } from "./calendar";

describe("calendar", () => {
  it("names months", () => { expect(monthTitle("2026-09")).toBe("September 2026"); expect(monthName("2026-12")).toBe("December"); });
  it("knows how long a month is, including leap years", () => {
    expect([daysInMonth("2026-09"), daysInMonth("2026-10"), daysInMonth("2026-02"), daysInMonth("2028-02")]).toEqual([30, 31, 28, 29]);
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-24", -1)).toBe("2026-09-23");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("accepts only real dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
  it("lays out September 2026 (starts on a Tuesday) as Sunday-first weeks", () => {
    const g = monthGrid("2026-09");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(g[g.length - 1].filter(Boolean).pop()).toBe("2026-09-30");
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });
  it("starts on the first column when the 1st is a Sunday (February 2026)", () => {
    expect(monthGrid("2026-02")[0][0]).toBe("2026-02-01");
    expect(monthGrid("2026-02")).toHaveLength(4);
  });
});
