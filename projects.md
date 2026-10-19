# Personal Finance App: a brief for brainstorming

*Written 2026-10-19 so it can be pasted into ChatGPT (or any assistant) to get ideas. It describes what the app is, what exists, how it behaves, where it is weak, and what I would like help thinking about. It contains no personal data, keys or real transactions.*

## 1. The idea in one paragraph
A private, mobile-first web app (installable on an iPhone Home Screen) for an Indian household to understand its money. It starts with **one person's own spending** (cards, UPI, bank accounts), then lets them **split expenses with a partner**, and then **with friends who never need an account**. The product's character is **trust**: nothing counts until a person has reviewed it, imported data is never altered, and the numbers always reconcile. It is a personal tool, not a public product: no ads, no selling data, no strangers signing up.

## 2. Who it is for
- **Primary user:** one person tracking their own cards, UPI apps and bank accounts, who finds spreadsheets tedious and bank apps unhelpful.
- **Partner:** shares some expenses (rent, groceries, bills) and settles up with them. Today the usual split is 64/36, set per household.
- **Friends:** appear only as names in a split (dinners, trips). They never log in.
- Context: India (rupees, UPI, EMIs, credit-card statements with due dates, GPay/PhonePe/CRED). Devices: iPhone Safari as an installed web app, plus desktop.

## 3. Principles that never bend
1. **Nothing counts until reviewed.** Imports, pasted text, AI reads and captured messages all land in a review queue first.
2. **Money is whole paise (integers).** No floats, so splits always add up exactly.
3. Card-bill payments, transfers and income are **never spending**. Refunds reduce spending. A settlement never creates an expense.
4. **Raw imported rows are immutable.** The user's categories and splits are edits on top.
5. **Never ask for banking secrets** (net-banking logins, UPI PINs, card numbers, statement passwords) and never scrape.
6. **AI is opt-in per action**, only sees what it must (numbers hidden, no bank text where avoidable), and every AI answer is checked against the source (grounding) before use.
7. Parsers **check themselves against the statement's own totals** and block on a mismatch.
8. Duplicates are never merged silently; the user is shown what a row matches and chooses.

## 4. What exists today (shipped and tested)
**Tracking**
- Dashboard with a headline spend, share, trend, category donut, accounts, recent items, settlements, card bills to pay, an AI-insights shortcut, and a welcome guide when there are no transactions.
- Transactions: add by hand (quick merchant picks, category and "Split with" chips with inline "+ add"), edit, exclude, search, group by payment method, merchant, category, payer.
- Categories (add, rename, delete with "move to"), merchant rules, merchant memory that learns from approvals.
- Reports (category and merchant breakdowns), recurring payments (add, edit, link, "Repeat every month", status paid/due/overdue), card bills (full amount due and due date, never the minimum; paid detection; dashboard widget).

**Splitting**
- Split modes: equally, exact amounts, percentages, shares, adjustments, by item (tax and tip shared in proportion), one person; presets such as 64/36, 50/50, "X owes all", "I owe all".
- Settle up: person-wise ledger of shared payments, tick payments and settle just those, Settle all, reminders through the phone share sheet; works for friends too.
- Partner linking by email; an invited partner is usable in splits before they accept; each person's own space stays private and only chosen expenses are shared into a couple space.

**Import**
- CSV, Excel, American Express (India) PDF natively; other PDFs through an AI fallback. Payment method is **sensed from the statement text**; UPI-app payments inside a bank statement are filed under the app with the bank as funder; card-bill payments are named "Payment to <card>".
- Paste rows or **describe in words** ("paid 450 at Swiggy yesterday via GPay").
- Preview shows what will be added, which **months** a statement touches, and **duplicate decisions** (skip or add anyway) per row; re-importing a file asks first.
- EMIs and monthly payments are sensed (wording, AI flag, or the same amount in two earlier months) and offered as "Repeat every month" on approval.

**AI (Claude, only when asked)**
- Statement reader fallback, paste/describe reader, merchant naming and categorising, card bill reading, and an **AI insights** tab that analyses a month's aggregated numbers (never bank text) into a summary, things to watch and 2 to 4 tips; it runs only on Analyse or Refresh.

**Automatic capture (built, rollout deferred, see "Later")**
- A private link per person that an iPhone Shortcut posts each bank SMS to, and a read-only Gmail connection limited to bank senders. Both feed the review queue.

**Platform:** Google sign-in with an email allowlist, Firestore data with server-mediated writes, security rules with emulator tests, PWA install, deployed on Vercel, about 340 automated tests.

## 5. How it is built (so ideas stay realistic)
- Next.js (App Router, TypeScript), Tailwind, Recharts, Zod; Firebase Auth and Firestore; Vercel (Hobby plan: 4 MB request limit, 60 s functions, daily cron only); Claude API for AI features.
- Business rules live in a plain `src/domain` layer (money, splits, ledger, balances, dedupe, parsers) with no dependency on Firebase or any AI tool.
- Every change goes through one server action path that validates input, enforces rules and writes an audit event. Privacy is structural: personal data lives in a private space; a separate couple space holds only what was shared.
- Constraints worth knowing: no native app (so no direct SMS access, no background tasks on iPhone); iPhone can read messages only through Shortcuts; Gmail access shows Google's "unverified app" screen for a private app; each bank's PDF layout needs its own parser; storage of files needs a paid Firebase plan (not used yet, files are read in memory and discarded).

## 6. Known weak spots and rough edges
- **Getting data in is still the biggest effort.** Review is one dialog per row; there is no bulk "approve the confident ones".
- Only Amex PDFs are parsed natively; HDFC, SBI and ICICI PDFs rely on the AI fallback (costly and needs checking). One live AI read of an SBI statement failed with an API error that is still being diagnosed.
- Dashboard shows three similar totals (net spend, my share, all spending), which confuses people.
- No budgets, no goals, no notifications (the bell is decorative), no offline mode.
- Receipts screen is a placeholder (no upload). No export or "delete all my data" inside the app yet.
- Reminders are a share-sheet message only; there is no UPI pay link.
- Mobile layout has been checked on several screens but not all, on a real iPhone.
- AI features use a small, cheap model and prompts that have only been tested with fakes, not with a month of real data.

## 7. Roadmap in the owner's words (order of priority)
- **Now:** use it for real, fix what real statements show, clean merchant names, mobile QA, housekeeping (production flag, rotate setup tokens).
- **Next:** native parsers for HDFC/SBI/ICICI card PDFs; full export and restore; delete-my-data; per-household split ratio setting; screenshot reading (GPay and others) with a vision model, always reviewed.
- **Later (built, deferred):** automatic capture from bank SMS (iPhone Shortcut) and Gmail alerts.
- **Open question:** how private should personal expenses be from the partner (currently private by default, shared only on purpose).
- **Unlikely:** Account Aggregator or bank APIs (need a regulated entity), multiple currencies.

## 8. What I would like ideas on
Please be concrete and keep the principles in section 3. Rank ideas by value for effort, and say what each would cost to build and maintain.

1. **Less effort to keep data current.** How could daily and monthly upkeep take under two minutes without breaking "nothing counts until reviewed"? (Bulk approve, confidence tiers, a daily digest, smart defaults, a weekly "clear the queue" ritual.)
2. **Insights that change behaviour,** not just charts. What would a money coach inside this app say each week? Budgets, nudges before a bill is due, "you usually overspend on X by the 20th", subscription creep, EMI payoff, cash-flow forecast to the next salary.
3. **Splitting that people actually enjoy and complete.** How do we get partners and friends to settle quickly and fairly (UPI links, group trips, recurring shared bills, fairness over time, "who is ahead this year")?
4. **Trust and safety features** that make a finance app feel safe to a non-technical household (audit trail, undo import, backups, export, read-only share for a spouse or accountant, alerts on unusual changes).
5. **Statement and receipt intelligence.** Best ways to read messy inputs (photos of receipts, screenshots, PDFs from many banks) while staying accurate and cheap.
6. **Small delightful touches** for an Indian household: festival and annual-expense planning, rent and maintenance reminders, GST and tax-time summaries (spending only, no tax advice), gold and insurance premium tracking, family members as separate wallets.
7. **What to cut.** Which parts of this are not worth keeping, and what should the home screen show in the first five seconds?
8. **Naming, positioning and a one-line pitch** if this ever became something others could use, while remaining privacy-first.

## 9. How to use this brief
Paste the whole file, then ask something like: *"Using only this context, propose five features that cut the monthly effort of keeping my data current, ranked by value for effort, each with how it respects the principles in section 3."* Follow up on one idea at a time; ask for edge cases, failure modes and a smallest first version.
