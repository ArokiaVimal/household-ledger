# Import pipeline (design; only the dedupe/match functions exist)

Flow: month → upload → detect source/type → parse → normalize → preview → duplicate check → review/categorize → confirm → summary.
Implemented now: `detectDuplicate`, `isFileAlreadyImported`, `suggestReceiptMatches` in `src/domain/dedupe.ts` (tested). The import UI is a **simulated** preview using mock rows.
Staging: parsed rows are planned with `planImport` (exact duplicates skipped, possible flagged), suggested categories come from `suggestCategory`, and rows go to a review queue as `unreviewed`. Rows enter the ledger only after manual approval in `/review`.
Dedupe order: file hash → bank reference id (per account) → possible match (same account/date/amount + alike merchant, flagged only). Amount alone never matches.
Planned: CSV/XLSX parsers first, per-bank PDF parsers later; unsupported/encrypted PDFs fail with guidance. Email receipt ingestion needs an authorized integration — not built.

## Planned: PDF statements and screenshots (design only, nothing built)
**Principle:** accuracy comes from deterministic parsing plus reconciliation checks plus mandatory human review, not from trusting one extraction.

PDF (text-based statements):
1. Server-side text extraction with coordinates (pdfjs-based), not OCR. Rebuild table rows from x/y positions.
2. Per-issuer parser profiles (HDFC card, SBI card, ICICI Coral, Amex Platinum Travel, HDFC bank, ICICI bank), chosen by detected markers; each profile is versioned. Unknown layout = clear "unsupported" result, never a guess.
3. Amounts parsed from strings to integer paise (no floats); Dr/Cr and refund direction explicit.
4. Reconciliation: parsed debits, credits, row count and opening/closing balance must match the statement's own totals. Any mismatch marks the import "needs attention" and lists unparsed lines. Rows are never silently dropped.
5. Password-protected or scanned (image-only) PDFs: detect and ask for an unlocked or text-based copy. PDF passwords are never stored.
6. Output goes to the review queue (nothing is added until approved); file hash and bank reference ids drive dedupe.
7. Tests use redacted or synthetic fixtures kept out of Git; real statements never enter the repo.

Screenshots (GPay, CRED, Paytm, BHIM): no reliable text layer, so extraction needs OCR or a vision model.
- Preferred sources, in order of accuracy: bank/card statement (has UPI reference ids) > app export (e.g. Google Takeout for Google Pay) > screenshot.
- Screenshot path (planned): vision-model extraction into a Zod-validated structure, shown side by side with the image in the review queue, every field editable, low-confidence fields highlighted, always `unreviewed`. Needs an Anthropic API key (server env var) and sends the image to that service, so it will be opt-in per upload.
