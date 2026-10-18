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

## Household data (implemented in slice 5)
Paths: `households/{id}/{records|settlements|receipts|recurring|participants|accounts|categories|merchantRules|auditEvents}/{docId}`. `records` holds both the ledger (`status: reviewed`) and the review queue (`status: unreviewed`). Participants of members are `u_<uid>` with `userId` set; friends are `p_<name>-<rand>` with `userId: null`. Merchant rule ids are `r_<slug(merchant)>` so a merchant has one rule. Not yet: `rawTransactions`, `importBatches` (written by the real importer).

## Couple space (added)
`users/{uid}`: `householdId` (personal space) and `coupleId` (couple space, kept after unlinking). `households/{id}`: `kind` ("personal" | "couple"), couple only: `splitRatio {leaderUid, leaderBps}` (absent until chosen), `endedAt`, `endedBy`. Couple subcollections: `members`, `participants` (ids `u_<uid>`, the same ids used in each personal space), `sharedExpenses` (`SharedExpense`: id = source record id, ownerUid, payerId, date, merchant, amountPaise, kind, categoryId, categoryName, split, note?, voided?, createdAt, updatedAt), `settlements`, `auditEvents`. `ExpenseRecord` gains `sharedWithPartner` and `shareNote`.
