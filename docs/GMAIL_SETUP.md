# Gmail auto-capture: one-time setup

The app reads only emails from bank, card and UPI senders (`src/lib/gmail/mail.ts` lists them), with read-only Gmail access, and adds them to Transactions as Unverified. You verify each one. You can disconnect any time in Settings > Integrations; that also tells Google to forget the connection.

## 1. Google Cloud (use the same project as Firebase)
1. console.cloud.google.com > **APIs & Services > Library** > enable **Gmail API**.
2. **OAuth consent screen**: user type **External**, app name "Personal Finance App", your email as support and developer contact. Add the scope `.../auth/gmail.readonly`.
3. Publishing status: **In production** (an "unverified app" warning appears for you once; that is expected for a private app). In **Testing** status Google expires the connection after 7 days, so use In production.
4. **Credentials > Create credentials > OAuth client ID > Web application**. Under **Authorised redirect URIs** add `https://<your-vercel-domain>/api/gmail/callback` (and `http://localhost:3000/api/gmail/callback` for local use). Copy the client ID and secret.

## 2. Environment variables (Vercel > Settings > Environment Variables; and `.env.local` for local use)
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`: from step 1.
- `GMAIL_TOKEN_KEY`: run `node scripts/make-secrets.mjs` (it saves a key and `CRON_SECRET` to `.env.local` without printing them), then copy them to Vercel with `grep -E '^(GMAIL_TOKEN_KEY|CRON_SECRET)=' .env.local | pbcopy`. It encrypts the stored refresh token. Do not lose or change it (connections would need redoing).
- `CRON_SECRET`: any long random string; lets Vercel Cron run the daily sync (`vercel.json`, 01:30 UTC).
Redeploy afterwards. Never paste these values into chat.

## 3. Connect
Settings > Integrations > **Connect Gmail** > choose your Google account > allow read-only access. Press **Sync now** to read the last 30 days of bank mail. After that it checks when you open the app and once a day.

## What it does and does not do
- Fetches only messages from the bank sender list; anything else is never opened. Sender domains are checked again after fetching.
- Each email goes through the same reader as an SMS: transactions are added unreviewed, duplicates are skipped, a card-due email creates the card bill (full amount, never the minimum).
- Attachments (PDF statements) are not read yet; import those on the Import screen.
- Claude is asked only for money emails the built-in reader cannot read, with account numbers hidden and the answer checked against the text.
