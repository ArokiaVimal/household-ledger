# Testing
- `pnpm test` (vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm build`.
- Domain tests: `src/domain/domain.test.ts` (splits, refunds, settlements, dedupe, receipt matching).
- Data layer: `src/data/schemas.test.ts`, `src/data/memory-repository.test.ts`, `src/lib/env.test.ts`, `src/data/mock.test.ts`.
- Real-database integration (opt-in, dev project only): `RUN_FIRESTORE_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration`.
- Not yet written: rules tests (needs Firebase emulator), export/restore round trip, parser tests, UI tests.
- Manual: run `pnpm dev`, check each screen at desktop and 390px width; dashboard totals must equal the Transactions list for the same filter.
