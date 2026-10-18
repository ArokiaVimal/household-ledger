// Browser Firebase. Only public web config; no secrets here.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export function getClientAuth() {
  // Next inlines NEXT_PUBLIC_* only for static property access, so list them explicitly.
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  return getAuth(app);
}
