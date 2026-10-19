import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { createLinkDeps } from "@/lib/links/server";
import { SplitConfigSchema } from "@/data/schemas";
import { confirmLink, declineLink, refreshForAccount, unlink } from "@/lib/links/service";
import { editShared, recordPayment, undoShared, voidPayment } from "@/lib/links/shared";
import { LinkError } from "@/lib/links/types";
import { defaultDisplayName } from "@/lib/profile/profile";
import { getProfile } from "@/lib/profile/store";

const key = z.string().min(3).max(300).regex(/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("confirm"), key, contactId: z.string().min(1).max(128).optional() }),
  z.object({ action: z.literal("decline"), key }),
  z.object({ action: z.literal("unlink"), key }),
  z.object({ action: z.literal("edit"), key, id: z.string().min(1).max(128), ifVersion: z.number().int().min(0), patch: z.object({
    merchant: z.string().max(120), date: z.string().max(10), amountPaise: z.number().int().safe(), categoryName: z.string().max(60), payerId: z.string().max(128), split: SplitConfigSchema, note: z.string().max(500).nullable(),
  }).partial() }),
  z.object({ action: z.literal("undo"), key, eventId: z.string().min(1).max(128) }),
  z.object({ action: z.literal("pay"), key, id: z.string().min(1).max(128), date: z.string().max(10), amountPaise: z.number().int().safe(), direction: z.enum(["paid", "received"]), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("voidPayment"), key, id: z.string().min(1).max(128) }),
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
  if (raw.length > 20_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
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
      case "edit": return NextResponse.json({ ok: true, ...(await editShared(d, actor, { key: a.key, id: a.id, ifVersion: a.ifVersion, patch: a.patch })) });
      case "undo": return NextResponse.json({ ok: true, ...(await undoShared(d, actor, a.key, a.eventId)) });
      case "pay": await recordPayment(d, actor, { key: a.key, id: a.id, date: a.date, amountPaise: a.amountPaise, direction: a.direction, note: a.note }); return NextResponse.json({ ok: true });
      case "voidPayment": await voidPayment(d, actor, a.key, a.id); return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("link action failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
