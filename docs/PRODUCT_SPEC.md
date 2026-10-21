# Product spec

Users: **Anyone with a Google sign-in**. Each person has a private space. They split expenses with **people** (a linked partner, friends, family, colleagues) and **groups** (trips, outings, flatmates). A partner is one optional kind of link; people without an account are participants and can be linked to one later.

Screens: Dashboard, Transactions, Import centre, Receipts/matching, Settlements, Categories & rules, Reports, Settings (household, members, participants, accounts, export, privacy).

Key workflows: import → preview → duplicate check → review → save; edit/split/exclude without losing the original; match receipt to card transaction (reviewable, reversible); record settlements and corrections with audit trail.

## Acceptance criteria (status in DEVELOPMENT_STATUS.md)
- Separate sign-in for each member; shared household data; friends need no account.
- Import supported statements with preview; re-upload doesn't double count.
- Receipt ↔ card transaction matched to one expense.
- Equal/percent/custom splits exact to the paise.
- Refunds reduce net; cc payments/transfers don't inflate spending.
- Settlements adjust balances without creating expenses.
- Dashboard reconciles with transactions.
- Files private; unauthorized access denied (rules tests).
- Works on iPhone Safari; installable PWA.
- Data genuinely persisted in production.
