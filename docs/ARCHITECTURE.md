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
