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
