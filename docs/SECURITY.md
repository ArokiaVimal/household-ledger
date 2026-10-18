# Security

## Implemented (Stage 3 slice 2, tested only against dummy config; not yet run with a real Firebase project)
- Sign-in via Firebase Auth with **Google** (popup) or email/password. Policy (`isSignInAllowed`): email on `ALLOWED_EMAILS`; Google accounts must have a Google-verified email; other providers (anonymous, custom) are refused. The browser exchanges a fresh ID token for an **httpOnly, SameSite=Lax session cookie** at `POST /api/session` (Admin SDK `createSessionCookie`, 5 days). The browser then signs out of the client SDK, so no token is kept in JS-readable storage.
- `/api/session` checks same-origin, sign-in within 5 minutes, revocation, and an `ALLOWED_EMAILS` allowlist; failures return one generic message.
- `src/proxy.ts` redirects requests without a cookie to `/login`; the `(app)` layout verifies the cookie with Firebase on every request (including revocation) inside `<Suspense>` (Cache Components requirement).
- Fails closed: if `APP_ENV=production` and Firebase is not configured the app errors instead of serving; partial config is an error. With no config outside production the app runs in prototype mode (mock data only).
- Profiles: `users/{uid}` is written only by server code (`/api/profile`); photos are validated JPEG data URLs (see DEVELOPMENT_STATUS).
- Not yet: household membership checks, Firestore/Storage rules, MFA, rate limiting beyond Firebase's own.

Console hardening to do by hand (required while Email/Password is enabled, because self-registered password accounts have unverified emails): in Firebase Authentication settings disable user sign-up (create accounts for the two of you manually) and keep the project's API key restricted to your domains. Once Google sign-in works, consider disabling the Email/Password provider entirely. Known limit: Google popup sign-in can be unreliable inside an iPhone Home Screen (standalone PWA); use Safari for first sign-in.

## Invitations (personal-first)
Invites are bound to one email and a week's expiry. Accepting needs the verified sign-in email to match (Google-verified for Google sign-in), is transactional and single-use, and never discards data: an existing private space is dropped only when it is completely empty and only the invitee is in it. A new private space is created atomically so parallel first loads cannot create two.

## Data API (slice 5)
All household data changes go through `POST /api/data`: same-origin check, verified session, household resolved from membership (a user can only ever write their own household), body size cap, Zod validation, domain invariants (integer paise, split sums, immutable bank fields, append-only settlements and audit). Identity and household are never taken from the request body. Admin SDK bypasses Firestore rules, so this route and `applyAction` are the authorization boundary; the rules remain a backstop for any direct client access.

## Rules (Stage 3 slice 4, tested in the emulator, not yet deployed)
`firestore.rules` and `storage.rules` enforce household membership, integer-paise validation, immutability of imported data, append-only settlements/audit, private typed size-limited files. 24 emulator tests (`pnpm test:rules`). Server routes use the Admin SDK (bypasses rules), so every route authorises with the verified session first.

## Planned (remaining slices)

- Firebase Auth per user; membership doc `households/{h}/members/{uid}` grants access. Firestore/Storage rules check membership server-side; owner-only for member management and deletion.
- Files in private Storage paths `households/{h}/files/…`; type/size validated; short-lived signed URLs.
- Admin credentials only in server env vars (see `.env.example`); never `NEXT_PUBLIC_`.
- Audit events for imports, edits, matches, settlements.
- Rules tests with the Firebase emulator (cross-household reads denied).
- Never ask for bank passwords, UPI PINs, full card numbers. Password-protected PDFs: ask user to upload an unlocked copy.
- Never commit real statements or production env files.
