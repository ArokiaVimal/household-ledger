# Development status

Updated: 2026-10-18 · Branch `feat/stage3-slice4-rules` (stacked on earlier slice branches) · Stages 1–2 complete (prototype). Stage 3 slices 1–4 built and tested locally; slices 5–8 not started (see `STAGE3_PLAN.md`).

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

## Branding (added)
- Logo: two overlapping circles (two people; the overlap is what is shared) on a violet rounded square. Sources: `src/app/icon.svg` (favicon), `src/app/icon.png` (96 px, for Safari/older browsers), `src/app/apple-icon.png` (180 px, iPhone Home Screen), `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (PWA manifest), `src/components/logo.tsx` (in-app mark, used in the sidebar and login page). The default Next favicon was removed. The PNGs were rendered once from the SVG with a throwaway script (not a project dependency); to change the logo, edit `icon.svg`/`logo.tsx` and re-render the PNGs.
- Login page redesigned: brand panel (logo, headline, three benefits) and sign-in card, responsive. The proxy gate now lets `icon*`/`apple-icon*` through so the icons load before sign-in. After deploying, iPhone users must remove and re-add the Home Screen icon to pick up the new icon.

## Live deployment (done)
- Live at `https://personal-finance-tracker-283.vercel.app` (Vercel project `household-ledger`, auto-deploys from `main` on GitHub `ArokiaVimal/household-ledger`). Google sign-in confirmed working by the owner. Mock data only.
- First deploy failed because `firebase-admin@14` loads ESM-only `jose@6` via `jwks-rsa@4`, which Vercel's runtime refuses (`ERR_REQUIRE_ESM`); fixed by pinning `firebase-admin@13.10` (see DECISIONS #7) and Node `22.x`. A temporary names-only `/api/health` route was used to diagnose and has been removed.
- Owner to-do: set `APP_ENV=production` in Vercel (production detection also uses `VERCEL_ENV`, so the app fails closed regardless).

## GitHub and CI (added)
- Repo: `ArokiaVimal/household-ledger` (private). The push needed a token with the `workflow` permission because of `.github/workflows/ci.yml`; instead the workflow was removed from the pushed history and kept as `docs/ci.yml.example` (add it on github.com later, see DEPLOYMENT.md). Local backup branch `backup-before-ci-removal` has the original history; the old `feat/*` branches also still contain `ci.yml` and must not be pushed.

## Deployment prep (added)
- Security headers (noindex, no framing, nosniff, referrer policy, permissions policy, HSTS) in `next.config.ts`, `robots.txt` disallowing crawlers, `docs/DEPLOYMENT.md` with the Vercel + Firebase steps. No CSP yet (would need a tested Google sign-in allowlist). Not yet deployed anywhere; no Git remote exists.

## Stage 3 slice 4: security rules (built; 24 emulator tests pass locally)
- `firestore.rules`: household membership via `households/{hid}/members/{uid}`; members read everything in their household; `users`, `households`, `members`, `invites` are server-write-only; records validated (integer positive paise, enums, no extra fields), never deletable, imported bank fields immutable; settlements corrected only by setting `voided`; audit events must carry the caller's own uid and are immutable; raw transactions write-once; participants/accounts not deletable; everything else denied. The data collections (`records`, `settlements`, ...) do not exist in the app yet; the rules define the contract for slice 5.
- `storage.rules`: `households/{hid}/files/{id}` only; members read/upload, PDF/CSV/XLSX/JPEG/PNG/WebP only, 1 byte to 15 MB, write-once (create requires no existing object), owner-only delete; all else denied.
- Tests: `pnpm test:rules` runs `firebase emulators:exec` (Firestore + Storage) and `tests/rules/*.test.ts`: 19 Firestore cases (cross-household denial, anonymous, privilege escalation, money validation, immutability, audit forgery) and 5 Storage cases (membership, type, size, write-once, paths). All 24 pass.
- The first run found a real bug: Storage allowed overwriting an existing file; fixed with `resource == null` on create. Mutation check: deliberately loosening two rules (member-doc writes, record deletes) made exactly the matching tests fail, so the tests are not vacuous.
- Needs Java 21+ and the Firebase CLI (a dev dependency). On this Mac Java is at `~/.local/java/Contents/Home` (Temurin 21 JRE, checksum verified): `export JAVA_HOME=$HOME/.local/java/Contents/Home; export PATH=$JAVA_HOME/bin:$PATH`. CI runs the rules tests with `actions/setup-java` (not yet run on GitHub: no remote).
- **Not deployed**: the rules are not published to the Firebase project (the app uses server-side Admin access, so deployed rules only matter once clients talk to Firestore/Storage directly). Deploy with `firebase deploy --only firestore:rules,storage` after `firebase login`, as part of slice 5/8. Storage also needs the Blaze plan.

## Custom categories and Varru (added after slice 3)
- The partner participant is named **Varru** in the UI and mock data (internal id stays `wife`; split preset reads "Me + Varru").
- Categories are household-editable (Categories page): add, rename, delete. `src/domain/categories.ts` holds the rules (unique case-insensitive names, safe characters, stable ids, `uncategorized` cannot be deleted, deleting a used category requires choosing where its transactions and merchant rules move, categories used by recurring items cannot be deleted; 6 tests). Categories and merchant rules now live in `src/data/store.tsx`; every screen reads them from there.
- Fixed: "apply rules" now targets the review queue (unreviewed rows live in `staged`, not the ledger).
- Not persisted yet (in-memory like all transaction data); stored per household in slice 5 (`households/{id}/categories`). Recurring items still use fixed categories and cannot be edited in the UI.
- Not visually checked: the Categories page was verified by typecheck, lint, unit tests and a production build only, because the browser pane cannot sign in.

## Stage 3 slice 3: households and membership (built; real signed-in flow not yet exercised by the owner)
- Firestore layout: `households/{id}`, `households/{id}/members/{uid}` (role owner|member), `invites/{sha256(code)}`, `users/{uid}.householdId`. All access is through server code (`/api/household`, Admin SDK); client access is blocked until slice 4 rules.
- Logic is split for testing: `src/lib/households/{logic,service}.ts` (pure rules + use cases against a `HouseholdStore` interface), `memory-store.ts` (tests), `firestore-store.ts` (app). Owner-only invite/revoke/remove; invite code is 10 unbiased random chars (XXXXX-XXXXX), valid 7 days, bound to one email, single use (transactional), stored only as a SHA-256 hash, shown to the owner once; every join failure returns one generic message; member cap 4 including pending invites.
- UI: Settings → Household card (create, join with code, member list, invite, copy code, pending invites with revoke, remove member).
- Tests: 15 unit tests + 1 opt-in real-Firestore integration test (`RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration`; passed against the dev project, cleans up after itself). Normal `pnpm test` skips it.
- Known limits: the app's transaction data is still mock/in-memory and is not yet scoped by household (slice 5). Participants (friends without accounts) are not yet persisted per household. The temporary `ALLOWED_EMAILS` allowlist still gates sign-in; once membership gates data it can be relaxed to "invited emails".

## Profile page (added after slice 2)
- `/profile`: full name, greeting name (header says "Hi <greeting name>"), phone, default view (Household/Personal), photo upload. Email is read-only (from the sign-in). Header avatar links here and shows the custom photo, else the Google photo, else initials.
- Data: Firestore `users/{uid}` written only by `PUT /api/profile` (Admin SDK; uid comes from the verified session cookie; same-origin check; 200 KB body cap). Photo is centre-cropped to 256 px and re-encoded as a JPEG data URL in the browser; the server accepts only base64 JPEG ≤100 KB whose bytes start with the JPEG signature (SVG/PNG/other refused). No Cloud Storage needed.
- Tests: 7 new (validation, name helpers). Verified: unauthenticated and forged-cookie requests are refused (307/401/403); the page and route build.
- **Not verified end to end:** saving needs the Firestore database. As of this commit the Firestore API is not enabled in the dev project (Admin probe returned PERMISSION_DENIED "API has not been used"), so a real save will fail until the owner creates the database. Without it the layout falls back to the Google name and the app still works.
- Firestore rules (slice 4) must deny all client access to `users/*` except the owner reading their own document.

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
2. Owner: create the household in Settings and invite the spouse (their Google email must also be in `ALLOWED_EMAILS`). Then slice 4 (rules + emulator tests; needs Java 21+, firebase-tools).
3. Split raw transactions from expenses in the data model; add export/restore round-trip test.
4. Stage 4: CSV parser with real file-hash dedupe, then XLSX, then PDF.
