# Roadmap

What is done, what is next, and what is deliberately later. Priorities follow the owner's order: **1) my own spending, 2) splitting with my partner, 3) splitting with friends.** For the product overview see [PROJECT.md](PROJECT.md); for exact build and test status see [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md).

*Last updated: 2026-10-21. Status tags: `done`, `next`, `later`, `open question` (needs the owner's decision), `blocked` (waiting on something outside the code).*

## Principles that apply to every item
- **Nothing counts until reviewed.** Anything captured or imported lands in the review queue first.
- **Never ask for banking secrets.** No net-banking logins, UPI PINs, card numbers or statement passwords. No screen scraping. No access to a whole inbox.
- **Self-checking and honest.** Parsers check themselves against the source's own totals and block on mismatch. Unreadable input is shown, never dropped silently.
- **Money is integer paise.** Business rules stay in `src/domain`, independent of Firebase, Vercel or any AI tool.
- **Every feature ships with tests and an honest status note** (what was verified for real and what was only simulated).

## Done
| Area | What exists |
|---|---|
| Sign-in and spaces | Google sign-in, session cookie, email allowlist, a private space created on first sign-in, invite a partner by email |
| Personal tracking | Add and edit transactions, categories (add, rename, delete with move), merchant rules, review queue, reports, profile |
| Splitting | Equal, percentage, custom; 64/36 and 50/50 presets for owner and partner; friends as participants; settlements with voiding |
| Import | CSV and Excel statements; American Express (India) PDF with checks against the statement's own totals; duplicate protection; immutable raw rows |
| Smarter splitting | Every Splitwise way to split (equally, exact amounts, percentages, shares, adjustments, by item with tax and tip shared in proportion), "Split with" then "How", add a friend inline, remove a friend with consent, an invited partner is usable before they accept |
| Settle up | Person-wise ledger, tick payments and settle just those, Settle all, reminders by share sheet, works for friends too |
| Recurring and card bills | Add and edit recurring payments, "Repeat every month" from any transaction, EMIs and monthly payments sensed on import; card bills with the full amount due and due date (never the minimum), paid detection, dashboard widget |
| AI | AI statement reader fallback with grounding, paste or describe transactions, payment method sensed from the statement, AI insights tab (analyses a month only when you press the button) |
| Platform | PWA install on iPhone, brand icons, deployed on Vercel from GitHub, Firestore and Storage security rules with emulator tests |

## Now: use it for real and tighten the basics
| Item | Why | Status |
|---|---|---|
| Approve the first real Amex import and fix whatever the first real use shows | Real data finds what tests can't | `next` (owner) |
| **Clean merchant names** (strip processor prefixes like `cca*`, `PayU*`, `RBL*`) and suggest rules | Names are ugly; rules match more reliably on clean names | `next` |
| Set `APP_ENV=production` on Vercel; remove the two GitHub tokens used for setup | Housekeeping and hygiene | `next` (owner) |
| Mobile QA of all screens on a real iPhone; fix layout problems found | Only some screens have been viewed on a phone | `next` |

## Next: more statement formats
| Item | Notes | Status |
|---|---|---|
| PDFs for HDFC, SBI and ICICI Coral cards | One parser per issuer, each self-checking against its own totals. Use `scripts/describe-statement.mjs` to share only the masked layout. | `next` (needs masked layouts) |
| Bank statement PDFs (HDFC, ICICI) and UPI-app statements (Paytm, PhonePe emailed statements) | Same approach | `later` |
| Google Pay history via Google Takeout | Manual and format varies; only for gaps, because UPI payments also appear in the funding bank's statement | `later` |

## Next: split features (a general Splitwise-plus-tracker for couples, friends, family and colleagues)
The app is people-and-groups first; a linked partner is one optional layer. Done so far: Split tab (People and Groups), simplify payments (fewest payments, or each owes directly), UPI pay button, group spending summary and CSV export, optional partner link and a "who do you split with" onboarding step.

| Item | Why | Status |
|---|---|---|
| **Comments on shared expenses** | Friends can ask "what was this?" on an expense they both see | `next` (in progress) |
| **Invite to a group by link** | A friend joins by tapping a link instead of you adding their email first | `next` (in progress) |
| **Recurring shared expenses** (rent, Wi-Fi, subscriptions) | Recurring bills exist, but not as a split that repeats for the same people | `later` |
| **Per-expense history** (who changed what, when) for shared expenses | Trust in groups where several people can edit; the shared-expense log exists, a per-expense view does not | `later` |
| **Multiple currencies** with a conversion rate per expense | Trips abroad; the data model keeps INR only today (`currency: "INR"`), so amounts, reports and settle-up all need a currency | `later` |
| **Add an expense by email, and push notifications to friends** ("Meera added Dinner") | Convenience; needs an inbound email address and web push for non-partner contacts | `later` |
| Pay from the app with payment apps beyond UPI | Splitwise links Venmo and PayPal; UPI covers India | `later` |

## Next: product decisions and features
| Item | Why | Status |
|---|---|---|
| **Should personal expenses be hidden from my partner?** | Today every member of a space sees every record. If personal must stay private, records need an owner and visibility (private unless split), with Firestore rules and tests. Recommended: private by default. | `open question` |
| Per-space split ratio setting (currently a constant, 64/36) | Lets the ratio change without code | `later` |
| Screenshot reading (GPay and others) | Vision model extracts rows shown beside the image, always reviewed; opt-in because the image goes to an external service | `later` |
| Receipts and saved original statements (private file storage) | Needs Firebase's pay-as-you-go plan and a budget alert; receipt-to-transaction matching on real data | `blocked` (billing) |

## Discussed but not built yet
Everything below came up in conversations with the owner and has no code yet (beyond what is noted). Pick from the top; update the status here when you start or finish.

| Item | Notes | Status |
|---|---|---|
| **Choose the app name** | A global, non-regional name. Front-runners: Tally, Evenly, Hearth. Then change the name in the header, sign-in page, PWA manifest and home-screen title. Check the App Store, web, domain and handles first. | `open question` (owner) |
| **Re-tag existing transactions** after import rules improve | Rows imported before the card-bill and own-transfer rules keep their old type. A one-time, reviewable "re-check my transactions" that proposes changes (never silent) | `later` |
| **Match card-bill payments sent through aggregators** | A bank UPI line to an aggregator (for example a bill-pay service) and the card's "payment received" credit on the same day and amount should pair up and show as one card payment | `later` |
| **UPI view extras** | Break UPI down by app (GPay, PhonePe, Paytm, CRED) and by merchant; the UPI / Not UPI and bank / card filters exist | `later` |
| **Bulk "Keep both"** for old possible-duplicate flags | Today each flag is cleared one by one in Compare | `later` |
| **Rename "household" internally to "space"** | Data migration plus rewritten security rules; only with a rehearsed backup and restore (see DECISIONS 13) | `later` |
| **Real-data verification of the new readers** | ICICI bank PDF, ICICI Coral card PDF, HDFC `.xls`: import the owner's real files and fix what shows | `next` (owner) |
| **More issuers** | HDFC, SBI, Axis and Kotak bank and card PDFs and Excel layouts, one adapter each, each self-checking | `later` |
| **Recurring shared expenses**, **per-expense history**, **multiple currencies**, **add by email and push to friends**, **other payment apps** | See the split features table above | `later` |
| **Comments on shared expenses** and **group invites by link** | In progress on branch `feat/comments-and-invites` (see HANDOFF section 9) | `next` (in progress) |
| **Budgets, goals and nudges** | Weekly money coach, "you usually overspend on X by the 20th", subscription creep. Idea list in `projects.md` | `later` |
| **Full export and restore, delete my data, tested backups** | Listed under safety above; still open | `next` |
| **Mobile QA of every screen on a real iPhone** | Only some screens have been viewed on a phone | `next` (owner) |
| **Push reminders for card bills** | Built; needs the four variables in Vercel and a test on the iPhone (HANDOFF section 9) | `blocked` (owner) |
| **Re-enable CI on GitHub** | Workflow saved as `docs/ci.yml.example`; needs a token with workflow permission | `blocked` (token) |

## Next: safety, data ownership and polish
| Item | Notes | Status |
|---|---|---|
| Full export and restore (JSON and CSV with stable ids) with a round-trip test | So the data is never trapped in one provider | `next` |
| Delete my data from inside the app | Currently a stub | `next` |
| Backups and a rehearsed restore | Documented plan only | `next` |
| Content-Security-Policy header | Needs a tested allowlist so Google sign-in keeps working | `later` |
| Re-enable CI on GitHub | The workflow is saved as `docs/ci.yml.example`; adding it needs a token with workflow permission or the GitHub website | `blocked` (token) |
| Offline shell, dark mode, accessibility pass | PWA polish | `later` |
| Separate production Firebase project before relying on it for years of data | Keeps test and real data apart | `later` |

## Later: automatic capture of payments (built, rollout deferred)
Goal: purchases show up in the review queue within minutes, without uploading anything, while monthly statement import stays as the cross-check. **The owner has decided to leave this for later.** The code exists and is tested, but nothing is switched on, so there is nothing to maintain until it is picked up again.

| Route | What is built | What is left when it is picked up |
|---|---|---|
| **SMS through an iPhone Shortcut** (primary) | A private capture link per person (hashed, capped at 300 a day, revocable), a message reader for UPI, bank and card alerts (skips OTPs and offers), Claude only for unreadable money messages, results land unreviewed, duplicates skipped, card-due texts create the card bill, a "Try a message" box, and the Shortcut recipe in Settings > Integrations | Create the link, build the Shortcut, try real messages from each bank, add parsers or fixes for wording that real alerts show |
| **Bank emails through Gmail** (replaces the earlier "forward alerts" idea) | Read-only Gmail connection per person, bank and card senders only (checked twice), encrypted refresh token, Sync now, a quiet check when the app opens and a daily cron, same reader as SMS | One-time Google Cloud setup and four environment variables (`docs/GMAIL_SETUP.md`), then real mail to tune the reader; PDF attachments are not read yet |
| Capture health view | Not built | Last capture per source, items waiting, parse failures, "statement says N but N-1 were captured" |

Decisions still open: which senders matter most; whether any captured item may ever skip review (default and recommendation: **never**).
Limits to know: each sender's wording may need a fix; iPhone reads messages only through Shortcuts; Google shows an "unverified app" screen for a private app; SMS wording can change without notice, which is why statements remain the cross-check.

## Later or unlikely
- **Account Aggregator (RBI framework):** the official way to pull bank data with consent. Production access requires being (or partnering with) a regulated entity, so it is not realistic for a personal project. Revisit if that changes.
- **Bank APIs:** offered to businesses only.
- **Multiple currencies:** moved to the split features table above (`later`).

## How this roadmap is kept up to date
Update it when a priority changes or an item ships, in the same commit as the work. Move shipped items into **Done** and put the detail in `docs/DEVELOPMENT_STATUS.md`. Do not copy status detail here, so there is one source for each fact.
