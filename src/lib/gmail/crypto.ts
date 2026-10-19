// Keeps the Gmail refresh token unreadable at rest (AES-256-GCM, key from GMAIL_TOKEN_KEY) and signs the OAuth `state` so a
// callback can only complete the connection that this person started.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class CryptoConfigError extends Error {}

/** A 32-byte key from a base64 string (generate one with `openssl rand -base64 32`). */
export function keyFrom(b64: string | undefined): Buffer {
  const key = Buffer.from((b64 ?? "").trim(), "base64");
  if (key.length !== 32) throw new CryptoConfigError("GMAIL_TOKEN_KEY must be 32 random bytes in base64 (openssl rand -base64 32).");
  return key;
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string, key: Buffer): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !enc) throw new Error("Bad token blob");
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** `uid.expiry.signature`: valid for ten minutes, bound to the signed-in person. */
export function signState(uid: string, key: Buffer, now: number, ttlMs = 10 * 60_000): string {
  const body = `${Buffer.from(uid).toString("base64url")}.${now + ttlMs}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

export function verifyState(state: string, uid: string, key: Buffer, now: number): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const body = `${parts[0]}.${parts[1]}`;
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(parts[2], "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  return Buffer.from(parts[0], "base64url").toString() === uid && Number(parts[1]) > now;
}
