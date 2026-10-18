# AGENTS.md — rules for any AI agent or contributor

Platform-neutral. Start here, then read `PROJECT.md` (what the app is), `ROADMAP.md` (what is next), `docs/DEVELOPMENT_STATUS.md` (exact state) and `docs/PROJECT_CONTEXT.md`. Read other docs only when relevant to the task (see index in PROJECT_CONTEXT).

## Session start
1. `git status`, `git log -5`; compare DEVELOPMENT_STATUS against the real code.
2. Continue from the verified repo state. Never overwrite work because you lack prior context.

## Commands (pnpm, Node 22)
`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test`

## Hard rules
- Money = integer paise. No floats in money math. All figures come from `src/domain/*`; UI never re-implements calculations.
- `src/domain` must not import React, Next, or Firebase. Provider code goes behind adapters in `src/data`.
- Raw imported records are immutable; edits go to the canonical expense. Matches are reversible; never delete on amount match.
- Credit-card payments, transfers, income are never spending (see `signedSpend`).
- No secrets, real statements, or real data in Git. Env vars only; `.env.example` has placeholders.
- Changes to financial calculations, security rules, migrations need tests and review.
- Mock data must stay clearly labelled; don't imply simulated actions are persisted.
- Small focused diffs; reuse existing components/utilities; update docs only where reality changed.
- At the end of a session update `docs/DEVELOPMENT_STATUS.md` (done, files, tests run, limits, next tasks).
- Never claim tests passed unless you ran them.
- Build for other people too: no owner-specific names, banks or merchants in code; per-household data and settings instead; new issuers/sources go behind adapters; optional features (AI key, capture) must have a safe "off" state.
- Anything produced by AI is labelled with `AiBadge`. Every delete or void asks first with `ConfirmDialog`. Check new UI on a phone (390px) and a very wide screen.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
