# Import pipeline (design; only the dedupe/match functions exist)

Flow: month → upload → detect source/type → parse → normalize → preview → duplicate check → review/categorize → confirm → summary.
Implemented now: `detectDuplicate`, `isFileAlreadyImported`, `suggestReceiptMatches` in `src/domain/dedupe.ts` (tested). The import UI is a **simulated** preview using mock rows.
Staging: parsed rows are planned with `planImport` (exact duplicates skipped, possible flagged), suggested categories come from `suggestCategory`, and rows go to a review queue as `unreviewed`. Rows enter the ledger only after manual approval in `/review`.
Dedupe order: file hash → bank reference id (per account) → possible match (same account/date/amount + alike merchant, flagged only). Amount alone never matches.
Planned: CSV/XLSX parsers first, per-bank PDF parsers later; unsupported/encrypted PDFs fail with guidance. Email receipt ingestion needs an authorized integration — not built.
