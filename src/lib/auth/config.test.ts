import { describe, expect, it } from "vitest";
import { EnvError } from "@/lib/env";
import { getAuthMode, isAllowedEmail, isRecentSignIn, isSameOrigin } from "./config";

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "k", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "a", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "b", NEXT_PUBLIC_FIREBASE_APP_ID: "i",
  FIREBASE_ADMIN_PROJECT_ID: "p", FIREBASE_ADMIN_CLIENT_EMAIL: "sa@p.iam.gserviceaccount.com", FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----", ALLOWED_EMAILS: "a@x.com",
};

describe("auth mode", () => {
  it("off with no config outside production", () => expect(getAuthMode({})).toBe("off"));
  it("fails closed in production without config", () => expect(() => getAuthMode({ APP_ENV: "production" })).toThrow(EnvError));
  it("on when fully configured", () => expect(getAuthMode(full)).toBe("on"));
  it("partial config is an error, not silently off", () => {
    expect(() => getAuthMode({ NEXT_PUBLIC_FIREBASE_API_KEY: "k" })).toThrow(EnvError);
    expect(() => getAuthMode({ ...full, ALLOWED_EMAILS: undefined })).toThrow(EnvError);
  });
});

describe("auth helpers", () => {
  it("allowlist is case-insensitive and rejects empty", () => {
    expect(isAllowedEmail("Me@Example.com", " me@example.com , other@x.com")).toBe(true);
    expect(isAllowedEmail("evil@x.com", "me@example.com")).toBe(false);
    expect(isAllowedEmail(undefined, "me@example.com")).toBe(false);
  });
  it("same-origin check", () => {
    expect(isSameOrigin("https://app.example.com", "app.example.com")).toBe(true);
    expect(isSameOrigin("https://evil.com", "app.example.com")).toBe(false);
    expect(isSameOrigin(null, "app.example.com")).toBe(false);
    expect(isSameOrigin("not a url", "app.example.com")).toBe(false);
  });
  it("recent sign-in window", () => {
    const now = 1_000_000_000_000;
    expect(isRecentSignIn(now / 1000 - 60, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 - 3600, now)).toBe(false);
  });
});
