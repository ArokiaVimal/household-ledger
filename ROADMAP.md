# Roadmap

What is done, what is next, and what is deliberately later. Priorities follow the owner's order: **1) my own spending, 2) splitting with my partner, 3) splitting with friends.** For the product overview see [PROJECT.md](PROJECT.md); for exact build and test status see [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md).

*Last updated: 2026-10-19. Status tags: `done`, `next`, `later`, `open question` (needs the owner's decision), `blocked` (waiting on something outside the code).*

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
| Platform | PWA install on iPhone, brand icons, deployed on Vercel from GitHub, Firestore and Storage security rules with emulator tests |

## Now: use it for real and tighten the basics
| Item | Why | Status |
|---|---|---|
| Approve the first real Amex import and fix whatever the first real use shows | Real data finds what tests can't | `next` (owner) |
| **Clean merchant names** (strip processor prefixes like `cca*`, `PayU*`, `RBL*`) and suggest rules | Names are ugly; rules match more reliably on clean names | `next` |
| Set `APP_ENV=production` on Vercel; remove the two GitHub tokens used for setup | Housekeeping and hygiene | `next` (owner) |
| Mobile QA of all screens on a real iPhone; fix layout problems found | Only some screens have been viewed on a phone | `next` |

## Next: automatic capture of payments (owner chose routes 1 and 2)
Goal: purchases show up in the review queue within minutes, without uploading anything, while monthly statement import stays as the cross-check that catches anything missed.

**Route 1: iPhone Shortcuts on bank and card alerts (primary).** An iOS Shortcuts automation fires when a message from a known sender arrives (HDFC, ICICI, SBI, Amex and so on) and sends the text to a private capture link in the app.
**Route 2: forwarded alert emails (backup).** A Gmail filter forwards bank and card alert emails to an address the app owns; the app reads them. No broad Gmail access.

| # | Item | Notes and acceptance | Status |
|---|---|---|---|
| C1 | **Capture endpoint** | One secret token per person (rotatable, stored hashed); rate limited; body size cap; same session-less safety as other routes (validate, never trust the sender claim alone). Captured items go to the review queue as `unreviewed`, with an audit event. Acceptance: a test request with a valid token creates one queued row; invalid or replayed requests create nothing. | `next` |
| C2 | **Alert parsers** (pure, tested) | One parser per sender and message type: amount, merchant, date, credit or debit, card or UPI reference, last 4 digits only. Refuse unknown wording rather than guess. Start with the Amex card alert, then HDFC/ICICI/SBI debit and credit alerts and UPI alerts. Needs 3 to 4 masked sample messages per sender. | `next` (needs samples from owner) |
| C3 | **iPhone Shortcuts guide** | Step-by-step setup with screenshots-free instructions (works on any device that can read Markdown): create the automation, choose senders, paste the capture link and token. Document that iOS may ask for a tap to confirm. | `next` |
| C4 | **Email forwarding intake** | Inbound address via a mail service (candidates: Postmark, SendGrid inbound, or Cloudflare Email Routing with a Worker) posting to a webhook; verify the forwarding rule and the original sender; reuse the C2 parsers. | `later` (after C1 to C3) |
| C5 | **De-duplication against statements** | A captured alert and the later statement row for the same purchase must not be counted twice: match on reference, date and amount; show "captured, confirmed by statement". Statement totals remain the safety net. | `next` (with C1) |
| C6 | **Capture health view** | A small screen: last capture time per sender, items waiting, parse failures, and "statement says N but N-1 were captured". | `later` |

Decisions needed from the owner: which senders first; which mail service for route 2; whether any captured item may ever skip review (default and recommendation: **never**).
Limits to know: each sender's wording needs its own parser; iPhone allows reading messages only through Shortcuts; SMS wording can change without notice, which is why statements remain the cross-check.

## Next: more statement formats
| Item | Notes | Status |
|---|---|---|
| PDFs for HDFC, SBI and ICICI Coral cards | One parser per issuer, each self-checking against its own totals. Use `scripts/describe-statement.mjs` to share only the masked layout. | `next` (needs masked layouts) |
| Bank statement PDFs (HDFC, ICICI) and UPI-app statements (Paytm, PhonePe emailed statements) | Same approach | `later` |
| Google Pay history via Google Takeout | Manual and format varies; only for gaps, because UPI payments also appear in the funding bank's statement | `later` |

## Next: product decisions and features
| Item | Why | Status |
|---|---|---|
| **Should personal expenses be hidden from my partner?** | Today every member of a space sees every record. If personal must stay private, records need an owner and visibility (private unless split), with Firestore rules and tests. Recommended: private by default. | `open question` |
| Create and edit recurring items in the app (rent, EMI, insurance, bills) | The screen exists but there is no way to add items yet | `next` |
| Per-space split ratio setting (currently a constant, 64/36) | Lets the ratio change without code | `later` |
| Screenshot reading (GPay and others) | Vision model extracts rows shown beside the image, always reviewed; opt-in because the image goes to an external service | `later` |
| Receipts and saved original statements (private file storage) | Needs Firebase's pay-as-you-go plan and a budget alert; receipt-to-transaction matching on real data | `blocked` (billing) |

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

## Later or unlikely
- **Account Aggregator (RBI framework):** the official way to pull bank data with consent. Production access requires being (or partnering with) a regulated entity, so it is not realistic for a personal project. Revisit if that changes.
- **Bank APIs:** offered to businesses only.
- **Multiple currencies:** the data model leaves room; not needed now.

## How this roadmap is kept up to date
Update it when a priority changes or an item ships, in the same commit as the work. Move shipped items into **Done** and put the detail in `docs/DEVELOPMENT_STATUS.md`. Do not copy status detail here, so there is one source for each fact.
