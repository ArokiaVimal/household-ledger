# Decisions
1. **Next.js 16 + Tailwind 4 + pnpm 9, Node 22** — current create-next-app defaults.
2. **Own shadcn-style primitives** instead of the shadcn CLI — fewer files/tokens, same Radix-free patterns; revisit if complex widgets are needed.
3. **Prototype merges raw txn + expense** into `ExpenseRecord`; separate in Stage 3 per data-model spec.
4. **Percent splits in basis points**; largest-remainder rounding; equal remainder to earlier participants.
5. **Pairwise balances** (not global simplification) so "who owes whom" is traceable to expenses.
6. **Prototype state in React context**, not localStorage, to avoid implying persistence.
