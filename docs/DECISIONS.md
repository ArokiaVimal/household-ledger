# Decisions
1. **Next.js 16 + Tailwind 4 + pnpm 9, Node 22** — current create-next-app defaults.
2. **Own shadcn-style primitives** instead of the shadcn CLI — fewer files/tokens, same Radix-free patterns; revisit if complex widgets are needed.
3. **Prototype merges raw txn + expense** into `ExpenseRecord`; separate in Stage 3 per data-model spec.
4. **Percent splits in basis points**; largest-remainder rounding; equal remainder to earlier participants.
5. **Pairwise balances** (not global simplification) so "who owes whom" is traceable to expenses.
6. **Prototype state in React context**, not localStorage, to avoid implying persistence.

7. **firebase-admin pinned to 13.10.x (not 14).** v14 requires `jwks-rsa@4` -> `jose@6` (ESM-only), which fails to load on Vercel's Node runtime. v13 uses `jwks-rsa@3` -> `jose@4` (CommonJS-compatible). Revisit when a v14 release fixes this; verify on a real deploy.

8. **Personal first, sharing second (owner's direction).** The primary use is one person tracking their own spending; splitting with a partner is second, friends third. Consequences: a private space is auto-created at first sign-in; "household" is internal only; invites are by verified email; the default scope is Mine. Not yet decided: whether personal records are hidden from the partner (see DEVELOPMENT_STATUS).
