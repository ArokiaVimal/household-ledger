# Deployment (Vercel + Firebase)

Status: deployable today, **mock data only**. Real statement import, file storage and saved data arrive with slices 5 and 6 (see `STAGE3_PLAN.md`). Do not upload real financial documents to a deployment until those slices are built, tested and the rules are deployed.

## What you need
- A GitHub repository for this project (private).
- A Vercel account (free Hobby plan is enough for personal use).
- The Firebase dev project (`pfst-9ee33`) already created. A separate production project is recommended before real data (see below).

## Environment variables (Vercel → Project → Settings → Environment Variables)
Set for **Production** (and Preview if you want previews to sign in). Names are in `.env.example`:
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `ALLOWED_EMAILS`, `APP_ENV=production`.
- `FIREBASE_ADMIN_PRIVATE_KEY`: paste with the literal `\n` sequences, wrapped in double quotes, exactly as the helper script writes it (`scripts/set-admin-env.mjs`). Mark it **Sensitive**.
- With `APP_ENV=production` the app refuses to run unless Firebase is fully configured (fails closed).

## Firebase console, after you know the Vercel URL
1. Authentication → Settings → **Authorized domains** → add `your-app.vercel.app` (and any custom domain). Without this Google sign-in fails with "unauthorized domain".
2. Add the production Google account emails to `ALLOWED_EMAILS` (comma-separated, exact).
3. Restrict the web API key (Google Cloud Console → APIs & Services → Credentials) to your Vercel domain(s) and `localhost` for development.

## Deploy
1. Push the repo to GitHub, import it in Vercel (framework: Next.js; package manager pnpm is detected from `packageManager`).
2. Add the variables above, deploy.
3. Open the URL in Safari, sign in with Google, then Share → **Add to Home Screen** for the PWA.

## Before real data
- Use a **separate Firebase project for production** (own Firestore, Auth, Storage) so test data and real data never mix; copy the env values into Vercel Production only.
- Deploy the rules: `firebase login`, then `firebase deploy --only firestore:rules,storage --project <prod-project-id>`.
- Enable Cloud Storage (needs the Blaze plan; set a budget alert) before slice 6.
- Turn on Firestore backups/exports and follow the backup notes below.

## Backup and recovery (plan)
Scheduled Firestore export to a private bucket, plus the app's own JSON/CSV export (slice 7). Restore is rehearsed with the export/restore round-trip test before real data is loaded.

## Known gaps
No CSP header yet (needs a tested allowlist for Google sign-in). Home Screen icon is an SVG; iOS prefers a 180px PNG `apple-touch-icon` (to add). Google popup sign-in can be unreliable inside the installed Home Screen app; sign in via Safari first.
