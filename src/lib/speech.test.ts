import { describe, expect, it } from "vitest";
import { speechErrorText } from "./speech";

describe("speechErrorText", () => {
  it("explains the common problems and stays quiet when we stopped it ourselves", () => {
    expect(speechErrorText("aborted")).toBeNull();
    expect(speechErrorText("not-allowed")).toMatch(/blocked/);
    expect(speechErrorText("no-speech")).toMatch(/did not hear/);
    expect(speechErrorText("network")).toMatch(/internet/);
    expect(speechErrorText("something-new")).toMatch(/type it/i);
  });
});
