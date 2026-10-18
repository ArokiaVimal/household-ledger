# Personal Finance App: project overview

Plain-language overview for anyone (a person, a new developer, or any AI coding tool) opening this project from any device. For what is planned, see [ROADMAP.md](ROADMAP.md). For exact current status, see [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md).

*Last reviewed: 2026-10-19.*

## What it is
A private, mobile-first web app (installable on an iPhone Home Screen) for tracking money. It is built for one person first, and grows outward:

1. **Me:** record, categorise and understand my own spending (cards, UPI, bank accounts).
2. **My partner:** split shared expenses with my partner and keep track of who owes whom.
3. **Friends:** split with friends who never need an account.

It is a personal tool, not a public product. There is no advertising, no data selling, and no sign-up for strangers.

## Who uses it and where
- **Owner:** the person who set it up. Signs in with Google.
- **Partner:** signs in with their own Google account when invited by email.
- **Friends:** appear only as names in splits. They never log in.
- **Devices:** iPhone Safari (installable as an app icon) and desktop browsers. Everything is a normal website, so nothing needs an app store.
- **Live site:** https://personal-finance-tracker-283.vercel.app (sign-in required).
- **Source code:** https://github.com/ArokiaVimal/household-ledger (private).

## How money is handled (the rules that never bend)
- Amounts are whole **paise** (integers). No decimals or floating point, so splits add up exactly.
- Card bill payments, transfers and income are **never counted as spending**. Refunds reduce spending.
- A settlement (paying someone back) never creates an expense.
- Imported bank data is **kept exactly as read** and can't be edited. Your categorisation and splits are edits on top.
- **Nothing counts until you review it.** Anything imported goes to a review queue first, and you approve each row.
- Duplicates are never merged silently. Two purchases with the same amount are not assumed to be the same purchase.

## What works today
| Area | State |
|---|---|
| Sign-in (Google), profile, private space created on first sign-in | Working |
| Transactions: add by hand, edit, categorise, exclude, search, group by card/merchant/category | Working |
| Categories (add, rename, delete with move) and merchant rules | Working |
| Splits: equal, percentage, custom amounts, 64/36 and 50/50 presets for owner and partner, friends | Working |
| Settlements: record, void, outstanding balances | Working |
| Review queue: approve, edit, reject imported rows | Working |
| Import statements: CSV, Excel, and American Express (India) credit-card PDF, with checks against the statement's own totals | Working |
| Invite partner by email; shared view | Working |
| Reports and charts, recurring-commitments screen (view only) | Working / partial |
| Receipts, screenshots, other banks' PDFs, automatic capture, saved original files | **Not built** (see roadmap) |

## How it is built
```
Browser (iPhone / desktop)
   |  pages and forms (Next.js, React, Tailwind)
   v
Server routes on Vercel (/api/data, /api/import, /api/session ...)
   |  checks who you are, which space you belong to, and validates every input
   v
Firebase: Authentication (who) + Firestore (data) + security rules (backstop)
```
- **Business rules live in one place** (`src/domain`): money, splits, spending rules, balances, duplicate detection, statement parsing. They have no dependency on Firebase, Vercel or any AI tool, so the backend could be swapped without rewriting them.
- **Stack:** Next.js (App Router, TypeScript), Tailwind, Recharts, Zod, Firebase (Auth, Firestore), Vercel, Vitest.
- **Quality gates:** lint, type check, unit tests, Firestore rules tests (emulator), and opt-in tests against a real Firebase project.

## Words used in the app and the code
| Word | Meaning |
|---|---|
| Space / household | The container for one person's data. Internally a `households/{id}` document. A private space is created on first sign-in; a partner can be invited into it. |
| Participant | A name that can take part in a split. Members have accounts; friends don't. |
| Review queue | Imported rows waiting for your approval. They don't count in reports until approved. |
| Raw row | A statement row exactly as the bank wrote it. Write-once. |
| Mine / Everything | The scope switch: your own share, or all records in the space. |

## Privacy and security in one paragraph
Sign-in uses Google; access is limited to emails on an allowlist and to members of a space. Data lives in a private Firebase project. Every change goes through a server route that verifies the session and validates the input; Firestore security rules are a second line of defence and are tested. Uploaded statement files are read in memory and **not stored**; only a fingerprint is kept to refuse a second upload of the same file. The app never asks for net-banking credentials, UPI PINs, card numbers or statement passwords, and it never will. Details: [docs/SECURITY.md](docs/SECURITY.md).

## Where to find things
| I want to... | Open |
|---|---|
| Understand the product and the plan | this file, [ROADMAP.md](ROADMAP.md) |
| Set up and run it locally | [README.md](README.md) |
| Rules for AI tools and contributors | [AGENTS.md](AGENTS.md) (canonical; `CLAUDE.md` and `CODEX.md` just point to it) |
| Know exactly what is built, tested and unverified | [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) |
| Compact context for a new coding session | [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) |
| See why a technical choice was made | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Data shapes | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| Statement import and parsers | [docs/IMPORT_PIPELINE.md](docs/IMPORT_PIPELINE.md) |
| Security and privacy details | [docs/SECURITY.md](docs/SECURITY.md) |
| Deploy, back up, restore | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Tests and how to run them | [docs/TESTING.md](docs/TESTING.md) |

## Working on this from another machine or another AI tool
Everything needed is in this repository; nothing depends on a chat history or a particular assistant. Start with `AGENTS.md`, then `docs/DEVELOPMENT_STATUS.md`, check `git status` and `git log`, and continue from the real state of the code. Secrets are never in the repository: copy `.env.example` to `.env.local` and fill in your own Firebase values (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Without them the app runs as a demo on fictional data.
