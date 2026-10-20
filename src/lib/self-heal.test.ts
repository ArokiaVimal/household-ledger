import { describe, expect, it } from "vitest";
import { CHECK_VERSION_AFTER_MS, STALE_AFTER_MS, internalTarget, resumeAction } from "./self-heal";

describe("internalTarget", () => {
  const origin = "https://app.example.com";
  it("returns the path and query of a link to another page on this site", () => {
    expect(internalTarget("/transactions?v=unverified", origin, "/")).toBe("/transactions?v=unverified");
    expect(internalTarget("https://app.example.com/people", origin, "/")).toBe("/people");
  });
  it("leaves alone other sites, new tabs, downloads, modified clicks and the page you are already on", () => {
    expect(internalTarget("https://other.com/x", origin, "/")).toBeNull();
    expect(internalTarget("/x", origin, "/", { target: "_blank" })).toBeNull();
    expect(internalTarget("/x", origin, "/", { download: true })).toBeNull();
    expect(internalTarget("/x", origin, "/", { modifier: true })).toBeNull();
    expect(internalTarget("/people", origin, "/people")).toBeNull();
    expect(internalTarget("#top", origin, "/people")).toBeNull();
    expect(internalTarget(null, origin, "/")).toBeNull();
  });
});

describe("resumeAction", () => {
  it("does nothing for a short break, and never while a form is open", () => {
    expect(resumeAction(30_000, { formOpen: false })).toBe("none");
    expect(resumeAction(STALE_AFTER_MS * 2, { formOpen: true })).toBe("none");
  });
  it("checks the version after a few minutes, reloads when it is newer, and always after a long break", () => {
    expect(resumeAction(CHECK_VERSION_AFTER_MS, { formOpen: false })).toBe("check_version");
    expect(resumeAction(CHECK_VERSION_AFTER_MS, { formOpen: false, versionDiffers: true })).toBe("reload");
    expect(resumeAction(STALE_AFTER_MS, { formOpen: false })).toBe("reload");
  });
});
