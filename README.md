# Personal Finance App

Private, mobile-first personal finance app (PWA). First: track your own spending and categories. Then: split with your partner. Then: split with friends, who never need an account.

**Status: live app with real saved data (Stage 3, slice 5).** Sign in with Google (Firebase), and your household's transactions, splits, settlements, categories and people are saved in Firestore and shared by its members. Without Firebase configured it runs as a prototype on fictional September 2026 data (nothing saved). See [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) for exactly what works and what does not (statement import, receipts and file storage are not built yet).

**New here?** Read [PROJECT.md](PROJECT.md) (what this is and how it works) and [ROADMAP.md](ROADMAP.md) (what is next).

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
No authentication, persistence, file parsing, security rules, or export/restore yet. PWA manifest exists but there is no offline support or PNG icons for iOS (add 180px apple-touch-icon in Stage 3). Light theme only. UI follows a lavender, rounded-card reference design supplied by the owner.
