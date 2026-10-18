# Development status

Updated: 2026-10-18 · Branch `feat/stage3-slice2-auth` (stacked on slice 1 and `feat/domain-core`) · Stages 1–2 complete (prototype). Stage 3 slices 1–2 built; slices 3–8 not started (see `STAGE3_PLAN.md`).

## Implemented and verified
- Domain (`src/domain`): integer-paise money, equal/percent/custom splits (deterministic remainder), spending rules (refunds subtract; cc payments, transfers, income, excluded ignored), pairwise balances with settlements/voids, duplicate detection (reference id exact; date+amount+merchant possible), receipt match suggestions.
- Tests: `pnpm test` → 21 passing (domain + mock-data reconciliation). `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.
- UI on 42 fictional Sept 2026 records: Dashboard (clickable charts → filtered Transactions), Transactions (compact edit dialog (one line per field; overflow chips open a "+N more" pop-up) with quick split presets and Save & next for unreviewed rows; search/filters, group tabs: All, Payment methods, Platforms & merchants, Categories, Paid by; table with logos + mobile cards, edit dialog with split editor), Settlements (record/void/partial), Receipts (suggest/link/unlink), Categories & rules (apply to unreviewed), Reports, Settings (members, participants, accounts, mock JSON export, delete-confirm dialog), Import centre (simulated), PWA manifest, mobile bottom nav.
- Manual check: dashboard and mobile transactions/edit dialog viewed in browser at 375px and desktop. Other screens were built but only dashboard/transactions/import were eyeballed.
- Docs, CI workflow (`.github/workflows/ci.yml`, not yet run on GitHub), `.env.example`.

## Stage 3 slice 2: Auth (built; verified with dummy config only)
- `src/lib/auth/config.ts` (mode, allowlist, same-origin, fresh sign-in; 7 tests), `src/lib/firebase/{client,admin}.ts`, `src/lib/auth/session.ts`, `src/app/api/session/route.ts`, `src/proxy.ts`, `src/app/login/*` (React Hook Form + Zod), sign-out button in the shell.
- Routes moved into the `src/app/(app)/` group whose layout verifies the session; `/login` is outside it.
- Verified by running a production build with dummy env: no cookie redirects to `/login`, forged cookie shows no app content, cross-origin POST is 403, garbage token is a generic 401, prototype mode (no env) still works. **Not verified against a real Firebase project: the owner must put real values in `.env.local` and test an actual sign-in.**
- Google sign-in added (popup; same session cookie flow and allowlist). Needs the Google provider enabled in the Firebase console and the app's domain in Authorized domains (localhost is there by default). Not tested with a real Google account.
- `ALLOWED_EMAILS` env var added (temporary allowlist until household membership in slice 3).

## Stage 3 slice 1 (done, not yet wired into the UI)
- `src/data/schemas.ts`: Zod schemas for every entity; `ExpenseRecordSchema` enforces integer positive paise, valid dates, split sums (via domain `validateSplit`) and `shared` consistency. `satisfies z.ZodType<…>` keeps them in sync with `src/domain/types.ts`.
- `src/data/repository.ts`: the data-access interface (household-scoped collections; settlements and audit are append-only). `src/data/memory-repository.ts`: in-memory implementation that validates on write and refuses to change raw imported fields (the same rules the Firestore rules must enforce).
- `src/lib/env.ts`: `parseClientEnv` / `parseServerEnv` with readable errors that name variables, never values. Not called at startup yet.
- `AuditEvent` type added. The prototype UI still uses `src/data/store.tsx` directly; it moves onto the repository in slice 5.
- Tests: 40 passing (14 new: schemas, repository rules, env).

## Review queue (added)
- Imports no longer go straight into the ledger. `store.staged` is the review queue; `store.records` is the ledger. Only approved rows (status `reviewed`) feed the dashboard, reports, balances, recurring and receipts. Imported rows start `unreviewed`.
- `/review`: edit category, split, payer, recurring, notes; Approve, Approve & next, Save draft, Later, Reject (with confirm). Multi-select "Approve N as they are…" with confirmation. Possible duplicates are flagged with the matching record; exact duplicates (reference id, also within the file and against the queue) are skipped at import (`planImport`).
- Every ledger row shows a "Reviewed" tag. Manual entries count as reviewed (the user typed them). The 8 mock rows that were "unreviewed" now start in the queue, so receipts for Swiggy/Blinkit only match after approval.
- Merchant rules (`merchantRules`, `suggestCategory`) pre-fill categories in the queue; the user still confirms each row.
- Prototype caveats: nothing persists; rejecting discards the row (a real build must keep the raw record and an audit event).

## Manual entry (added)
- Floating "Add" button on every screen opens the same compact form in add mode: amount, date, payment method, merchant, category, type, payer, split, recurring, notes. "Add another" resets for fast bulk entry. Stored with `importSource: "Manual entry"`, status reviewed. Not persisted (prototype). No duplicate check against existing records yet.

## Payment methods and recurring (added)
- Accounts match the owner's real methods: HDFC/SBI/ICICI Coral/Amex Platinum Travel cards, UPI apps (GPay, CRED, BHIM, Paytm), HDFC and ICICI banks. UPI records carry `fundedBy` (the bank). Transactions tabs: Payment methods, Bank accounts (bank + UPI funded by it), Recurring.
- Recurring: `RecurringItem` + `src/domain/recurring.ts` (paid/upcoming/overdue, variance, yearly projection; tested) and `/recurring` screen. Items: rent, maintenance, gas, EB at Sis Safa (split with wife), EB at parents' Park 63, car EMI, life insurance. Amounts are fictional; place names are as dictated and need confirmation of spelling.
- Linking a payment to a recurring item is manual (edit dialog). No auto-detection yet. Prototype "today" is fixed at 2026-09-24.
- The old single-account mock ids (cc1/bank1/upi1) were replaced; mock records were reassigned across the new accounts arbitrarily.

## UI notes
- Restyled to the owner's lavender reference (tokens in `globals.css`): icon rail, KPI cards, donut + area charts, merchant logos.
- Brand icons in `public/logos` were fetched once from public favicons (low-res for some, e.g. HDFC/BigBasket 16px); mapping in `src/lib/logos.ts`; no runtime third-party calls. IRCTC icon missing (initial fallback). Brand marks belong to their owners; fine for private use, review before any public release.

## Mocked / partial
- Everything persists only in memory. Import never reads files. Receipts, import history, Apr–Aug trend and rules are mock values. "Personal" view = records I paid for or share in.
- Month selector: only September 2026 has data (August shows empty state).
- Raw txn and expense are merged into `ExpenseRecord`; shares derived, not stored.
- React Hook Form not used yet (plain controlled forms); add with Zod schemas in Stage 3.

## Known issues
- Receipts page and others untested on mobile; edit dialog sits visually near bottom nav on small screens.
- No dark mode, no iOS PNG icons, no service worker.
- Dev-only: `next dev` may re-add the Next.js block in AGENTS.md.

## Not started (requires configuration)
Firebase project (Auth, Firestore, Storage), Firestore/Storage rules + emulator tests, Vercel project, real CSV/XLSX/PDF parsing, export/restore round trip, migrations.

## Next recommended tasks
1. Merge branches to `main` after review (no remote configured yet; create the GitHub repo and push).
2. Owner: put real Firebase values in `.env.local`, create the two users, sign in. Then slice 3 (households/membership) and slice 4 (rules + emulator tests; needs Java 21+, firebase-tools).
3. Split raw transactions from expenses in the data model; add export/restore round-trip test.
4. Stage 4: CSV parser with real file-hash dedupe, then XLSX, then PDF.
