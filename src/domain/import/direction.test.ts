import { describe, expect, it } from "vitest";
import { directionWarning } from "./direction";

const rows = (...d: ("debit" | "credit")[]) => d.map((direction) => ({ direction }));
describe("direction sanity check for guessed readings", () => {
  it("warns when every row of a card statement is money in", () => {
    expect(directionWarning(rows("credit", "credit", "credit"), { type: "credit_card" })).toContain("Every one of the 3 rows");
  });
  it("stays quiet otherwise", () => {
    expect(directionWarning(rows("credit", "debit", "credit"), { type: "credit_card" })).toBeNull();
    expect(directionWarning(rows("credit", "credit"), { type: "credit_card" })).toBeNull(); // too few to say
    expect(directionWarning(rows("credit", "credit", "credit"), { type: "bank" })).toBeNull();
    expect(directionWarning(rows("credit", "credit", "credit"), undefined)).toBeNull();
  });
});
