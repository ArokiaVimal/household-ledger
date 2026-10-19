# Development status

Updated: 2026-10-18 · Branch `feat/slice5-persistence` · Stage 3 slices 1–5 built and tested; slices 6–8 not started (see `STAGE3_PLAN.md`). Signed-in users now see and save REAL household data; demo mode (no Firebase configured) still shows fictional September 2026 data.

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

## Mobile shell polish (added after the first iPhone PWA screenshot)
- **Bug fixed:** the orange "PROTOTYPE / fictional data" banner showed for real signed-in users. It now appears only in demo mode (short "Demo mode" text).
- **Header** is compact on phones: greeting + bell + profile menu on one row; a month **stepper** (‹ Oct 2026 ›, next disabled at the current month; replaces the hard-coded Sep/Aug dropdown, which was wrong for real use) and a **Mine / Everything** switch on the next row. Search moved out of the phone header (Transactions has its own; the desktop header keeps it from the lg breakpoint). The stray sign-out icon is now inside a **profile menu** (profile, settings, sign out). `src/domain/months.ts` holds the tested month helpers.
- **Bottom bar and Add button** are positioned from the iPhone safe-area inset (`--sab` in `globals.css`), the Add button sits above the bar (z-30), and page content gets enough bottom padding to scroll clear. Verified at 375 px with a simulated 34 px inset; not yet seen on the owner's real iPhone.
- **Dashboard summary cards:** two per row on phones, compact. **Onboarding:** hero stacks on phones; step text uses the full card width.
- iOS caches installed web apps: close and reopen the Home Screen app (or remove and re-add it) to see changes.

## Re-reading an already-imported file (added)
- Uploading the same statement (same bytes, same payment method) is no longer a dead end. The preview reports `previousImport`; the Import screen shows **"Read this file again?"** with the numbers and the preview stays hidden until you answer. **Yes** shows the normal preview (rows still in your ledger or review queue are skipped as duplicates; rows you rejected or removed come back for review). **No** clears the file. If nothing would be added the dialog says so and only offers Close. The server enforces it: committing without `reimport=1` is refused (`already_imported`), a confirmed repeat is stored as a new batch with `reimportOf` and a RE-IMPORTED audit entry, and the history list shows "Read again".
- Tests: service tests (previous import reported, refusal without consent, rejected rows come back once, nothing added when all present) and a real-Firestore test. A bug found while checking it in the browser: the dialog's own "closed" event was cancelling the import after Yes; fixed.
- Not checked in the live app (needs sign-in); checked in the browser with a faked server reply at desktop and phone width.

## Import → review → dashboard flow (added)
- After a successful import (at least one row staged) the Import screen sends you straight to `/review?imported=N&skipped=M`, which shows a one-line confirmation and, while the rows are still arriving from the server, a "Loading your N imported transactions…" state (it gives up after 8 seconds and shows the normal queue). The query string is removed once the queue has been cleared.
- **First time only:** when the review queue goes from having rows to empty and something has been approved, you are taken to `/?reviewed=1` (the dashboard shows an "All caught up" strip with Dismiss). The once-only flag is stored in this browser (`localStorage` key `pf:first-review-done`), so a different device or a cleared browser will do it once more. Clearing the queue again later just shows the empty queue.
- Verified in a browser (demo mode): approving all waiting rows redirected to the dashboard the first time and stayed on the review page the second time; the confirmation strip renders. **Not exercised end to end on the live site:** the Import → Review jump after a real upload.

## After the first import: preview, not an empty screen (added)
- The welcome guide (`Onboarding`) now shows only when **nothing exists yet** (no approved rows and no waiting rows; import history alone no longer keeps the dashboard away, so deleting every transaction brings the guide back). It no longer lingers until the first approval.
- Imported rows wait in the review queue, so right after an import the ledger is still empty. In exactly that situation (`previewing` in `src/data/store.tsx`: live mode, zero approved, some waiting) every screen is built from the waiting rows and a **"Preview"** banner in the app shell says so ("nothing counts until you approve it", with a Review now button). The moment one row is approved the preview ends and only approved rows count, as before. Demo mode is unaffected.
- The dashboard now opens on the latest month that has data when this month has none (`pickMonth`, `src/domain/months.ts`, tested), so a September statement opened in October is not an empty page; the month is also re-picked after an import adds data elsewhere.
- Verified with a temporary preview page (removed) in a browser: preview state with banner and numbers, and the approved state with no banner. Not yet seen on the live site with a real import.

## Private by default, optional couple space (built; unit, contract and emulator tests pass; not yet exercised live)
Plan: `docs/PRIVACY_AND_COUPLE_PLAN.md`; decision 11. Built: couple space and `sharedExpenses` (rules + repository), partner linking by email (`src/lib/households/couple.ts`), sharing on approve/edit/delete with withdrawal, Mine / Together views, balances and settlements from the couple space, per-couple split ratio (Settings), progressive disclosure (no Together switch, Settle tab or split-with-partner until linked), unlink with history kept. Not built: default-for-new-expenses and show-notes-by-default preferences (imports and manual entries are private unless you choose a split), CSV export of shared history (JSON export includes it), migration of any partner who was already added to a personal space under the old flow (none expected). Not verified: a real two-account run on the live site; the opt-in Firestore integration test was updated but not run.

## Personal first (added; supersedes the earlier household-first framing)
- **Product order (owner's direction): 1) track my own expenses and categories, 2) split with my partner (Varru), 3) split with friends.** The app no longer starts with a "household".
- **No "create a household" step.** On first sign-in a private space ("<first name>'s finances") is created automatically (`firstRun` in `src/lib/households/service.ts`; creation is atomic in Firestore so parallel loads cannot create two). Internally the space is still a `households/{id}` document; "household" is now only an implementation word.
- **Invitations by email, no code.** The owner invites an email (Settings → Sharing). When that person signs in with that Google account they see an invitation screen (`src/components/invitation.tsx`): **Join** or **Start on my own**. Accepting is allowed only if the invited email matches the verified sign-in email (`acceptInviteByEmail`). If the person already made their own space it is dropped to make room **only if it holds no data**; otherwise joining is refused so nothing is hidden or lost. (The code-based join still exists server-side but is no longer offered in the UI.)
- **Redesigned welcome screen** (`src/components/onboarding.tsx`, shown on the Dashboard until the first transaction exists): banner with progress, step 1 payment methods (with logos), step 2 add spending or import, step 3 categories (optional), then "When you're ready": split with your partner, split with friends.
- **Wording:** the scope selector reads **Mine / Everything** and defaults to **Mine** (profile default changed accordingly; stored values are still `personal`/`household`). "Household" card is now **Sharing**. Login and settings copy rewritten.
- **Payment-method logos** now also appear on the payment-method chips (Add form, its "more" popup, Import) and in Settings.
- **Open product question (not decided, not built): should your personal expenses be hidden from your partner?** Today every member of a space sees every record, because the data model was household-first. If personal must stay private, records need an owner and visibility (private by default; shared only when split), with matching Firestore rules and tests. Recommended: private by default.

## Import: Amex India PDF (built; verified on one real statement locally; not yet on Vercel)
- Details in `docs/IMPORT_PIPELINE.md`. New: `src/domain/import/pdf/*` (parser, shared invented test layouts), `src/lib/import/pdf.ts` (unpdf reader), PDF path in `src/lib/import/service.ts`, `acceptMismatch` in `/api/import`, checks panel + confirmation in the Import screen, `format: "pdf"` + `checksPassed`/`acceptedMismatch` on `ImportBatch`.
- Fixed: the duplicate heuristic ignored direction, so a refund looked like a duplicate of its own purchase; it now compares direction (regression test added).
- Tests: parser 8, PDF service 7, direction-aware dedupe 1, file sniffing updated; opt-in real-statement test (counts only). The real statement is never committed.
- Unverified: unpdf inside Vercel's runtime (works in a local production build). If a PDF upload returns 500 on the live site, ask the owner for the Vercel runtime log line (see DECISIONS #7 for the previous Vercel surprise).

## Import: CSV and Excel (built; real-database test passes; not yet tried by the owner on a real statement)
- Live Import screen (`/import`), upload route (`/api/import`), pure parsing library (`src/domain/import/`), service (`src/lib/import/service.ts`), file reader (`files.ts`), data model (`importBatches`, `rawTransactions`) in types, schemas, both repositories, rules and contract tests. Details and limits: `docs/IMPORT_PIPELINE.md`.
- Tests: parsing (19), service (10), file reading incl. a real .xlsx round trip (8), repository contract (+1), rules (+1), real-Firestore end-to-end import (opt-in). Rule matching now also matches statement text containing a rule's merchant ("SWIGGY BANGALORE IN" matches "Swiggy").
- Local helper `scripts/describe-statement.mjs` (masked structure of PDF/CSV/XLSX) tested on synthetic files with fake personal details. `pdfjs-dist` is a dev dependency used only by that script.
- **Not built:** PDF statements for other issuers (HDFC, SBI, ICICI Coral cards and bank PDFs; each needs its own parser with total checks), screenshots, keeping the original files (needs Cloud Storage/Blaze), receipts. The parsers need real layouts: run the masking script on your statements and share its output.
- Possible gaps to expect on first real use: header names a bank uses that are not in `columns.ts`, a date or amount style not yet seen, a bank CSV with a different sign convention. All of these show up as unreadable rows or wrong directions in the preview and are cheap to add once seen.

## App name and the 64/36 split (added)
- The app is now called **Personal Finance App** (header, login, browser title, PWA name; short name "Finance" on the Home Screen; the GitHub repo and Vercel project names are unchanged). iPhone users should remove and re-add the Home Screen icon to pick up the new name.
- Split presets for you and Varru: **"Vimal 64 · Varru 36"** and **"50 / 50"** (plus Just me, Custom, and Everyone when there are 3+ people). The 64% always goes to the **household owner** (participant of `household.ownerUid`), not to whoever is signed in, so the same expense splits identically on both phones. The ratio lives in `OWNER_SHARE_BPS` (`src/domain/defaults.ts`, 6400) and is built by `ratioSplit` (`src/domain/splits.ts`, tested exact to the paisa). Switching the editor to the % tab with exactly you and Varru also pre-fills 64/36. Changing the ratio today means editing that constant; a per-household setting is a possible follow-up.
- Fixed a dev-mode warning: the layout now calls `connection()` before reading the date.

## Stage 3 slice 5: real data (built; real-database tests pass; not yet exercised by the owner in the live app)
- **Two modes.** Signed in with Firebase configured = live: the `(app)` layout loads the household's data (`loadHouseholdData`) and passes it to `StoreProvider` (`live` prop). No Firebase config = demo mode with the fictional data. A signed-in user never sees demo data: no household shows an empty state with a prompt; a load failure shows an error card.
- **One write path.** Every change is optimistic in the browser and sent to `POST /api/data`, which verifies the session cookie, finds the household from membership (never from the request), validates with Zod, applies it via `applyAction` (`src/lib/data/actions.ts`) and writes an audit event. Actions: record create/update/approve/reject, settlement create/void, category add/rename/delete(+move), rule put/remove, account add/suggested, participant add. A failed save shows the server's message and re-syncs.
- **Storage:** Firestore under `households/{id}/` (`records`, `settlements`, `receipts`, `recurring`, `participants`, `accounts`, `categories`, `merchantRules`, `auditEvents`), each doc with `schemaVersion: 1`. `src/data/firestore-repository.ts` implements the same `Repository` contract as the memory version (shared contract tests). Imported bank fields are protected in code and rules; `merchantRules` and the audit collection are server-only (rules deny clients).
- **First run:** `ensureHouseholdReady` (idempotent, runs on load) seeds default categories and a participant per member linked to their account (`u_<uid>`). The Dashboard shows a setup card; Settings lets you add payment methods (one-click "my usual" list) and friends. "Me" in splits is the participant linked to the signed-in user.
- **Rules of the road:** manual entries (Add button) are saved immediately as reviewed. Reject deletes a queued row and records an audit event (the raw bank row will be kept once real imports exist).
- **Not in live mode yet:** statement import (Import screen says so; needs parsers + file storage), receipts (no upload yet), recurring items (screen exists but no way to create them yet), data export/restore (a basic JSON download exists), "delete household data". Concurrent edits by two people show after a reload (no live sync).
- Tests: +14 action tests, +4 loader tests, repository contract (memory always; real Firestore opt-in), real-database end-to-end test (`tests/integration/firestore-actions.test.ts`). 100 unit tests, 24 rules tests pass.

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
Priorities live in [ROADMAP.md](../ROADMAP.md) (owner's order: own spending, then partner, then friends). The immediate ones: approve the first real Amex import; clean merchant names; automatic capture via iPhone Shortcuts (route 1) with forwarded alert emails as backup (route 2); more issuers' PDF parsers; the open question on hiding personal expenses from the partner. Keep this file for build and test status, not for planning.

## Smart import, delete with confirmation, big-screen layout (October 2026)
- **Smart import:** merchant memory + Claude for unknown merchants (see IMPORT_PIPELINE.md). Needs `ANTHROPIC_API_KEY` set in Vercel (Production) and a redeploy; until then the import uses memory and rules only. Not yet verified with the real API (tests use a fake Claude); verify with one real statement and check the token count shown in the preview.
- **Delete:** new `record.delete` action (audited). Trash button per row and "Delete N" in the review queue, a Delete button in the transaction edit and review dialogs, and confirm pop-ups for voiding a settlement and removing a rule. Every delete asks first.
- **Layout:** the app frame is wider (90rem) and the root font size steps up on 1700/2200/3000 px screens, so big monitors scale the whole app. The setup hero has a segmented progress panel; setup steps sit in two columns on wide screens.

## Import redesign: AI sensing, manual popup, paste/describe (added, not yet run live)
- Import screen has three entry points: **Import with AI** (pick a file, no payment method needed), **Import a statement file** (popup: choose the payment method, then the file; no AI), **Paste or describe** (popup with a text box: *Read as table* needs no AI, *Read with AI* reads free text such as "paid 450 at Swiggy yesterday via GPay"). Everything lands in the review queue as unreviewed.
- The payment method is sensed from the statement's own wording (`src/domain/import/sense.ts`, no AI). If unclear, the screen asks; the preview always shows the choice with chips to change it.
- Per-row routing (`src/domain/import/channel.ts`): a bank row naming GPay/PhonePe/etc. is filed under that UPI app with `fundedBy` = the bank; card-bill payments read "Payment to <card>" and never count as spending. A UPI app row and its funding bank row are flagged as a *possible* duplicate.
- Claude is a fallback and only after the person clicks the AI button or "Read with AI" (`ai=1` is required by the server, no key means the buttons say Off). It sees redacted text only (`redactStatement`). For statements a row is kept only if its amount and the start of its description appear in the text; the rest are listed as "could not be found". Batches record `readBy: "parser" | "ai"` and `format: "text"` for pasted text.
- Tests: sense, channel, dedupe, service routing/text input, ai-extract (redaction, grounding, injection prompt, fake fetch), intake.
- **Not verified:** a real Claude call (the key is on Vercel only), upload through the new routes on Vercel, the screens in a browser.

## Add and remove friends (added)
- Settings > People in splits: add a friend by name (existing) and remove one with a trash icon. Removal always asks first ("Keep it" / "Remove friend"). A friend who appears in any transaction (approved or waiting), split, settlement or recurring item cannot be removed: the dialog says where they are used, because deleting them would change who owes what (settlements are never deleted). People with an account are not removable here. Server action `participant.delete` enforces the same rule (`src/domain/friends.ts`), with an audit entry. Checked in the browser (demo data); not yet on the live site.

## Invited partner is usable in splits before they accept (added)
- Inviting a partner now asks for their name. The invited person appears at once in the transaction form and split presets ("Varru 64 · Vimal 36", "(invited)" in the people list), stored in your own space as a participant with `pendingEmail` (`src/lib/data/pending-partner.ts`). Splits made with them are saved on your side. When they accept, every record and recurring item that used the temporary id is rewritten to their real participant id (percentages kept) and the temporary person is removed. Cancelling or replacing the invitation removes an unused pending person, or turns one already used in a split into a plain friend. Pending people cannot be removed with the friend trash icon.
- Tests: pending-partner (appear, replace, cancel, adopt, wrong email). Not exercised on the live site: invite, then use the name in a split, then accept from the partner's account.

## Usual split chosen at invite time (added)
- The invite form has "Your usual share" chips (50/50, 60/40, 64/36, 70/30), pre-set to 64/36 (you carry 64%). It is stored on the pending partner (`inviterShareBps`), so the split presets show "You 64 · Them 36" before they accept; on acceptance it becomes the couple's usual split (inviter as leader) via `setSplitRatio`. Either partner can still change it under Partner. Invitations sent before this have no share and stay 50/50 until you cancel and re-send, or link and set it.

## Every Splitwise way to split, plus item-wise (added)
- New split modes in the domain (`src/domain/splits.ts`, tested in `splits-modes.test.ts`): **Shares** (2 shares pay twice 1 share; 0 shares pays nothing, which also gives the "X owes all" / "I owe all" presets), **Adjustments** (split equally after taking each person's +/- adjustment out), **By item** (items with who shared each; tax, tip, fees or a discount = bill total minus items, shared in proportion to each person's items; BigInt maths so nothing overflows). Existing: equally, exact amounts, percentages, one person. `SplitConfig` gained `items`; the Zod schema validates it and rejects items that do not fit.
- The split editor (`src/components/split-editor.tsx`) has a "More ways to split" panel: a type picker with a one-line explanation for each, a row per person with the right input (%, amount, +/- stepper, adjustment), live "adds up / left to assign" feedback, and for items an itemised list with person chips, a tax/tip line and each person's total. Checked in the browser (demo, phone width): a ₹1,180 bill with ₹800 and ₹200 items splits 944 / 236 and saves.
- Mobile fix: Settings no longer overflows sideways on a phone (grid columns now `minmax(0,1fr)`).
- Not done: Splitwise's "repeat expense" and group simplify-debts; receipts/photo scan for items.

## "Split with" then "How" (added)
- The split row in the transaction form is now two steps: **Split with** (Just me, or tick one or more people) then **How** (for one person: the usual ratio such as "Vimal 64 · Varru 36", 50 / 50, "X owes all", "I owe all", More ways; for a group: Equally, More ways). An invited partner who has no saved share falls back to 64/36 as the usual split.

## Import screen: simpler, months and duplicate choices (added)
- Import screen decluttered: three plain entry cards (AI, choose bank then file, paste or describe), AI privacy notes moved into one "How AI is used here" disclosure, a short "Earlier imports" list. After reading, the preview leads with three numbers (will be added / already have / could not read), a **Goes into** strip showing each month the statement touches with counts (a 15 Aug to 15 Sep statement lands in Aug and Sep, because every transaction counts in the month it was paid), a duplicates panel, then the send button; rows, totals and AI details sit in a collapsed "See all rows".
- Duplicates: each row that matches an entry you already have shows what it matches (merchant, date, approved or waiting) with **Skip / Add anyway**, plus Skip all / Add all anyway. Exact repeats default to Skip; close matches default to Add (flagged). The server applies `decisions` (`{line: "import"|"skip"}`) in `prepare`; forced rows are marked `duplicateOf`. The review queue banner names the months.
- Not verified in a browser (the live import screen needs a signed-in session); covered by service tests.

## Categories on phones and modern dropdowns (added)
- Categories & rules is laid out for phones: single column, stacked "Add category", larger tap targets (40px icons), rename row wraps, rules truncate instead of overflowing, full-width buttons; the stale "Not persisted yet" badge now shows only in the prototype.
- `Select` (`src/components/ui.tsx`) is a custom dropdown with the same `<option>` children API: a soft floating list under the button on desktop (arrow keys, Enter, Escape, type-to-jump, checkmark on the current choice), and a bottom sheet with 48px rows on phones. Used by Transactions filters, Reports and Settle up. The Type filter now reads "Purchases / Card bill payments" instead of raw codes.

## Recurring payments you can add and edit; one-tap settle up (added)
- **Recurring** now has an **Add recurring** form (name, usual monthly amount, due day, category, where, and the same **Split with / How** editor as a normal expense, so the usual split with your partner such as 64/36 is pre-filled) plus edit and remove on every row (remove asks first; linked payments stay but are unlinked). Server actions `recurring.put` / `recurring.delete` validate the category, payer and split and write audit events; tests in `actions.test.ts`. Rows are laid out for phones; the empty state invites you to add the first one.
- **Settle up:** every balance has a **Settle** button that asks "Varru paid Vimal ₹12,613.95?" with "Yes, settled in full" or "Part payment…" (the existing form), and a **Remind** button (when you are owed) that opens the phone's share sheet, or WhatsApp, with a friendly message. Balance rows no longer overflow on a phone.
- Not built: a UPI pay link inside the reminder (needs each person's UPI ID stored in their profile), shared recurring items inside the couple space, auto-detecting recurring patterns.

## "Repeat every month" from any transaction (added)
- The Recurring row in the add/edit/review form now ends with **Repeat every month**. Choosing it creates a recurring item from the payment (name = merchant, usual amount, due day = the payment's day, category, payer, split) and links the payment to it, so it shows under Recurring as paid. Before, the row only offered "None" until recurring items had been created by hand. Checked in a browser (demo): the payment shows under Recurring as Paid.

