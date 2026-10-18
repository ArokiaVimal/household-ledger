# Project context (short)

**Purpose (in this order):** 1) one person tracks their own spending and categories, 2) splits expenses with their partner, 3) splits with friends (non-account participants): import statements, categorize, split, settle, report. Mobile-first PWA (iPhone Safari).

**Stack:** Next.js (App Router, TS), Tailwind, shadcn-style primitives, Recharts, Zod, React Hook Form (Stage 3 forms), Firebase Auth/Firestore/Storage (Stage 3), Vercel. Vitest for tests.

**Layers:** `src/domain` (pure financial logic, tested) · `src/data` (mock data now; Firebase adapter later) · `src/components` (UI) · `src/app` (routes).

**Invariants:** integer paise; one `signedSpend` rule for spending; refunds subtract; cc payments/transfers/income excluded; settlements never create expenses; raw imports immutable; matches reversible; dedupe never merges on amount alone; household access enforced by Firebase rules, not UI.

**Current scope:** Stages 1–2 (prototype on mock Sept 2026 data). Stage 3+ not started. See `DEVELOPMENT_STATUS.md`.

**Detail docs:** PRODUCT_SPEC · ARCHITECTURE · DATA_MODEL · SECURITY · IMPORT_PIPELINE · DECISIONS · TESTING · DEPLOYMENT (all in `docs/`).

**Conflict order:** code+tests > approved decisions > product spec > notes.
