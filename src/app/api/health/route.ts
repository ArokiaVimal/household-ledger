import { NextResponse } from "next/server";
import { parseClientEnv, parseServerEnv } from "@/lib/env";

// TEMPORARY diagnostic for the first Vercel deploy. Reports only yes/no results and variable NAMES,
// never values. Delete once sign-in works (it is listed in docs/DEVELOPMENT_STATUS.md).
const safe = (e: unknown) => `${(e as Error)?.name ?? "Error"}: ${String((e as Error)?.message ?? e).replace(/-----BEGIN[\s\S]*?END PRIVATE KEY-----/g, "[key]").slice(0, 160)}`;

export async function GET() {
  const checks: Record<string, string> = {};
  const run = async (name: string, fn: () => unknown | Promise<unknown>) => {
    try { await fn(); checks[name] = "ok"; } catch (e) { checks[name] = `FAILED ${safe(e)}`; }
  };
  await run("client env (5 NEXT_PUBLIC_ vars)", () => parseClientEnv(process.env));
  await run("server env (admin vars, ALLOWED_EMAILS, APP_ENV)", () => parseServerEnv(process.env));
  await run("firebase-admin module loads", () => import("@/lib/firebase/admin"));
  await run("admin credential accepted by Firebase", async () => {
    const { getAdminAuth } = await import("@/lib/firebase/admin");
    await getAdminAuth().listUsers(1); // count only, nothing returned
  });
  await run("firestore reachable", async () => {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    await getAdminDb().collection("users").limit(1).get();
  });
  const present = Object.fromEntries(
    ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_APP_ID", "FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY", "ALLOWED_EMAILS", "APP_ENV"].map((k) => [k, process.env[k] ? "set" : "MISSING"]),
  );
  return NextResponse.json({ checks, present, node: process.version, appEnv: process.env.APP_ENV ?? null }, { headers: { "Cache-Control": "no-store" } });
}
