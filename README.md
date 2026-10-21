# Personal Finance App

A general expense tracker plus a Splitwise-style splitting app: private, mobile-first (installable PWA). Track your own spending, split with a partner, friends, family or colleagues, settle up, and import statements with AI help only when you ask.

**Status: live app with real saved data.** Sign in with Google (Firebase); transactions, splits, groups, settlements, categories and people are saved in Firestore. Without Firebase configuration the app runs in demo mode with fictional data.

**New here, human or AI?** Start with [docs/HANDOFF.md](docs/HANDOFF.md), then [PROJECT.md](PROJECT.md) (what this is) and [ROADMAP.md](ROADMAP.md) (what is next). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start
```bash
nvm use            # Node 22 (see .nvmrc); pnpm 9 via corepack
corepack enable
pnpm install
cp .env.example .env.local   # optional: without it the app runs in prototype mode (mock data, no sign-in)
pnpm dev                     # http://localhost:3000
```

## Commands
| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` | Dev server / production build |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Vitest: financial rules, dedupe, mock-data reconciliation |

## Layout
`src/domain` pure financial logic (tested, no framework imports) · `src/data` mock data + prototype store · `src/components` UI · `src/app` routes. Context for agents and contributors: [AGENTS.md](AGENTS.md), [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Deployment
Prototype deploys to Vercel as a normal Next.js app (contains only mock data). Real deployment, Firebase setup and backup guidance: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (plan, not yet implemented).

## Known limitations
See [ROADMAP.md](ROADMAP.md) ("Discussed but not built yet") and [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md). GitHub CI is off until a token with workflow permission is added; run lint, typecheck and tests locally.
