import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { parseServerEnv } from "@/lib/env";

/** Server-only Firebase Admin. Credentials come from env vars, never from the repo. */
export function getAdminAuth() {
  if (!getApps().length) {
    const env = parseServerEnv(process.env);
    initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY }) });
  }
  return getAuth();
}
