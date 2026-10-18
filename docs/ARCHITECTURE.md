# Architecture

```
src/domain   pure TS: types, money, splits, reports, balances, dedupe  (no framework imports)
src/data     data access. Today: in-memory mock store. Stage 3: Firebase adapter behind the same interface
src/components  UI primitives (ui/), app shell, charts, split editor
src/app      Next.js routes (App Router)
```
- Every number shown in the UI is computed by `src/domain`; components only format.
- Prototype state lives in a React context (`src/data/store.tsx`) and is **not persisted**.
- Planned: storage/auth/parsing/email ingestion behind interfaces; Firebase specifics isolated in `src/data/firebase/`. Provider-specific behaviour (security rules language, Storage signed URLs) cannot be ported and is documented in SECURITY.md.

## Data access (slice 1)
UI and server routes should depend on `Repository` (`src/data/repository.ts`). Writes are validated by Zod schemas (`src/data/schemas.ts`). Today only the in-memory implementation exists; the prototype store is not yet routed through it.
