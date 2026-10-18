import { describe, expect, it } from "vitest";
import { isAfterMonth, monthLabel, shiftMonth } from "./months";

describe("months", () => {
  it("shifts across year boundaries in both directions", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", -15)).toBe("2024-12");
    expect(shiftMonth("2026-03", 0)).toBe("2026-03");
  });
  it("labels months", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2027-01")).toBe("Jan 2027");
  });
  it("knows whether a month is in the future", () => {
    expect(isAfterMonth("2026-11", "2026-10-19")).toBe(true);
    expect(isAfterMonth("2026-10", "2026-10-31")).toBe(false);
    expect(isAfterMonth("2026-09", "2026-10-01")).toBe(false);
  });
});
