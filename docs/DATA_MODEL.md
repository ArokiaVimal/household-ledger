# Data model

Money: integer **paise**, `currency` stored per record (INR only now; add `normalizedCurrency` if multi-currency arrives). Dates: `date` = purchase date (used by reports), `postedDate` = bank posting.

Implemented in code (`src/domain/types.ts`): `ExpenseRecord`, `SplitConfig`, `Participant`, `Account`, `Category`, `Settlement`, `Receipt`.
The prototype merges raw transaction + expense into `ExpenseRecord`; shares are *derived* by `computeShares`, never stored separately yet.

Planned collections (Stage 3), all under `households/{householdId}/…`: members, participants, accounts, importBatches, rawTransactions (immutable), expenses, expenseShares, settlements (append-only with `voided`/correction links), categories, merchantRules, receipts, matches, auditEvents. Every doc: `id`, `createdAt`, `updatedAt`, `schemaVersion`.

Kinds: purchase, refund, income, transfer, cc_payment, fee. Only purchase/fee/refund affect spending.
Split: `personal | equal | percent(basis points) | custom(paise)`; equal-split remainder goes to earlier participants in list order.
Migrations: versioned scripts in `migrations/` (not yet created).
