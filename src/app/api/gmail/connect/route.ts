import { NextResponse } from "next/server";
import { getAuthMode } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { authUrl } from "@/lib/gmail/client";
import { signState } from "@/lib/gmail/crypto";
import { gmailConfig } from "@/lib/gmail/server";

/** Starts connecting Gmail: sends the signed-in person to Google's consent screen (read-only mail access). */
export async function GET(req: Request) {
  if (getAuthMode(process.env) === "off") return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const cfg = gmailConfig(req);
  if (!cfg) return NextResponse.redirect(new URL("/settings?gmail=notset#capture", req.url));
  return NextResponse.redirect(authUrl(cfg.oauth, signState(session.uid, cfg.key, Date.now())));
}
