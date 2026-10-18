import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { ActionError, applyAction } from "@/lib/data/actions";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { coupleContextFor } from "@/lib/data/couple";

const status = { invalid: 400, not_found: 404, conflict: 409 } as const;

/** The single write path for household data. Household and identity come from the verified session, never from the body. */
export async function POST(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* validation error below */ }

  try {
    const membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
    if (!membership) return NextResponse.json({ error: "Create or join a household first." }, { status: 403 });
    const hStore = createFirestoreHouseholdStore();
    const couple = await coupleContextFor(hStore, session.uid, (id) => createFirestoreRepository(id));
    await applyAction(createFirestoreRepository(membership.household.id), { uid: session.uid }, json, couple);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: status[e.code] });
    console.error("data action failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
}
