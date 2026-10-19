import { NextResponse } from "next/server";

/** The version of the app that is live right now (the Git commit Vercel built). Lets a phone check whether it is running the latest. */
export async function GET() {
  return NextResponse.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
