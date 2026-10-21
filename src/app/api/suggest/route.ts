import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createFirestoreRepository } from "@/data/firestore-repository";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { createFirestoreHouseholdStore } from "@/lib/households/firestore-store";
import { getMembership } from "@/lib/households/service";
import { trackedSuggest } from "@/lib/ai-usage/server";
import { refreshSuggestions } from "@/lib/import/service";
import { selfIdentityOf } from "@/domain/import/self";

// Claude is asked about merchants that memory does not know, which can take a few seconds.
export const maxDuration = 60;

/** "Fill in with AI": runs memory + Claude over the rows already waiting in the review queue. Changes only merchant, category and type. */
export async function POST() {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const membership = await getMembership(createFirestoreHouseholdStore(), session.uid);
    if (!membership) return NextResponse.json({ error: "Finish setting up your account first." }, { status: 403 });
    const repo = createFirestoreRepository(membership.household.id);
    const result = await refreshSuggestions(repo, { sha256: (s) => createHash("sha256").update(s).digest("hex"), now: () => Date.now(), newId: () => randomUUID(), suggest: trackedSuggest(process.env, session.uid, "categories"), self: selfIdentityOf([{ name: session.name, email: session.email }, ...membership.members.filter((m) => m.uid === session.uid).map((m) => ({ name: m.displayName, email: m.email }))]) });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("suggest failed", (e as { code?: string }).code, String((e as Error).message).split("\n")[0].slice(0, 160));
    return NextResponse.json({ error: "Could not fill in suggestions. Try again." }, { status: 500 });
  }
}
