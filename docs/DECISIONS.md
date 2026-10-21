# Decisions
1. **Next.js 16 + Tailwind 4 + pnpm 9, Node 22** — current create-next-app defaults.
2. **Own shadcn-style primitives** instead of the shadcn CLI — fewer files/tokens, same Radix-free patterns; revisit if complex widgets are needed.
3. **Prototype merges raw txn + expense** into `ExpenseRecord`; separate in Stage 3 per data-model spec.
4. **Percent splits in basis points**; largest-remainder rounding; equal remainder to earlier participants.
5. **Pairwise balances** (not global simplification) so "who owes whom" is traceable to expenses.
6. **Prototype state in React context**, not localStorage, to avoid implying persistence.

7. **firebase-admin pinned to 13.10.x (not 14).** v14 requires `jwks-rsa@4` -> `jose@6` (ESM-only), which fails to load on Vercel's Node runtime. v13 uses `jwks-rsa@3` -> `jose@4` (CommonJS-compatible). Revisit when a v14 release fixes this; verify on a real deploy.

8. **Personal first, sharing second (owner's direction).** The primary use is one person tracking their own spending; splitting with a partner is second, friends third. Consequences: a private space is auto-created at first sign-in; "household" is internal only; invites are by verified email; the default scope is Mine. Not yet decided: whether personal records are hidden from the partner (see DEVELOPMENT_STATUS).
9. **unpdf for PDF text (not pdfjs-dist directly).** unpdf ships a serverless-friendly pdf.js build (no worker/canvas), which suits Vercel functions; `pdfjs-dist` stays a dev dependency only for `scripts/describe-statement.mjs`. Parsers read text positions per issuer and refuse unknown layouts; every parser must self-check against the statement's own totals and block the import on mismatch.

## 10. Import suggestions: memory first, Claude only for new merchants
Statement lines are matched against a per-household merchant memory that grows from the user's own approvals; only merchants never seen are sent to Claude (Haiku tier, batched, one forced tool call, cached prefix, minimal fields, digits hidden). Results are cached into memory so each merchant is paid for once. User decisions always overwrite AI guesses; nothing is auto-approved. Chosen over sending every row (cost, privacy) and over rules only (no learning). The key is a server env var; the feature is off without it.

## 11. Privacy by space: personal space + optional couple space (supersedes the open question in 8)
Every user has a private personal space holding everything of theirs (records, review queue, raw rows, import batches, audit, payment methods, merchant memory). Two people may link into a **couple space** that holds only `sharedExpenses` (redacted copies), settlements, shared participants and the split ratio. Sharing = choosing a split that includes the partner; the server writes the copy (id = the private record's id, so retries are safe) and the private record never leaves its space. Chosen over an owner/visibility flag inside one shared space because Firestore rules cannot hide individual fields, and because unlinking becomes trivial (each keeps their own space). A partner sees merchant, amount, date, category (name), kind, split, payer, and the note only if the owner opted in; never the bank text, the card, the import details. Only the owner edits or withdraws a copy (voided, not deleted). The usual split is a per-couple setting (default 50/50, asked once after linking); nothing is hard-coded to any names.

## 12. Product direction: people and groups first (2026-10-21, supersedes the order in 8)
The app is a general expense tracker plus Splitwise-style splitting for one person, a couple, friends, family or colleagues. A linked partner is one optional personalised layer (Settings), not the core. Onboarding asks who you split with; the Split tab holds People and Groups.

## 13. "Household" stays an internal name (2026-10-21)
The `households/{id}` collection, the access rules and the audit `entity` value keep the name. Renaming would migrate real data and rewrite security rules for no user-visible gain. On screen it is never shown. If it is ever renamed it is its own tested migration (ROADMAP).

## 14. No Mine/Household view; Payment Groups are the lens; "Shared" means split with others (2026-10-21)
The Mine/Everything (household) default-view setting and its dead code were removed; the app always opens on Mine and Payment Groups cover every other lens. "Shared" means only the expenses you split with other people, never what a partner paid for the home.

## 15. Imports never skip a repeat on their own (2026-10-21)
An exact repeat of an existing row is added and flagged with what it matches; the person chooses Skip per row. Different bank references inside one file are different payments (no "possible duplicate"). Automatic captures (SMS, Gmail) still leave out an exact repeat because nobody is watching.

## 16. UPI mode and bank/card source are derived from the bank's own text (2026-10-21)
`src/domain/payment-mode.ts` classifies at read time from the immutable original description and the payment method, so it works for old rows and needs no stored tag or repair. If a stored tag is ever needed, add it as an editable override, not a replacement.

## 17. Own transfers and card bills on import (2026-10-21)
Bank wording for card bills (CC BillPay, IB BILLPAY, FUND TRF CC, card issuers over UPI) is a card payment; a UPI payment to yourself (name or UPI id) is a transfer. Both are never spending. Identity comes only from the signed-in session; with no identity nothing is guessed. Old rows are not re-tagged automatically (ROADMAP).

## 18. Pay with UPI opens the app; it never pays (2026-10-21)
The button builds a `upi://pay` link from a contact's UPI id. The person confirms in their own UPI app; the payment is recorded afterwards by hand. No UPI credentials or PINs are ever handled.

## 19. Simplify payments follows Splitwise (2026-10-21)
Per split group: on = the exact fewest payments (circles that cancel out first); off = each person pays the people who paid for them, netted per pair. Balances are identical either way.
