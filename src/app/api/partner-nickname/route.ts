import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { savePartnerNickname } from "@/lib/profile/store";

const body = z.object({ nickname: z.string().max(30) });

/** What the signed-in person calls their linked partner. Stored on their own account; the partner never sees it. */
export async function PUT(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Keep it under 30 characters." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, nickname: await savePartnerNickname(session, parsed.data.nickname) });
  } catch (e) {
    console.error("partner nickname save failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500 });
  }
}
