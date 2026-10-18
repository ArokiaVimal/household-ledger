# Security

## Implemented (Stage 3 slice 2, tested only against dummy config; not yet run with a real Firebase project)
- Sign-in via Firebase Auth with **Google** (popup) or email/password. Policy (`isSignInAllowed`): email on `ALLOWED_EMAILS`; Google accounts must have a Google-verified email; other providers (anonymous, custom) are refused. The browser exchanges a fresh ID token for an **httpOnly, SameSite=Lax session cookie** at `POST /api/session` (Admin SDK `createSessionCookie`, 5 days). The browser then signs out of the client SDK, so no token is kept in JS-readable storage.
- `/api/session` checks same-origin, sign-in within 5 minutes, revocation, and an `ALLOWED_EMAILS` allowlist; failures return one generic message.
- `src/proxy.ts` redirects requests without a cookie to `/login`; the `(app)` layout verifies the cookie with Firebase on every request (including revocation) inside `<Suspense>` (Cache Components requirement).
- Fails closed: if `APP_ENV=production` and Firebase is not configured the app errors instead of serving; partial config is an error. With no config outside production the app runs in prototype mode (mock data only).
- Profiles: `users/{uid}` is written only by server code (`/api/profile`); photos are validated JPEG data URLs (see DEVELOPMENT_STATUS).
- Not yet: household membership checks, Firestore/Storage rules, MFA, rate limiting beyond Firebase's own.

Console hardening to do by hand (required while Email/Password is enabled, because self-registered password accounts have unverified emails): in Firebase Authentication settings disable user sign-up (create accounts for the two of you manually) and keep the project's API key restricted to your domains. Once Google sign-in works, consider disabling the Email/Password provider entirely. Known limit: Google popup sign-in can be unreliable inside an iPhone Home Screen (standalone PWA); use Safari for first sign-in.

## Planned (remaining slices)

- Firebase Auth per user; membership doc `households/{h}/members/{uid}` grants access. Firestore/Storage rules check membership server-side; owner-only for member management and deletion.
- Files in private Storage paths `households/{h}/files/…`; type/size validated; short-lived signed URLs.
- Admin credentials only in server env vars (see `.env.example`); never `NEXT_PUBLIC_`.
- Audit events for imports, edits, matches, settlements.
- Rules tests with the Firebase emulator (cross-household reads denied).
- Never ask for bank passwords, UPI PINs, full card numbers. Password-protected PDFs: ask user to upload an unlocked copy.
- Never commit real statements or production env files.
