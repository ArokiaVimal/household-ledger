import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { parseServerEnv } from "@/lib/env";

function init() {
  if (!getApps().length) {
    const env = parseServerEnv(process.env);
    initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY }) });
  }
}

/** Server-only Firebase Admin. Credentials come from env vars, never from the repo. */
export function getAdminAuth() {
  init();
  return getAuth();
}

/** Admin Firestore bypasses security rules, so only call it from server code that has checked the session. */
export function getAdminDb() {
  init();
  return getFirestore();
}
