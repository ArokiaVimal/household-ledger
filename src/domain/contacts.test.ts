import { describe, expect, it } from "vitest";
import { checkContact, matchAccount, normalizeEmail, relationshipText } from "./contacts";
import type { Participant } from "./types";

const p = (id: string, name: string, extra: Partial<Participant> = {}): Participant => ({ id, name, userId: null, ...extra });

describe("friends and family contacts", () => {
  const contacts = [p("a", "Karthik", { email: "karthik@example.com" }), p("b", "Amma", { relationship: "parent" })];
  it("needs a name, a sensible email and a clear relationship, and rejects duplicates", () => {
    expect(checkContact({ name: "  ", relationship: "friend" }, contacts)).toMatch(/name/i);
    expect(checkContact({ name: "karthik", relationship: "friend" }, contacts)).toMatch(/already exists/);
    expect(checkContact({ name: "Raj", email: "nope", relationship: "friend" }, contacts)).toMatch(/valid email/);
    expect(checkContact({ name: "Raj", email: " KARTHIK@example.com ", relationship: "friend" }, contacts)).toMatch(/Karthik already has/);
    expect(checkContact({ name: "Raj", relationship: "custom" }, contacts)).toMatch(/relationship/);
    expect(checkContact({ name: "Raj", email: "", relationship: "custom", relationshipLabel: "Flatmate" }, contacts)).toBeNull();
    expect(checkContact({ name: "Raj", relationship: "friend" }, contacts)).toBeNull();
  });
  it("shows custom wording and standard names", () => {
    expect(relationshipText({ relationship: "custom", relationshipLabel: "Flatmate" })).toBe("Flatmate");
    expect(relationshipText({ relationship: "parent" })).toBe("Parent");
    expect(relationshipText({})).toBe("Friend");
  });
  it("links only from a verified email, to one unlinked contact", () => {
    expect(matchAccount(contacts, { email: "karthik@example.com", emailVerified: false })).toEqual({ status: "unverified" });
    expect(matchAccount(contacts, { email: null, emailVerified: true })).toEqual({ status: "unverified" });
    expect(matchAccount(contacts, { email: "nobody@example.com", emailVerified: true })).toEqual({ status: "none" });
    expect(matchAccount(contacts, { email: " Karthik@Example.com", emailVerified: true })).toMatchObject({ status: "unique", contact: { id: "a" } });
  });
  it("never offers an already linked or invited contact, and flags conflicts", () => {
    const linked = [p("a", "Karthik", { email: "k@x.com", userId: "u1" }), p("c", "K2", { email: "k@x.com", pendingEmail: "k@x.com" })];
    expect(matchAccount(linked, { email: "k@x.com", emailVerified: true })).toEqual({ status: "none" });
    const dup = [p("a", "K1", { email: "k@x.com" }), p("b", "K2", { email: "k@x.com" })];
    expect(matchAccount(dup, { email: "k@x.com", emailVerified: true })).toMatchObject({ status: "conflict" });
    expect(normalizeEmail(" A@B.com ")).toBe("a@b.com");
  });
});
