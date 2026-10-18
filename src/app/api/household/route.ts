import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { createFirestoreHouseholdStore, serverDeps } from "@/lib/households/firestore-store";
import { createHousehold, createInvite, joinHousehold, removeMember, revokeInvite } from "@/lib/households/service";
import { HouseholdError } from "@/lib/households/types";
import { defaultDisplayName } from "@/lib/profile/profile";
import { getProfile } from "@/lib/profile/store";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().max(100) }),
  z.object({ action: z.literal("invite"), email: z.string().max(200) }),
  z.object({ action: z.literal("revoke"), hash: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("join"), code: z.string().max(40) }),
  z.object({ action: z.literal("remove"), uid: z.string().min(1).max(128) }),
]);

const status = { forbidden: 403, invalid: 400, conflict: 409, limit: 409 } as const;

export async function POST(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || !session.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 5000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* validation error below */ }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    // Identity comes from the verified session, never from the request body.
    const name = (await getProfile(session).catch(() => null))?.displayName ?? defaultDisplayName(session.name, session.email);
    const actor = { uid: session.uid, email: session.email, name };
    const store = createFirestoreHouseholdStore();
    const a = parsed.data;
    switch (a.action) {
      case "create": await createHousehold(store, actor, a.name, serverDeps); return NextResponse.json({ ok: true });
      case "invite": return NextResponse.json({ ok: true, ...(await createInvite(store, actor, a.email, serverDeps)) });
      case "revoke": await revokeInvite(store, actor, a.hash); return NextResponse.json({ ok: true });
      case "join": await joinHousehold(store, actor, a.code, serverDeps); return NextResponse.json({ ok: true });
      case "remove": await removeMember(store, actor, a.uid); return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof HouseholdError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("household action failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
