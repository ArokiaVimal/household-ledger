import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/data/memory-repository";
import { DEFAULT_CATEGORIES } from "@/domain/defaults";
import type { CaptureDeps } from "@/lib/capture/service";
import { exchangeCode } from "./client";
import { encrypt, keyFrom } from "./crypto";
import { syncGmail } from "./sync";
import type { GmailLink } from "./store";

const key = keyFrom(Buffer.alloc(32, 3).toString("base64"));
const oauth = { clientId: "id", clientSecret: "secret", redirectUri: "https://app/api/gmail/callback" };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let n = 0;
const deps: CaptureDeps = { sha256: sha, now: () => Date.parse("2026-10-19T10:00:00Z"), newId: () => `id${++n}`, claude: null, today: "2026-10-19" };
const link = (): GmailLink => ({ uid: "u1", householdId: "h", email: "me@gmail.com", refreshTokenEnc: encrypt("refresh-1", key), defaultAccountId: "bank_hdfc", connectedAt: "2026-10-01T00:00:00Z" });
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mail = (id: string, from: string, subject: string, body: string) => ({ id, payload: { mimeType: "text/plain", body: { data: b64(body) }, headers: [{ name: "From", value: from }, { name: "Subject", value: subject }] } });

async function setup() {
  const repo = createMemoryRepository("h");
  for (const c of DEFAULT_CATEGORIES) await repo.categories.put(c);
  await repo.accounts.put({ id: "bank_hdfc", name: "HDFC Bank", type: "bank" });
  await repo.accounts.put({ id: "cc_icici", name: "ICICI Coral Credit Card", type: "credit_card" });
  return repo;
}
function fakeGoogle(messages: ReturnType<typeof mail>[], opts: { revoked?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) return opts.revoked ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) : new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
    if (String(url).includes("/messages?")) return new Response(JSON.stringify({ messages: messages.map((m) => ({ id: m.id })) }), { status: 200 });
    const id = decodeURIComponent(String(url).split("/messages/")[1].split("?")[0]);
    return new Response(JSON.stringify(messages.find((m) => m.id === id)), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("syncGmail", () => {
  const msgs = [
    mail("m1", "HDFC Bank <alerts@hdfcbank.net>", "Transaction alert", "Rs 450.00 debited from HDFC Bank a/c XX1234 on 19-10-26 to VPA swiggy@icici (UPI Ref 628811223344)."),
    mail("m2", "ICICI Bank <credit_cards@icicibank.com>", "Your statement", "ICICI Bank Credit Card XX4321: Total Amt Due Rs 41,250.00, Min Amt Due Rs 2,060.00, Due Date 05-Nov-26."),
    mail("m3", "Promo <offers@hdfcbank.net>", "Offer", "Get Rs 500 cashback when you spend Rs 5000. Apply now!"),
    mail("m4", "Scam <alerts@hdfcbank.net.evil.com>", "Alert", "Rs 99,999.00 debited from your account to EVIL"),
  ];
  it("reads bank mail into the review queue and the card bill, skips offers and look-alike senders", async () => {
    const repo = await setup();
    const { fetchImpl } = fakeGoogle(msgs);
    const { link: next, counts } = await syncGmail({ link: link(), key, oauth, repo, deps, participantId: "u_u1", fetchImpl, now: Date.parse("2026-10-19T10:00:00Z") });
    expect(counts).toMatchObject({ scanned: 3, added: 1, bills: 1, skipped: 2 });
    expect(await repo.records.list()).toMatchObject([{ status: "unreviewed", amountPaise: 45000 }]);
    expect(await repo.cardBills.list()).toMatchObject([{ totalDuePaise: 4125000, dueDate: "2026-11-05", accountId: "cc_icici" }]);
    expect(next.lastSyncAt).toBe("2026-10-19T10:00:00.000Z");
  });
  it("running it again adds nothing twice", async () => {
    const repo = await setup();
    const { fetchImpl } = fakeGoogle(msgs);
    const first = await syncGmail({ link: link(), key, oauth, repo, deps, participantId: "u_u1", fetchImpl, now: Date.parse("2026-10-19T10:00:00Z") });
    const again = await syncGmail({ link: first.link, key, oauth, repo, deps, participantId: "u_u1", fetchImpl, now: Date.parse("2026-10-19T12:00:00Z") });
    expect(again.counts).toMatchObject({ added: 0, bills: 0, duplicates: 2 });
    expect(await repo.records.list()).toHaveLength(1);
  });
  it("asks only for mail from bank senders, after the last sync", async () => {
    const repo = await setup();
    const { fetchImpl, calls } = fakeGoogle([]);
    await syncGmail({ link: { ...link(), lastSyncAt: "2026-10-19T00:00:00Z" }, key, oauth, repo, deps, participantId: "u_u1", fetchImpl, now: Date.parse("2026-10-19T10:00:00Z") });
    const q = decodeURIComponent(calls.find((c) => c.includes("/messages?"))!.replace(/\+/g, " "));
    expect(q).toMatch(/after:\d+ \(from:hdfcbank\.net/);
    expect(q).not.toMatch(/from:gmail\.com/);
  });
  it("marks the link for reconnecting when Google has revoked access, without throwing", async () => {
    const repo = await setup();
    const { link: next } = await syncGmail({ link: link(), key, oauth, repo, deps, participantId: "u_u1", fetchImpl: fakeGoogle([], { revoked: true }).fetchImpl, now: 0 });
    expect(next.needsReconnect).toBe(true);
  });
});

describe("exchangeCode", () => {
  it("returns the refresh token and the mailbox, and explains a missing refresh token", async () => {
    const f = (async (url: string) => String(url).includes("/token") ? new Response(JSON.stringify({ access_token: "at", refresh_token: "rt" }), { status: 200 }) : new Response(JSON.stringify({ emailAddress: "me@gmail.com" }), { status: 200 })) as typeof fetch;
    expect(await exchangeCode(oauth, "code", f)).toEqual({ refreshToken: "rt", email: "me@gmail.com" });
    const none = (async () => new Response(JSON.stringify({ access_token: "at" }), { status: 200 })) as typeof fetch;
    await expect(exchangeCode(oauth, "code", none)).rejects.toThrow(/refresh token/);
  });
});
