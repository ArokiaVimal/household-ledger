import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { exchangeCode } from "@/lib/gmail/client";
import { encrypt, verifyState } from "@/lib/gmail/crypto";
import { createFirestoreGmailStore } from "@/lib/gmail/firestore-store";
import { gmailConfig } from "@/lib/gmail/server";

/** Google sends the person back here with a one-time code. We keep only an encrypted refresh token, never the code or the password. */
export async function GET(req: Request) {
  const back = (status: string) => NextResponse.redirect(new URL(`/settings?gmail=${status}#capture`, req.url));
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const cfg = gmailConfig(req);
  if (!cfg) return back("notset");
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return back("denied");
  const code = q.get("code"), state = q.get("state");
  if (!code || !state || !verifyState(state, session.uid, cfg.key, Date.now())) return back("error");
  try {
    const membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
    if (!membership) return back("error");
    const { refreshToken, email } = await exchangeCode(cfg.oauth, code);
    const accounts = await createFirestoreRepository(membership.household.id).accounts.list();
    const store = createFirestoreGmailStore();
    const before = await store.get(session.uid);
    const fallback = before?.defaultAccountId ?? accounts.find((a) => a.type === "bank")?.id ?? accounts.find((a) => a.type !== "cash")?.id ?? "";
    await store.put({ uid: session.uid, householdId: membership.household.id, email, refreshTokenEnc: encrypt(refreshToken, cfg.key), defaultAccountId: fallback, connectedAt: new Date().toISOString() });
    return back("connected");
  } catch (e) {
    console.error("gmail connect failed", String((e as Error).message).split("\n")[0].slice(0, 160));
    return back("error");
  }
}
