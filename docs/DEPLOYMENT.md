# Deployment (Vercel + Firebase)

Status: deployable today, **mock data only**. Real statement import, file storage and saved data arrive with slices 5 and 6 (see `STAGE3_PLAN.md`). Do not upload real financial documents to a deployment until those slices are built, tested and the rules are deployed.

## What you need
- A GitHub repository for this project (private).
- A Vercel account (free Hobby plan is enough for personal use).
- The Firebase dev project (`pfst-9ee33`) already created. A separate production project is recommended before real data (see below).

## Node and Firebase Admin versions
`package.json` pins `engines.node` to `22.x`, and `firebase-admin` is pinned to **13.10.x**. Version 14 pulls `jwks-rsa@4` which `require()`s the ESM-only `jose@6`; Vercel's runtime refuses that (`ERR_REQUIRE_ESM`), which broke the first deploy (login stuck on "Loading", `/api/session` 500). It works on a Mac, so only a real deploy shows it: check `/api/health` after any Firebase dependency upgrade.

## Environment variables (Vercel → Project → Settings → Environment Variables)
Set for **Production** (and Preview if you want previews to sign in). Names are in `.env.example`:
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `ALLOWED_EMAILS`, `APP_ENV=production`.
- `FIREBASE_ADMIN_PRIVATE_KEY`: paste with the literal `\n` sequences, wrapped in double quotes, exactly as the helper script writes it (`scripts/set-admin-env.mjs`). Mark it **Sensitive**.
- With `APP_ENV=production` the app refuses to run unless Firebase is fully configured (fails closed).

## Counting Firestore reads (diagnostics, off by default)
Set `LOG_FIRESTORE_READS=1` on Vercel (Production), redeploy, then open the app and use it normally. Vercel → Project → Logs, search for `fs-reads`. Each page load and each save prints one line such as `{"t":"fs-reads","name":"page load","total":1042,"top":{"records":820,"settlements":60,...}}` (`name` is `api/data <action>` for a save). Only collection names and counts are logged, never document contents. Compare the totals with the Firebase console's daily read chart (free quota: 50,000 reads a day). **Delete the variable and redeploy when done.** Code: `src/lib/diagnostics/`. Not tested against a real Firestore (no emulator here): check the first lines look sensible against the console's chart.

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

## Adding CI on GitHub (kept out of Git history on purpose)
The pipeline is saved as `docs/ci.yml.example` (lint, typecheck, tests, build, and the Firebase rules tests with Java 21). It is not active yet because pushing a workflow file needs a token with the `workflow` permission. To turn it on without any token: on github.com open the repo, **Add file → Create new file**, name it `.github/workflows/ci.yml`, paste the contents of `docs/ci.yml.example`, and commit to `main`. Then run `git pull` locally so your copy has it. Pull requests will then be checked automatically.

## Known gaps
No CSP header yet (needs a tested allowlist for Google sign-in). Home Screen icon is an SVG; iOS prefers a 180px PNG `apple-touch-icon` (to add). Google popup sign-in can be unreliable inside the installed Home Screen app; sign in via Safari first.
