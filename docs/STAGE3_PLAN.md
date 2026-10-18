# Stage 3 plan: Firebase backend

Status: **plan only, nothing implemented.** Update `DEVELOPMENT_STATUS.md` as slices land.

## Decisions to confirm (defaults in bold)
1. Firestore layout: **everything under `households/{hid}/…`** so one rule (`isMember(hid)`) covers all data.
2. Sign-in method: **email + password** for you and your wife (no SMS cost, simple). Google sign-in can be added later.
3. Household creation: **owner creates the household; wife joins via an invite code redeemed by a server route** (Admin SDK), never by client writes to `members`.
4. Writes: **client writes allowed by rules for ordinary edits; server routes (Admin SDK) for invites, import commit, export, delete-household.**
5. Money fields: rules enforce integer `amountPaise`, `schemaVersion`, and immutable raw records.
6. Environments: **two Firebase projects (dev, prod)**; emulators for tests; no real statements in dev.

## Slices (each a PR with tests; domain code stays untouched)
1. **Config + adapters.** `src/data/repository.ts` interface (records, settlements, participants, accounts, rules, recurring, receipts). Mock store implements it; Firestore implementation behind it. Zod schemas in `src/data/schemas.ts` shared by client and server. Env validation (`src/lib/env.ts`) with clear startup errors.
2. **Auth.** Firebase Auth client, session cookie verified server-side (Admin SDK) in route handlers; sign-in page; route protection. Two test users in the emulator.
3. **Households and membership.** `households`, `members/{uid}`, invite flow, participants (friends without accounts, optional `userId` link).
4. **Security rules + emulator tests (written first).** `firestore.rules`, `storage.rules`, `tests/rules/*.test.ts` using `@firebase/rules-unit-testing`: member can read/write own household; non-member denied; changing `hid` in a path denied; spouse can read all; raw imported records immutable; settlements append-only (`voided` flag only); Storage files readable only by members, type/size limited.
5. **Persist the prototype data model.** Split raw transactions (immutable) from expenses; `expenseShares` derived from `SplitConfig`; audit events written on edit, match, settlement. Migration script `migrations/0001_*` with test.
6. **Files.** Private Storage uploads (statements, receipts), size/type validation, short-lived signed URLs from a server route.
7. **Export / restore.** JSON + CSV export with stable ids, optional files; restore script; round-trip test (export → wipe emulator → restore → compare balances and links).
8. **Deploy.** Vercel preview + prod env vars, README/DEPLOYMENT updates, CI runs rules tests in the emulator.

Acceptance for the stage: sign in separately as you and your wife, see the same data, cross-household access denied in tests, data survives reload and redeploy, export/restore round trip passes.

## Dependencies and costs
- Firebase Spark (free) covers Auth, Firestore and small usage; **Cloud Storage for Firebase now requires the Blaze (pay-as-you-go) plan** in new projects, so file uploads need a billing account (usually pennies at personal scale; set a budget alert).
- Emulator tests need **Java 21+** and `firebase-tools` on the machine and in CI.
- Vercel account for deployment.
