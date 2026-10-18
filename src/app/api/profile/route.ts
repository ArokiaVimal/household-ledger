import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthMode, isSameOrigin } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { ProfileInputSchema, validateAvatarDataUrl } from "@/lib/profile/profile";
import { saveProfile } from "@/lib/profile/store";

const body = ProfileInputSchema.extend({ avatarDataUrl: z.string().nullable().optional() });

export async function PUT(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), h.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); // verifies the cookie with Firebase; uid comes from it, never from the request
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* falls through to validation error */ }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { avatarDataUrl, ...input } = parsed.data;
  if (typeof avatarDataUrl === "string") {
    const err = validateAvatarDataUrl(avatarDataUrl);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  try {
    return NextResponse.json({ profile: await saveProfile(session, input, avatarDataUrl) });
  } catch (e) {
    console.error("profile save failed", (e as { code?: string }).code);
    return NextResponse.json({ error: "Could not save your profile. Try again." }, { status: 500 });
  }
}
