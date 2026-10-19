import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { createLinkDeps } from "@/lib/links/server";
import { confirmLink, declineLink, refreshForAccount, unlink } from "@/lib/links/service";
import { LinkError } from "@/lib/links/types";
import { defaultDisplayName } from "@/lib/profile/profile";
import { getProfile } from "@/lib/profile/store";

const key = z.string().min(3).max(300).regex(/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("confirm"), key, contactId: z.string().min(1).max(128).optional() }),
  z.object({ action: z.literal("decline"), key }),
  z.object({ action: z.literal("unlink"), key }),
]);
const status = { forbidden: 403, invalid: 400, conflict: 409, not_found: 404 } as const;

/**
 * Account linking for Friends & Family. Identity (uid, email, verified) comes from the verified session only. The contact owner
 * confirms their own side; either person can unlink. Nothing here edits the owner's ledger.
 */
export async function POST(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || !session.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 2000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* validation error below */ }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const d = createLinkDeps();
    const name = (await getProfile(session).catch(() => null))?.displayName ?? defaultDisplayName(session.name, session.email);
    const actor = { uid: session.uid, email: session.email, name };
    const a = parsed.data;
    switch (a.action) {
      case "check": return NextResponse.json({ ok: true, found: await refreshForAccount(d, { uid: session.uid, email: session.email, emailVerified: session.emailVerified }) });
      case "confirm": return NextResponse.json({ ok: true, ...(await confirmLink(d, actor, a.key, a.contactId)) });
      case "decline": await declineLink(d, actor, a.key); return NextResponse.json({ ok: true });
      case "unlink": await unlink(d, actor, a.key); return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("link action failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
