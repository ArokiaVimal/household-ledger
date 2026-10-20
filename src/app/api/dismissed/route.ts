import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { authorize } from "../import/shared";

/** Saves "not recurring" answers on the signed-in person's account (a short list of keys), so every device agrees. */
export async function POST(req: Request) {
  const who = await authorize();
  if (!who.ok) return who.res;
  let b: { keys?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Could not read the request." }, { status: 400 }); }
  const keys = (Array.isArray(b.keys) ? b.keys : []).filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 120).slice(0, 200);
  if (keys.length === 0) return NextResponse.json({ ok: true });
  await getAdminDb().collection("users").doc(who.session.uid).set({ dismissedRecurring: FieldValue.arrayUnion(...keys) }, { merge: true });
  return NextResponse.json({ ok: true });
}
