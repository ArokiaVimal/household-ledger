import { describe, expect, it } from "vitest";
import { canManageMembers, checkInvite, formatInviteCode, isPlausibleInviteCode, normalizeInviteCode } from "./logic";
import type { Invite } from "./types";

const invite = (o: Partial<Invite> = {}): Invite => ({ hash: "h", householdId: "hh", email: "Wife@Example.com", createdBy: "u1", createdAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-10-08T00:00:00.000Z", ...o });
const now = Date.parse("2026-10-02T00:00:00.000Z");

describe("invite codes", () => {
  it("formats XXXXX-XXXXX from an unambiguous alphabet", () => {
    const code = formatInviteCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });
  it("skips biased bytes and never indexes out of range", () => {
    const code = formatInviteCode(new Uint8Array([255, 254, 250, 248, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });
  it("throws when too few usable bytes", () => {
    expect(() => formatInviteCode(new Uint8Array(5))).toThrow();
    expect(() => formatInviteCode(new Uint8Array(10).fill(255))).toThrow();
  });
  it("normalises user input", () => {
    expect(normalizeInviteCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(isPlausibleInviteCode("abcde-fghjk")).toBe(true);
    expect(isPlausibleInviteCode("abcde-0hjk1")).toBe(false);
    expect(isPlausibleInviteCode("short")).toBe(false);
  });
});

describe("invite check", () => {
  it("accepts a valid invite regardless of email case", () => expect(checkInvite(invite(), { email: "wife@example.com" }, now)).toEqual({ ok: true }));
  it("rejects missing, used, expired and wrong-email invites", () => {
    expect(checkInvite(null, { email: "a@b.c" }, now)).toEqual({ ok: false, reason: "missing" });
    expect(checkInvite(invite({ usedAt: "2026-10-01T10:00:00.000Z" }), { email: "wife@example.com" }, now)).toEqual({ ok: false, reason: "used" });
    expect(checkInvite(invite(), { email: "wife@example.com" }, Date.parse("2026-10-09T00:00:00.000Z"))).toEqual({ ok: false, reason: "expired" });
    expect(checkInvite(invite(), { email: "other@example.com" }, now)).toEqual({ ok: false, reason: "wrong_email" });
  });
});

describe("roles", () => {
  it("only owners manage members", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("member")).toBe(false);
  });
});
