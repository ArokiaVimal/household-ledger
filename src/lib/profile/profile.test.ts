import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES, ProfileInputSchema, defaultDisplayName, firstName, greetingName, initials, validateAvatarDataUrl } from "./profile";

// "/9j/" is base64 for FF D8 FF, the JPEG signature.
const jpeg = (body = "AAAA") => `data:image/jpeg;base64,/9j/${body}`;

describe("avatar validation", () => {
  it("accepts a small real-looking JPEG", () => expect(validateAvatarDataUrl(jpeg())).toBeNull());
  it("rejects other types, including SVG and PNG", () => {
    expect(validateAvatarDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).not.toBeNull();
    expect(validateAvatarDataUrl("data:image/png;base64,iVBORw0KGgo=")).not.toBeNull();
    expect(validateAvatarDataUrl("https://evil.example/x.jpg")).not.toBeNull();
  });
  it("rejects a JPEG label with non-JPEG bytes", () => expect(validateAvatarDataUrl("data:image/jpeg;base64,PHN2Zz48L3N2Zz4=")).toMatch(/not a JPEG/));
  it("rejects junk characters and oversize", () => {
    expect(validateAvatarDataUrl("data:image/jpeg;base64,/9j/<script>")).not.toBeNull();
    expect(validateAvatarDataUrl(jpeg("A".repeat(Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 8)))).toMatch(/too large/);
  });
});

describe("profile input", () => {
  const ok = { displayName: "  Vimal Arokia ", nickname: "Vimal", phone: "+91 98765 43210" };
  it("trims and accepts valid input", () => expect(ProfileInputSchema.parse(ok).displayName).toBe("Vimal Arokia"));
  it("allows empty phone, rejects bad phone and empty name", () => {
    expect(ProfileInputSchema.safeParse({ ...ok, phone: "" }).success).toBe(true);
    expect(ProfileInputSchema.safeParse({ ...ok, phone: "abc" }).success).toBe(false);
    expect(ProfileInputSchema.safeParse({ ...ok, displayName: "   " }).success).toBe(false);
  });
});

describe("name helpers", () => {
  it("first name, initials, defaults", () => {
    expect(firstName("Vimal Arokia")).toBe("Vimal");
    expect(firstName("   ")).toBe("there");
    expect(greetingName({ nickname: " Vimal ", displayName: "Arokia Vimal" })).toBe("Vimal");
    expect(greetingName({ nickname: "", displayName: "Arokia Vimal" })).toBe("Arokia");
    expect(initials("Vimal Arokia")).toBe("VA");
    expect(initials("", "arokia.vimal@x.com")).toBe("AR");
    expect(defaultDisplayName(null, "arokia.vimal@zohocorp.com")).toBe("Arokia Vimal");
    expect(defaultDisplayName("  Given Name ", "a@b.c")).toBe("Given Name");
  });
});
