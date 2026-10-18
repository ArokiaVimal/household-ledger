# Data model

Money: integer **paise**, `currency` stored per record (INR only now; add `normalizedCurrency` if multi-currency arrives). Dates: `date` = purchase date (used by reports), `postedDate` = bank posting.

Implemented in code (`src/domain/types.ts`): `ExpenseRecord`, `SplitConfig`, `Participant`, `Account`, `Category`, `Settlement`, `Receipt`.
The prototype merges raw transaction + expense into `ExpenseRecord`; shares are *derived* by `computeShares`, never stored separately yet.

Planned collections (Stage 3), all under `households/{householdId}/…`: members, participants, accounts, importBatches, rawTransactions (immutable), expenses, expenseShares, settlements (append-only with `voided`/correction links), categories, merchantRules, receipts, matches, auditEvents. Every doc: `id`, `createdAt`, `updatedAt`, `schemaVersion`.

`ExpenseRecord.fundedBy` = bank account behind a UPI payment; `recurringId` links to a `RecurringItem` (monthly commitment with due day and expected paise).
Kinds: purchase, refund, income, transfer, cc_payment, fee. Only purchase/fee/refund affect spending.
Split: `personal | equal | percent(basis points) | custom(paise)`; equal-split remainder goes to earlier participants in list order.
Migrations: versioned scripts in `migrations/` (not yet created).

## Auth-side collections (implemented)
`users/{uid}`: profile fields + `householdId`. `households/{id}` {name, ownerUid, createdAt}; `households/{id}/members/{uid}` {email, displayName, role, joinedAt}; `invites/{sha256(code)}` {householdId, email, createdBy, createdAt, expiresAt, usedAt?}. Written only by server routes.
