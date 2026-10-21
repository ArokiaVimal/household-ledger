# Setup and access: new device, new Claude account, sharing the app, adding collaborators

Step-by-step guide for the owner. Plain language; Mac commands are shown, Windows notes where they differ. No keys or tokens are written here and none should ever be pasted into a chat.

*Last reviewed: 2026-10-21.*

## The one idea to keep in mind
A Claude account does **not** connect to GitHub, Vercel or Firebase by itself. Claude Code works on a device using the tools that are signed in **on that device** (Git, the GitHub, Vercel and Firebase command-line tools). So on any new device you sign in to each service once. The new Claude learns the project from the files in the repository (`docs/HANDOFF.md`), not from any earlier conversation or private memory.

---

## Part 1. Work on the app from a new device or a different Claude account

### 1.1 Install the basics
1. **Claude:** install the Claude desktop app (or Claude Code) and sign in with the Claude account you want to use.
2. **Git:** Mac: open Terminal, run `xcode-select --install`. Windows: install "Git for Windows".
3. **Node 22 and pnpm:** install `nvm` (Mac: `brew install nvm`), then `nvm install 22` and `corepack enable`.
4. **GitHub CLI:** Mac: `brew install gh`. Windows: use the installer from cli.github.com.

### 1.2 Connect GitHub (read and push the code)
1. In Terminal run `gh auth login`. Choose **GitHub.com**, then **HTTPS**, then "Login with a web browser".
2. It shows a one-time code. Open the page it names, sign in as the GitHub account that owns the repository, enter the code and approve.
3. Get the code:
   ```bash
   git clone https://github.com/ArokiaVimal/household-ledger.git
   cd household-ledger
   pnpm install
   ```
4. Check: `git status` works. Nothing reaches `main` until you say yes to each push.

### 1.3 Connect Vercel (your live site, its settings and variables)
1. `npm i -g vercel`, then `vercel login` (it opens a browser; sign in).
2. In the project folder run `vercel link`. Pick your account and the existing project (`personal-finance-tracker-283`).
3. To bring your settings onto this device: `vercel env pull .env.local`. This writes the variables into `.env.local`, which Git ignores.
4. The live site still deploys by itself whenever `main` is pushed. You only need the CLI to look at logs or variables.

### 1.4 Connect Firebase (database rules)
1. `npm i -g firebase-tools`, then `firebase login` (browser sign-in).
2. `firebase use <project id>`. The id is the `NEXT_PUBLIC_FIREBASE_PROJECT_ID` value in `.env.local`.
3. Deploy rules only when a change needs it: `firebase deploy --only firestore:rules` (add `storage` if storage rules changed). A change that adds or edits `firestore.rules` is not finished until the rules are deployed.
4. To run against real data from this device, `.env.local` also needs the admin key. `vercel env pull` brings it. If you prefer a fresh key: Firebase console → **Project settings** → **Service accounts** → **Generate new private key**, put it in `.env.local` only, then delete the old key in the console.

### 1.5 Start the new Claude
1. Open the project folder in Claude Code.
2. Send this first message:
   > Read AGENTS.md and docs/HANDOFF.md, then ROADMAP.md and the end of docs/DEVELOPMENT_STATUS.md. Check git status and git log, tell me where things stand, and wait for my instructions. Ask me before every push to main.
3. It now has the direction, your rules and what is in progress.

### 1.6 Check it works
1. `pnpm dev`, then open http://localhost:3000. With no `.env.local` it runs in demo mode with fictional data.
2. To use real data, `.env.local` must exist and you sign in with your allowlisted Google account.
3. `pnpm lint && pnpm typecheck && pnpm test` should all pass.

### Safety
- Never paste keys or tokens into a chat. Use the browser sign-in prompts and `vercel env pull`.
- `.env.local` stays out of Git (it already is). Do not email it or keep it in notes; a password manager is fine.
- Optional: in Claude's Connectors settings you can add GitHub or Vercel connectors so Claude can read pull requests and deployments. Nothing above depends on them.

---

## Part 2. Let someone use the app (not the code)
This gives the person their own private space. They cannot see your data; only what you split with them is shared.

1. **Allow their email:** Vercel → your project → **Settings** → **Environment Variables** → `ALLOWED_EMAILS` → **⋯ → Edit** → add their Google email at the end, comma-separated, no spaces → Save.
2. **Redeploy:** **Deployments** → the latest one → **⋯ → Redeploy**, so the change takes effect.
3. **Send the link:** https://personal-finance-tracker-283.vercel.app. On iPhone they open it in **Safari** → **Share** → **Add to Home Screen**.
4. **They sign in with Google.** The app creates their private space and asks "Who do you split with?".
5. **Connect them to you:** on your phone go to **Settings → Friends & Family → + Add a contact**, enter their name and **their Google email**. When they have signed in you get a prompt to link them; confirm it. For a partner use **Link a partner** on the same screen.
6. **Check:** Split → People shows them as "Linked" or "Has an account".

**Know before sharing**
- Your Anthropic key serves everyone. Each person's AI usage is tracked under Settings → Smart import. If you do not want that, turn AI off for the server or ask for a per-person switch.
- More people means more Firebase reads on the free plan.
- To remove someone: delete their email from `ALLOWED_EMAILS` and redeploy.

---

## Part 3. Add someone who will work on the code

### 3.1 Choose their level
- **Normal collaborator (recommended):** code access only. They develop in demo mode or against their own empty test Firebase project and never see your real data or keys.
- **Trusted co-owner:** also access to Vercel and Firebase. Only for someone you fully trust, because it includes your real data.

### 3.2 Give code access (GitHub)
1. Open https://github.com/ArokiaVimal/household-ledger.
2. **Settings** → **Collaborators** (GitHub may ask for your password).
3. **Add people**, enter their GitHub username or email, choose them, and set the role **Write**. They must accept the emailed invitation.

### 3.3 Protect `main` (do this before the first collaborator)
1. **Settings** → **Branches** → **Add branch ruleset** (or **Add rule**), target `main`.
2. Turn on **Require a pull request before merging**, **Require approvals: 1** and **Require review from Code Owners** (the repo has a `CODEOWNERS` file naming you).
3. Turn on **Block force pushes**, then **Create**. Now only you can approve and merge changes into the live app.

### 3.4 Keep real data away from previews
In Vercel → **Settings** → **Environment Variables**, make sure the Firebase and Anthropic variables are ticked for **Production only**. Otherwise pull-request preview sites could use your real database. On the Hobby plan Vercel may refuse to deploy commits from other people; if a pull request shows no preview, that is why, and merging it yourself is the fix.

### 3.5 Give them a safe way to run it
- Send them the repository link and `docs/HANDOFF.md`. Never send your `.env.local`.
- If they need sign-in and a database, create a second, empty Firebase project for development and give them that project's keys. Add their email to that project's allowlist, not yours.

### 3.6 What the collaborator does
1. Accept the invitation, install Node 22 and `corepack enable`.
2. `git clone https://github.com/ArokiaVimal/household-ledger.git`, `cd household-ledger`, `pnpm install`.
3. `pnpm dev` and open http://localhost:3000 (demo mode, no sign-in).
4. Read `docs/HANDOFF.md`, `AGENTS.md` and `ROADMAP.md`; pick a roadmap item.
5. One branch per task: `git switch -c feat/<name>`. For several tasks at once use a separate `git worktree` for each (`git worktree add ../household-finance-<name> -b feat/<name> main`).
6. Before every commit run `pnpm lint && pnpm typecheck && pnpm test`.
7. Push the branch and open a pull request; fill in the template (what changed, what was checked, what was only simulated). If they use an AI coding tool, the pointer files make it follow the same rules.

### 3.7 Reviewing and merging (you)
1. GitHub → **Pull requests** → open theirs → read the description and **Files changed**.
2. Look harder if it touches money rules (`src/domain`), `firestore.rules`, `src/lib/data` or `src/lib/links`.
3. Ask for a phone-width screenshot if it changes a screen.
4. **Approve**, then **Squash and merge**. Merging to `main` deploys to your live app.
5. If it changes `firestore.rules`, the rules must also be deployed (see 1.4). Do not merge such a change without a plan for that.

### 3.8 Ending someone's access
GitHub → **Settings** → **Collaborators** → remove them. If they ever had keys, rotate those (Firebase admin key, Anthropic key) afterwards and update Vercel.
