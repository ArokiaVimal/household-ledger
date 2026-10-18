// Pure household rules: no I/O, so they are easy to test and review.
import type { Invite, Role } from "./types";

export const MAX_MEMBERS = 4;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// No 0/O/1/I/L: codes get read aloud and typed from a phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 10 characters from a 31-letter alphabet (~49 bits) shown as XXXXX-XXXXX. `bytes` must come from a CSPRNG. */
export function formatInviteCode(bytes: Uint8Array): string {
  if (bytes.length < 10) throw new Error("need 10 random bytes");
  // 256 is not a multiple of 31, so reject the top slice to avoid modulo bias.
  const chars: string[] = [];
  for (const b of bytes) if (b < 248 && chars.length < 10) chars.push(ALPHABET[b % 31]);
  if (chars.length < 10) throw new Error("not enough unbiased bytes; retry with more");
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

export const normalizeInviteCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isPlausibleInviteCode = (input: string) => new RegExp(`^[${ALPHABET}]{10}$`).test(normalizeInviteCode(input));

export type InviteCheck = { ok: true } | { ok: false; reason: "missing" | "used" | "expired" | "wrong_email" };

export function checkInvite(invite: Invite | null, who: { email: string }, nowMs: number): InviteCheck {
  if (!invite) return { ok: false, reason: "missing" };
  if (invite.usedAt) return { ok: false, reason: "used" };
  if (Date.parse(invite.expiresAt) <= nowMs) return { ok: false, reason: "expired" };
  if (invite.email.trim().toLowerCase() !== who.email.trim().toLowerCase()) return { ok: false, reason: "wrong_email" };
  return { ok: true };
}

export const canManageMembers = (role: Role) => role === "owner";
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
