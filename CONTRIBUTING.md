# Contributing

Everyone, human or AI, starts with [docs/HANDOFF.md](docs/HANDOFF.md) and [AGENTS.md](AGENTS.md).

## Set up
`nvm use` (Node 22) · `corepack enable` · `pnpm install` · `cp .env.example .env.local` (optional; without Firebase variables the app runs in demo mode with fictional data) · `pnpm dev`. Variable values are never in Git: the owner holds them in Vercel. To sign in to a real Firebase project your email must be on `ALLOWED_EMAILS`; ask the owner.

## Working
- One branch per task: `feat/*` or `fix/*`. Several people or AI agents at once: give each a **separate `git worktree`** (`git worktree add ../household-finance-<task> -b feat/<task> main`) so checkouts never collide.
- Small, focused diffs. Reuse existing components and utilities. Business rules go in `src/domain` (pure, tested); screens never re-implement calculations.
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test`. Run `pnpm test:rules` when Firestore or Storage rules change. Check UI at phone width (390px) and on a wide screen.
- Commit subject: short, imperative, says what changed for the user.
- **Do not push to `main` or merge without the owner's say-so.** A push deploys to Vercel.
- Never put credentials, real statements or real data in commits, issues, docs or prompts.

## Review
Changes to `src/domain/*`, security rules, migrations, permissions or anything that touches money need tests and a second reviewer (see `.github/CODEOWNERS`). Fill in the pull request template; say what was verified for real and what was only simulated.

## Keeping context true
Update `docs/DEVELOPMENT_STATUS.md` when you finish, `ROADMAP.md` when a priority changes or an item ships, `docs/DECISIONS.md` when you decide something that others must respect, and `docs/HANDOFF.md` when direction, rules or in-flight work change.
