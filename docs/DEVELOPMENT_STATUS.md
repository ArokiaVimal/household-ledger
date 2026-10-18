# Development status

Updated: 2026-10-18 · Branch `feat/domain-core` · Stage 1–2 complete (prototype). Stage 3+ not started.

## Implemented and verified
- Domain (`src/domain`): integer-paise money, equal/percent/custom splits (deterministic remainder), spending rules (refunds subtract; cc payments, transfers, income, excluded ignored), pairwise balances with settlements/voids, duplicate detection (reference id exact; date+amount+merchant possible), receipt match suggestions.
- Tests: `pnpm test` → 21 passing (domain + mock-data reconciliation). `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.
- UI on 42 fictional Sept 2026 records: Dashboard (clickable charts → filtered Transactions), Transactions (search/filters, table + mobile cards, edit dialog with split editor), Settlements (record/void/partial), Receipts (suggest/link/unlink), Categories & rules (apply to unreviewed), Reports, Settings (members, participants, accounts, mock JSON export, delete-confirm dialog), Import centre (simulated), PWA manifest, mobile bottom nav.
- Manual check: dashboard and mobile transactions/edit dialog viewed in browser at 375px and desktop. Other screens were built but only dashboard/transactions/import were eyeballed.
- Docs, CI workflow (`.github/workflows/ci.yml`, not yet run on GitHub), `.env.example`.

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
1. Merge `feat/domain-core` to `main` after review (no remote configured yet; create the GitHub repo and push).
2. Stage 3: Firebase dev project, `src/data` adapter interface + Firestore implementation, Zod schemas, rules + emulator tests (cross-household denial first).
3. Split raw transactions from expenses in the data model; add export/restore round-trip test.
4. Stage 4: CSV parser with real file-hash dedupe, then XLSX, then PDF.
