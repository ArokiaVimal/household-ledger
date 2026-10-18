# Import pipeline

## Implemented: CSV and Excel (.xlsx) statements
Flow (live mode): Import screen -> choose payment method + file -> **Read statement** (preview, writes nothing) -> check counts and the statement totals -> **Send to review queue** (commit) -> approve each row in `/review`.
- **Reading** (`src/domain/import/*`, pure, tested): CSV with auto delimiter, quotes, BOM; Excel via `read-excel-file` (first sheet with a recognisable table); header row found anywhere in the first 60 rows (statement preambles are skipped); columns mapped by common bank headings (Date, Narration/Description/Particulars, Withdrawal/Debit, Deposit/Credit, Amount, Dr/Cr, Balance, Ref No, Value Date). Amounts parse to integer paise (Indian grouping, Rs/INR/₹, brackets, Dr/Cr). Dates are **day-first** (03/09/2026 is 3 Sep) and also accept 2026-09-03, 3 Sep 2026 and Excel serial numbers.
- **Nothing is dropped silently**: unreadable rows are listed with line number and reason; statement totals (money out / in, row counts) are shown to compare with the statement. A single signed Amount column can be flipped (card statements show purchases as positive, banks as negative); the defaults are card = positive is money out, bank = negative is money out.
- **Classification** (`classify.ts`, a first guess for review): card bill payments and cash withdrawals are never spending (`cc_payment` / `transfer`), fees, refunds, salary/income; UPI/POS narrations are reduced to a merchant; categories come from the household's merchant rules (substring match on whole words), else Uncategorized.
- **Duplicates**: (1) the same file (SHA-256) for the same payment method is refused; (2) overlapping statements: a row with the same bank reference + date + amount, or (no reference) the same content, is skipped as already imported; (3) a row that merely looks like an existing record (same account/date/amount, alike merchant) is added but flagged as a possible duplicate; (4) two identical rows inside one file are both kept (they are two real purchases).
- **Storage**: the file is read in memory and **not kept**; only its hash is stored. Every row is saved as read in `rawTransactions` (write-once), each file in `importBatches` (history), and new rows as `unreviewed` records. Limits: 4 MB (Vercel's request cap), 2000 rows per file. Old `.xls`, password-protected and scanned PDFs, and other files are refused with guidance.
- API: `POST /api/import` (multipart; session, same-origin, household from membership, content sniffing, size cap).

## Implemented: American Express (India) credit-card PDFs
- `src/domain/import/pdf/amex-india.ts` reads the statement from text **positions** (`unpdf` extracts text with coordinates in `src/lib/import/pdf.ts`): the summary box (opening balance, new credits, new debits, closing balance, minimum due), the statement period (the year comes from it; transaction dates are "Month D"), and the table columns (date, description, foreign currency kept in the raw record only, amount). A `CR` printed just below a row marks that row as a credit.
- **It checks itself against the statement's own totals**: parsed debits = "New Debits", parsed credits = "New Credits", and opening − credits + debits = closing; plus "payment method matches the statement's issuer". If any check fails the preview shows a red cross with the difference and the import is **blocked** until the user ticks "I have checked the differences and want to import anyway" (sent as `acceptMismatch`; the batch records `checksPassed` / `acceptedMismatch` and the audit event says "IMPORTED DESPITE FAILED CHECKS"). Unreadable dated lines are listed as warnings, never dropped silently.
- Rows then go through the same classification (purchase / fee / refund / card bill payment), duplicate protection (file hash; overlapping statements; direction-aware, so a refund is not a "duplicate" of its purchase) and review queue as CSV rows.
- Passwords: encrypted PDFs are refused; the user unlocks a copy locally (Preview > Export). We never ask for a PDF or bank password.
- **Verified on the owner's real statement** (5 pages, 21 rows, all checks pass, no warnings; local opt-in test `tests/integration/pdf-real-statement.test.ts` with `STATEMENT_FIXTURE_AMEX=<path>`, prints counts only) and in a local production build. Only this one real statement has been seen; other months may expose layouts not covered (e.g. foreign-currency rows, supplementary cardholders, multi-line descriptions are handled by design but unseen). **Not yet verified on Vercel with a real upload.**
- Other issuers (HDFC, SBI, ICICI Coral cards; bank PDFs) are not supported: `parseStatementPdf` refuses unknown layouts instead of guessing.

## Local tool: describe-statement
`node scripts/describe-statement.mjs <file.pdf|.csv|.xlsx>` prints a statement's structure with all digits and names masked (columns, date/amount shapes, totals lines, how the table starts and ends) so a person can review and share it safely. Reads locally, writes and sends nothing. Password-protected PDFs: unlock a copy first (Preview > Export). Scanned PDFs are reported as unreadable.

## Not yet: other issuers' PDFs and screenshots (design below)


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

## Smart suggestions: memory first, Claude only for the unknown

Goal: less manual review every month. Each statement line is resolved in this order, stopping at the first hit:

1. **Your rules** (Categories page) and **kind by wording** (card payments, fees, transfers).
2. **Merchant memory** (`merchantMemory`, one document per merchant key, see `src/domain/memory.ts`). Built from everything you approve or correct (`record.approve` / `record.update` teach it, your choice always replaces an AI guess), and seeded once from your already-approved history.
3. **Claude** (`src/lib/import/ai.ts`), only for merchants memory has never seen. Distinct merchants are sent once each in a single batched call (40 per call, at most 3 calls per import), to a Haiku-class model (`claude-haiku-5-5`, override with `ANTHROPIC_MODEL`) with temperature 0, a forced tool call that returns compact JSON, and the instructions as a cached prefix. Answers are validated against the household's own category ids and direction rules, then **saved to memory** so a merchant costs tokens once, and the commit after a preview costs none.

What is sent: the statement text with digit runs of 5+ hidden, the amount in whole rupees, and debit/credit. Not the file, names of account holders, dates, or account numbers. Statement text is treated as untrusted (the answer is validated; it cannot invent categories). Without `ANTHROPIC_API_KEY` the whole step is skipped and memory/rules still work.

Rows carry `suggested` (`memory`, `ai`, `ai_unsure`) while in the review queue. The review page shows Remembered / Smart guess / Check this badges and a "Select N I'm sure about" button; approving always happens in your hands, and approving is what teaches the memory. Preview shows how many rows came from memory, from Claude, and need you, plus tokens used.

