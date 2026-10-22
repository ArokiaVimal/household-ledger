# Handoff: read this first

For anyone (a person, a new developer, or any AI coding tool on any account or device) picking this project up. Everything needed is in this repository; nothing depends on a chat history, a private memory or one person's machine. If you learn something that would help the next person, write it here or in the file named in the table below, in the same commit as your work.

*Last reviewed: 2026-10-21.*

## 1. Reading order
| Step | File | Why |
|---|---|---|
| 1 | this file | Direction, decisions, rules, where things are |
| 2 | [AGENTS.md](../AGENTS.md) | Hard rules for every contributor and every AI tool (canonical) |
| 3 | [PROJECT.md](../PROJECT.md) | What the app is, in plain language |
| 4 | [ROADMAP.md](../ROADMAP.md) | What is built, what is in progress, what is later |
| 5 | [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) | Exact state, newest entries at the bottom, with limits and what was verified |
| 6 | [DECISIONS.md](DECISIONS.md) | Why choices were made |
| 7 | [SETUP_AND_ACCESS.md](SETUP_AND_ACCESS.md) | Set up a new device, share the app, add collaborators |
| 8 | detail docs as needed | ARCHITECTURE, DATA_MODEL, SECURITY, IMPORT_PIPELINE, FRIENDS_FAMILY_LINKING, TESTING, DEPLOYMENT |

Conflict order when documents disagree: **code and tests > decisions > this file > product spec > notes.** Then fix the document that was wrong.

## 2. What the product is (since 2026-10-21)
A **general expense tracker plus a Splitwise-style splitting app**, private and mobile-first (an installable PWA), for one person, a couple, friends, family or colleagues.
- **Track your own money:** import statements (CSV, Excel `.xlsx` and old `.xls`, PDFs for Amex India, HDFC credit cards, ICICI Bank accounts and ICICI credit cards), review and verify, categories, reports, card bills, recurring payments. AI helps only when asked.
- **Split with anyone:** the **Split** tab has *People* and *Groups*. People are contacts (with or without accounts). Groups are trips, dinners, flatmates. Settle up with the fewest payments (or each person pays who paid for them, a per-group switch), record payments, pay by UPI link, export a group to CSV.
- **Couples are a personalised layer, not the core.** Linking a partner is one optional feature in Settings (partner pin, nickname, usual split ratio, shared view). The app is fully usable with no partner.
- It started as a household/couple app; the code still says `household` inside (see section 4). Do not describe the product as couple-first or household-first in new copy.

## 3. Standing rules from the owner
The owner is **Vimal** (call them Vimal; never infer pronouns for anyone: use they/them when not stated). They are not a developer: explain outcomes in plain language and give exact click paths when they must do something (for example set a Vercel variable). They test on an **iPhone PWA** and a **27-inch monitor** and report problems by screenshot.

**How work is delivered**
1. Test in the browser before saying done (phone width 390px and a wide window). Run `pnpm lint`, `pnpm typecheck`, `pnpm test`. Never claim a test passed unless you ran it; say what was verified for real and what was only simulated.
2. Commit locally, then **ask the owner before each push to `main`** (a push deploys to Vercel and changes what real users see). Say what was pushed. Docs-only changes are pushed the same way.
3. Never paste keys, tokens or passwords in chat, commits, issues or docs. Real statements and real data never go in Git.
4. Reading the owner's real account is allowed only through the owner's own signed-in local session, read-only, and writes only after the owner approves that specific change. Keep exports minimal (the Firestore free quota was exhausted once).
5. Never touch other people's spaces or the shared couple/link spaces when asked to clear "my data".

**How the product looks and reads**
- **Label AI.** Anything produced by an AI model shows the AI badge (`AiBadge`). AI runs only after an explicit click, sees redacted text, and its answers are grounded against the source.
- **Confirm deletes.** Every delete or void asks first (`ConfirmDialog`).
- **Not crowded.** One clear main action per phone screen; when told "too crowded" or "make it modern", remove content first, then restyle. Hide fields that do not apply.
- **Short US English** in sentence case (categorized, color). Long explanations go in an info tip.
- **Real logos** from the vendor's own site in `public/logos`; confirm the right company first.
- Imported rows are **Unverified** until the owner verifies them; say Verified/Unverified, not Approved or Reviewed.
- **Build for other people too.** No owner-specific names, banks, merchants or ratios in code. Per-person data and settings instead. New banks/sources go behind small adapters. Optional features (AI key, capture) have a safe off state.

## 4. Decisions made since `DECISIONS.md` was started
Recorded in full as items 12 onward in [DECISIONS.md](DECISIONS.md). In short:
- **People and groups first.** Couple features sit on top of one general split model.
- **"Household" is an internal name only.** The `households/{id}` collection, security rules and the audit `entity` value keep it, because renaming means migrating real data and rewriting access rules for no visible gain. On screen the word is "space" or nothing. A rename can be its own carefully tested project (see ROADMAP).
- **No Mine/Household view switch.** Payment Groups are the only lens on spending; the app always opens on Mine. **"Shared" means only expenses you split with other people**, never what a partner paid for the home.
- **Exact repeats are never skipped on their own.** An exact duplicate row in an import is added and flagged ("Exact repeat" with what it matches); the person chooses Skip per row. Automatic captures (SMS, Gmail), where nobody is watching, still leave out an exact repeat.
- **Duplicate flags** name what they match. Two lines of one file with different bank references are different payments.
- **UPI and bank/card are derived, not stored.** `src/domain/payment-mode.ts` reads the bank's own text (`UPI/…` ICICI, `UPI-…` HDFC and ICICI cards) plus UPI-app accounts. Filters: `?mode=upi|other`, `?source=bank|card`. "Paid with" follows "From" (bank includes the UPI apps under it).
- **Card bills and own-account transfers on import:** more bank wording is a card payment (never spending); a UPI payment to yourself (by name or UPI id) is a transfer. The signed-in identity is passed in `ImportDeps.self`; without it nothing is guessed. Rows imported before this keep their old type.
- **Pay with UPI** only opens the person's UPI app with a prefilled `upi://pay` link. Nothing is paid or recorded from the app; the payment is recorded afterward as before.
- **Simplify payments** per group: on = the exact fewest payments; off = each person pays the people who paid for them, netted pairwise (like Splitwise).
- **Optional partner and onboarding:** Settings lists your people first and shows partner linking as a small optional card; onboarding asks "Who do you split with?" (partner, friends, family, colleagues, trips, just me; nothing required).

## 5. Vocabulary
| Word | Meaning |
|---|---|
| Space (code: household) | The container for one person's data: `households/{id}`. Everyone has a private personal space. |
| Couple space / link space | Server-written spaces that hold only the expenses two people share (`kind: "couple"` or `"link"`). |
| Participant / contact | A name you can split with. May be linked to a real account. |
| Payment group (on screen: **Spending view**) | A **lens on your own spending** (Mine, Parents…). Set up in Settings > Spending views. Not for splitting. The code and audit log still say "payment group". |
| Split group | A trip, dinner or flatmates group with balances and settle-up (`src/domain/split-groups.ts`). Records are tagged `splitGroupId`; a group never owns money. |
| Split tab | `/people` and `/groups` under one tab. |
| Verified / Unverified | Review state of a transaction. Unverified rows count nowhere until verified. |
| Raw row | A statement row exactly as read. Write-once. |
| Own transfer | Money moved between your own accounts. Not spending, not income. |

## 6. Where things live
| Area | Open |
|---|---|
| Pure business rules (money, splits, ledger, dedupe, classification, reports) | `src/domain/` (no React/Next/Firebase imports) |
| Statement readers | `src/domain/import/` (CSV/Excel layout, `pdf/` per issuer: `amex-india`, `hdfc-card`, `icici-bank`, `icici-card`), `src/lib/import/` (file intake, `.xls` via `xls.ts`, AI extraction, service) |
| Import screens | `src/app/(app)/import/` |
| Data access | `src/data/` (repository interface, memory + Firestore implementations, Zod schemas, demo data, `store.tsx` client state) |
| Server actions and routes | `src/lib/data/actions.ts` (every change goes through one validated path with an audit event), `src/app/api/*` |
| Accounts linking, shared expenses | `src/lib/links/`, `src/lib/data/couple.ts`, `docs/FRIENDS_FAMILY_LINKING.md` |
| Split groups | `src/domain/split-groups.ts`, `src/lib/data/split-group-actions.ts`, `src/app/(app)/groups` |
| Home, Transactions, Split, Settings | `src/app/(app)/page.tsx`, `transactions/`, `people/`, `groups/`, `settings/` |
| Shared UI | `src/components/` (`ui.tsx` primitives, `feedback.tsx` busy/error pop-ups, `chip-filter.tsx`, `upi-pay.tsx`) |
| Security rules | `firestore.rules`, `storage.rules`, tests in `tests/rules` (`pnpm test:rules`) |
| AI | `src/lib/import/ai*.ts`, `src/lib/insights`, usage tracking in `src/lib/ai-usage` and `src/domain/ai-usage.ts` |

## 7. Running it and working with others
**Step-by-step access guide (new device or Claude account, sharing the app, adding collaborators): [SETUP_AND_ACCESS.md](SETUP_AND_ACCESS.md).**

**Setup:** Node 22 (`nvm use`), `corepack enable`, `pnpm install`, `cp .env.example .env.local` and fill what you need. Without Firebase variables the app runs in demo mode (fictional data, no sign-in). Variable names are in `.env.example`; **values are never in Git.** The owner holds them in Vercel (Project > Settings > Environment Variables) and in their own `.env.local`.

**Signing in to the live app or a local app on real Firebase** needs the email on the `ALLOWED_EMAILS` list. A new collaborator must ask the owner to add their email. Prefer the Firebase emulator or demo mode for development so real data is never at risk.

**Branches and parallel work:** one branch per task (`feat/*`, `fix/*`), small focused diffs, and a **separate `git worktree` per parallel agent or person** so two checkouts never edit the same files (`git worktree add ../household-finance-<task> -b feat/<task> main`). Merge or push only when the owner says so. Run `pnpm lint && pnpm typecheck && pnpm test` before every commit; `pnpm test:rules` when rules change; `pnpm build` before a risky push.

**Commits:** short imperative subject saying what changed for the user, a body only when needed. AI tools add their own co-author line.

**Deploying:** a push to `main` deploys the app to Vercel automatically. Firestore and Storage rules are deployed separately with the Firebase CLI by someone with access to the Firebase project; say so in the hand-off when a change needs it. CI on GitHub is currently off (the workflow is saved as `docs/ci.yml.example`; enabling it needs a token with workflow permission), so the checks above are the gate until then.

**Reviews:** changes to `src/domain/*`, security rules, migrations or permissions need tests and a second pair of eyes (see CONTRIBUTING.md and CODEOWNERS).

## 8. Gotchas learned the hard way
- This is **Next.js 16** with `cacheComponents`: do not `export const dynamic` in routes; read `node_modules/next/dist/docs/` when an API surprises you. Server reads that the same-origin guard protects must be **POST**, because a GET without an `Origin` is refused.
- Firestore's free quota was exhausted once by a large export; keep real-data reads small.
- `firebase-admin` is pinned to 13.10.x (v14 breaks on Vercel's runtime).
- The current Claude model rejects a `temperature` parameter. AI calls are fetch-based with a forced tool call; usage is counted from the API's own `usage` field.
- PDF readers parse text **positions**, not reading order; columns differ between pages, so read cells in order. Every reader checks itself against the statement's own totals and blocks on a mismatch.
- Imports: a row's `line` must be 1 or more; the preview and commit must see the same rows; `commitImport` writes raw rows first, then records, then the batch, and rolls back on failure.
- `.xls` is read with the small `cfb` package plus our own BIFF8 reader (`src/lib/import/xls.ts`); `.xlsx` with `read-excel-file`.
- iPhone PWA: Safari sign-in works now; keep the self-heal safeguards in `src/components/pwa.tsx`; avoid navigation work inside effects without the `Promise.resolve().then` pattern the lint rules expect.
- Never commit `.env.local`, service-account keys, real statements or screenshots of real data.

## 9. In flight and open (update when it changes)
- **Comments on shared expenses** and **group invites by link** are being built on branch `feat/comments-and-invites` by the account-linking work (not merged). Design constraints: `docs/FRIENDS_FAMILY_LINKING.md`.
- Everything else not built is in [ROADMAP.md](../ROADMAP.md) under "Discussed but not built yet".
- **Owner to-dos that code cannot do** (need Vercel or real accounts): confirm the latest Vercel deploys succeeded; add the push-reminder variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`) and turn on Settings > Reminders on the iPhone; try bill scan and the Shopwise screenshot on real data; import the real ICICI bank, ICICI Coral card and HDFC `.xls` statements; delete the duplicate Amazon Pay ₹15,304.03 row (11 Oct) and verify the SBI Amazon row; clear old "Possible duplicate" flags (Keep both); decide the app name (a global, non-regional name; Tally, Evenly and Hearth were the front-runners).

## 10. Keeping this file true
Update the relevant section in the same commit as a change that makes it wrong. Put detailed status in `DEVELOPMENT_STATUS.md`, plans in `ROADMAP.md`, reasons in `DECISIONS.md`. If a rule here and in `AGENTS.md` ever differ, fix both in one commit.
