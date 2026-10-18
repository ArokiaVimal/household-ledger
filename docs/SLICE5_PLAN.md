# Slice 5 plan: save the real data

Status: **plan only.** Goal: the signed-in household's transactions, splits, settlements, categories and review queue live in Firestore instead of the in-memory mock store. After this, the app can hold real data (files and parsers come in slice 6 and Stage 4).

## Decisions (defaults in bold, confirm before building)
1. Data access: **server-mediated.** Pages load data on the server and every change goes through validated API routes (session + household membership checked, Zod schemas, Admin SDK). The rules from slice 4 stay as a backstop for any direct client access. Alternative: client SDK with Firebase ID tokens; rejected for now because we deliberately keep no client-side credential.
2. Starting data: **a new household starts empty**, with default categories and your 10 payment methods offered as one-click defaults you can edit. The fictional September data stays only in demo mode (no sign-in configured).
3. Demo mode: **kept** when Firebase is not configured, so local development and demos still work.
4. Splits: **derived, not stored** (computed by `computeShares` from the split config) until reports need a stored copy.

## Data layout (under `households/{hid}/`)
`records` (canonical expenses; status unreviewed rows are the review queue), `rawTransactions` (immutable bank rows, written at import), `importBatches`, `settlements` (append-only, `voided`), `auditEvents` (append-only), `categories`, `merchantRules`, `participants`, `accounts`, `recurring`, `receipts`. Every document carries `schemaVersion`. Matches the rules in `firestore.rules`.

## Tasks
1. Firestore `Repository` implementation (same interface and rules as the memory one; tested against the memory implementation's test suite plus the opt-in real-database test).
2. Server load functions per screen and a `HouseholdData` bundle for the layout.
3. Mutation routes with Zod validation: create/edit/approve/reject records, settlements (create/void), categories, rules, participants, accounts, recurring.
4. Audit events written server-side on every mutation (who, what, when).
5. Replace `src/data/store.tsx` internals: initial data from the server, optimistic updates, rollback on failure; demo mode keeps the mock seed.
6. First-run setup: default categories, optional default accounts, add friends as participants (no account needed), link a participant to a member.
7. Migration framework: `migrations/0001-default-categories` with a test; `schemaVersion` per household.
8. Tests: repository contract tests, mutation route authorization (cross-household denied, non-member denied), reconciliation (dashboard totals equal list totals), audit trail written.
9. Docs: DATA_MODEL, SECURITY, DEVELOPMENT_STATUS.

## What changes for you
Data you enter or approve will survive reloads and be the same for you and Varru. The dashboard starts at zero until data exists. Nothing is imported automatically yet: until slice 6 and the parsers, rows come from manual entry (the Add button).
