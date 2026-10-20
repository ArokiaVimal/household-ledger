// Shared (client + server) profile rules. No framework or Firebase imports.
import { z } from "zod";

export const MAX_AVATAR_BYTES = 100_000;
const JPEG_PREFIX = "data:image/jpeg;base64,";

export const ProfileInputSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  /** Short name used in the greeting. Falls back to the first word of the display name. */
  nickname: z.string().trim().max(30, "Keep it under 30 characters"),
  phone: z.string().trim().max(20).regex(/^(\+?[0-9][0-9 -]{5,18})?$/, "Enter a valid phone number or leave it empty"),
  defaultView: z.enum(["household", "personal"]),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export interface Profile extends ProfileInput {
  email: string;
  /** Small square JPEG chosen by the user, stored in the profile. Null = none. */
  avatarDataUrl: string | null;
  /** Photo from the sign-in provider (Google). Used only when there is no custom avatar. */
  providerPhotoUrl: string | null;
  /** Recurring suggestions you answered "not recurring" to. Saved on the account, so every device agrees. */
  dismissedRecurring: string[];
  /** What you call your linked partner. Their own name stays theirs; this is only how it shows to you. */
  partnerNickname?: string;
}

/**
 * Accepts only a base64 JPEG within the size cap whose bytes really start like a JPEG.
 * JPEG-only on purpose: SVG or HTML smuggled into an <img> data URL is a classic XSS route.
 */
export function validateAvatarDataUrl(value: string): string | null {
  if (!value.startsWith(JPEG_PREFIX)) return "The photo must be a JPEG";
  const b64 = value.slice(JPEG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return "The photo data is not valid";
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_AVATAR_BYTES) return "The photo is too large";
  let head: string;
  try { head = atob(b64.slice(0, 8)); } catch { return "The photo data is not valid"; }
  if (head.charCodeAt(0) !== 0xff || head.charCodeAt(1) !== 0xd8 || head.charCodeAt(2) !== 0xff) return "That is not a JPEG image";
  return null;
}

export const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || "there";
export const greetingName = (p: { nickname: string; displayName: string }) => p.nickname.trim() || firstName(p.displayName);

export function initials(displayName: string, email = ""): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? email).slice(0, 2);
  return s.toUpperCase();
}

/** Default name for a first-time user: provider name, else the part of the email before @. */
export function defaultDisplayName(providerName: string | null | undefined, email: string): string {
  const n = providerName?.trim();
  if (n) return n.slice(0, 60);
  const local = email.split("@")[0] ?? "";
  return (local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Me").slice(0, 60);
}
