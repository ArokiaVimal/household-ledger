# Project context (short)

**Purpose (in this order):** 1) one person tracks their own spending and categories, 2) splits expenses with their partner, 3) splits with friends (non-account participants): import statements, categorize, split, settle, report. Mobile-first PWA (iPhone Safari).

**Stack:** Next.js (App Router, TS), Tailwind, Recharts, Zod, React Hook Form (login/profile), Firebase Auth + Firestore (Admin SDK from server routes), unpdf + read-excel-file for statements, Vercel, Vitest. Cloud Storage for files is not used yet.

**Layers:** `src/domain` (pure financial logic and statement parsers, tested) · `src/data` (repository interface with memory and Firestore implementations, Zod schemas, mock data for demo mode) · `src/lib` (auth, households, data actions, import service, server only) · `src/components` (UI) · `src/app` (routes and API routes).

**Invariants:** integer paise; one `signedSpend` rule for spending; refunds subtract; cc payments/transfers/income excluded; settlements never create expenses; raw imports immutable; matches reversible; dedupe never merges on amount alone; household access enforced by Firebase rules, not UI.

**Current scope:** live app with real saved data; Google sign-in; personal-first private space with optional partner sharing; CSV, Excel and Amex India PDF import with a review queue. Not built: other issuers' PDFs, automatic capture, receipts, file storage. Exact state: `DEVELOPMENT_STATUS.md`; plan: `../ROADMAP.md`; plain-language overview: `../PROJECT.md`.

**Overview and plan:** `../PROJECT.md` (what the app is), `../ROADMAP.md` (what is next).

**Detail docs:** PRODUCT_SPEC · ARCHITECTURE · DATA_MODEL · SECURITY · IMPORT_PIPELINE · DECISIONS · TESTING · DEPLOYMENT (all in `docs/`).

**Conflict order:** code+tests > approved decisions > product spec > notes.
