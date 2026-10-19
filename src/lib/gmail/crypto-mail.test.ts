import { describe, expect, it } from "vitest";
import { decrypt, encrypt, keyFrom, signState, verifyState } from "./crypto";
import { buildQuery, extractText, header, htmlToText, messageText, senderAllowed } from "./mail";

const key = keyFrom(Buffer.alloc(32, 7).toString("base64"));

describe("crypto", () => {
  it("round-trips a token, differently each time, and fails on tampering or a wrong key", () => {
    const a = encrypt("1//refresh-token", key), b = encrypt("1//refresh-token", key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe("1//refresh-token");
    expect(() => decrypt(a.slice(0, -2) + "xx", key)).toThrow();
    expect(() => decrypt(a, keyFrom(Buffer.alloc(32, 9).toString("base64")))).toThrow();
  });
  it("refuses a missing or short key", () => {
    expect(() => keyFrom(undefined)).toThrow(/32 random bytes/);
    expect(() => keyFrom("c2hvcnQ=")).toThrow();
  });
  it("state is bound to the person and expires", () => {
    const s = signState("u1", key, 1000);
    expect(verifyState(s, "u1", key, 2000)).toBe(true);
    expect(verifyState(s, "u2", key, 2000)).toBe(false);
    expect(verifyState(s, "u1", key, 1000 + 11 * 60_000)).toBe(false);
    expect(verifyState(s.slice(0, -3) + "abc", "u1", key, 2000)).toBe(false);
    expect(verifyState("junk", "u1", key, 2000)).toBe(false);
  });
});

describe("mail helpers", () => {
  it("only bank domains are allowed, including sub-domains, never look-alikes", () => {
    expect(senderAllowed("HDFC Bank <alerts@hdfcbank.net>")).toBe(true);
    expect(senderAllowed("noreply@email.americanexpress.com")).toBe(true);
    expect(senderAllowed("alerts@hdfcbank.net.evil.com")).toBe(false);
    expect(senderAllowed("alerts@nothdfcbank.net")).toBe(false);
    expect(senderAllowed("friend@gmail.com")).toBe(false);
  });
  it("builds a search limited to bank senders after a time", () => {
    const q = buildQuery(1_760_000_000.9);
    expect(q.startsWith("after:1760000000 (from:hdfcbank.net")).toBe(true);
    expect(q).not.toMatch(/gmail\.com/);
  });
  it("prefers plain text, falls back to HTML turned into text, and reads nested parts", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    expect(extractText({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("Rs 450 debited") } }, { mimeType: "text/html", body: { data: b64("<p>HTML</p>") } }] })).toBe("Rs 450 debited");
    expect(extractText({ mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<div>Rs&nbsp;450.00 <b>debited</b></div><script>x()</script>") } }] }] })).toBe("Rs 450.00 debited");
    expect(extractText(undefined)).toBe("");
  });
  it("reads headers and builds the text to parse without links", () => {
    expect(header({ headers: [{ name: "From", value: "a@b.com" }] }, "from")).toBe("a@b.com");
    expect(htmlToText("<p>A</p><p>B &amp; C</p>")).toBe("A\nB & C");
    expect(messageText("Txn alert", "Rs 99 debited. See https://bank.example/x?y=1 for more")).toBe("Txn alert. Rs 99 debited. See for more");
  });
});
