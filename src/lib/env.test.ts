import { describe, expect, it } from "vitest";
import { EnvError, parseClientEnv, parseServerEnv } from "./env";

const client = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "k", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "a.firebaseapp.com", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "b", NEXT_PUBLIC_FIREBASE_APP_ID: "id",
};
const server = { FIREBASE_ADMIN_PROJECT_ID: "p", FIREBASE_ADMIN_CLIENT_EMAIL: "sa@p.iam.gserviceaccount.com", ALLOWED_EMAILS: "me@example.com,spouse@example.com", FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" };

describe("env validation", () => {
  it("accepts complete config", () => {
    expect(parseClientEnv(client).NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe("p");
    const s = parseServerEnv(server);
    expect(s.APP_ENV).toBe("development");
    expect(s.FIREBASE_ADMIN_PRIVATE_KEY).toContain("\n");
  });
  it("accepts a private key pasted with its surrounding quotes and literal \\n sequences", () => {
    const quoted = parseServerEnv({ ...server, FIREBASE_ADMIN_PRIVATE_KEY: `"${server.FIREBASE_ADMIN_PRIVATE_KEY}"` });
    expect(quoted.FIREBASE_ADMIN_PRIVATE_KEY.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);
    expect(quoted.FIREBASE_ADMIN_PRIVATE_KEY.endsWith('"')).toBe(false);
  });
  it("names every missing variable and never echoes values", () => {
    try { parseClientEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: "secret-value" }); throw new Error("should fail"); } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const m = (e as Error).message;
      expect(m).toContain("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
      expect(m).toContain("NEXT_PUBLIC_FIREBASE_APP_ID");
      expect(m).not.toContain("secret-value");
    }
  });
  it("rejects a malformed private key and bad APP_ENV", () => {
    expect(() => parseServerEnv({ ...server, FIREBASE_ADMIN_PRIVATE_KEY: "nope" })).toThrow(EnvError);
    expect(() => parseServerEnv({ ...server, APP_ENV: "staging" })).toThrow(EnvError);
  });
});
