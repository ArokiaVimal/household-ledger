# Testing
- `pnpm test` (vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm build`.
- Domain tests: `src/domain/domain.test.ts` (splits, refunds, settlements, dedupe, receipt matching).
- Not yet written: rules tests (needs Firebase emulator), export/restore round trip, parser tests, UI tests.
- Manual: run `pnpm dev`, check each screen at desktop and 390px width; dashboard totals must equal the Transactions list for the same filter.
