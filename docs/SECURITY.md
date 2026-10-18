# Security (design — NOT yet implemented)

Status: prototype has **no auth and no persistence**. Everything below is the Stage 3 plan.

- Firebase Auth per user; membership doc `households/{h}/members/{uid}` grants access. Firestore/Storage rules check membership server-side; owner-only for member management and deletion.
- Files in private Storage paths `households/{h}/files/…`; type/size validated; short-lived signed URLs.
- Admin credentials only in server env vars (see `.env.example`); never `NEXT_PUBLIC_`.
- Audit events for imports, edits, matches, settlements.
- Rules tests with the Firebase emulator (cross-household reads denied).
- Never ask for bank passwords, UPI PINs, full card numbers. Password-protected PDFs: ask user to upload an unlocked copy.
- Never commit real statements or production env files.
