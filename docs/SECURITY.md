# Security

## Implemented (Stage 3 slice 2, tested only against dummy config; not yet run with a real Firebase project)
- Sign-in via Firebase Auth with **Google** (popup) or email/password. Policy (`isSignInAllowed`): email on `ALLOWED_EMAILS`; Google accounts must have a Google-verified email; other providers (anonymous, custom) are refused. The browser exchanges a fresh ID token for an **httpOnly, SameSite=Lax session cookie** at `POST /api/session` (Admin SDK `createSessionCookie`, 5 days). The browser then signs out of the client SDK, so no token is kept in JS-readable storage.
- `/api/session` checks same-origin, sign-in within 5 minutes, revocation, and an `ALLOWED_EMAILS` allowlist; failures return one generic message.
- `src/proxy.ts` redirects requests without a cookie to `/login`; the `(app)` layout verifies the cookie with Firebase on every request (including revocation) inside `<Suspense>` (Cache Components requirement).
- Fails closed: if `APP_ENV=production` and Firebase is not configured the app errors instead of serving; partial config is an error. With no config outside production the app runs in prototype mode (mock data only).
- Profiles: `users/{uid}` is written only by server code (`/api/profile`); photos are validated JPEG data URLs (see DEVELOPMENT_STATUS).
- Not yet: household membership checks, Firestore/Storage rules, MFA, rate limiting beyond Firebase's own.

Console hardening to do by hand (required while Email/Password is enabled, because self-registered password accounts have unverified emails): in Firebase Authentication settings disable user sign-up (create accounts for the two of you manually) and keep the project's API key restricted to your domains. Once Google sign-in works, consider disabling the Email/Password provider entirely. Known limit: Google popup sign-in can be unreliable inside an iPhone Home Screen (standalone PWA); use Safari for first sign-in.

## Invitations (personal-first)
Invites are bound to one email and a week's expiry. Accepting needs the verified sign-in email to match (Google-verified for Google sign-in), is transactional and single-use, and never discards data: an existing private space is dropped only when it is completely empty and only the invitee is in it. A new private space is created atomically so parallel first loads cannot create two.

## Data API (slice 5)
All household data changes go through `POST /api/data`: same-origin check, verified session, household resolved from membership (a user can only ever write their own household), body size cap, Zod validation, domain invariants (integer paise, split sums, immutable bank fields, append-only settlements and audit). Identity and household are never taken from the request body. Admin SDK bypasses Firestore rules, so this route and `applyAction` are the authorization boundary; the rules remain a backstop for any direct client access.

## Rules (Stage 3 slice 4, tested in the emulator, not yet deployed)
`firestore.rules` and `storage.rules` enforce household membership, integer-paise validation, immutability of imported data, append-only settlements/audit, private typed size-limited files. 24 emulator tests (`pnpm test:rules`). Server routes use the Admin SDK (bypasses rules), so every route authorises with the verified session first.

## Planned (remaining slices)

- Firebase Auth per user; membership doc `households/{h}/members/{uid}` grants access. Firestore/Storage rules check membership server-side; owner-only for member management and deletion.
- Files in private Storage paths `households/{h}/files/…`; type/size validated; short-lived signed URLs.
- Admin credentials only in server env vars (see `.env.example`); never `NEXT_PUBLIC_`.
- Audit events for imports, edits, matches, settlements.
- Rules tests with the Firebase emulator (cross-household reads denied).
- Never ask for bank passwords, UPI PINs, full card numbers. Password-protected PDFs: ask user to upload an unlocked copy.
- Never commit real statements or production env files.

## AI import (added)
Claude receives statement or typed text only after an explicit click (the server refuses AI without `ai=1`), with digit runs of 8+ characters, emails and phone numbers masked first. The file is never stored or sent whole. The text is treated as untrusted: the prompt forbids following instructions inside it, the answer is validated, and statement rows must be found in the text Claude saw. AI-read rows are still unreviewed until a person approves them.

## Couple space and privacy (added)
- Personal spaces never have a second member. Linking creates a separate couple space (`households/{id}` with `kind: "couple"`); invitations are accepted by verified email and no longer add anyone to a personal space.
- A partner cannot read the other partner's personal space: `isMember` fails for it (emulator tests: partner denied on private records/space, allowed on `sharedExpenses`).
- `sharedExpenses` are written only by server code (rules: `allow write: if false`). The server shares only spending-like kinds (purchase, refund, fee), only when the signed-in user is the payer, and only for splits between the two partners (a split with a partner and a friend is refused).
- The shared copy is built by `buildShared` and carries no bank text, account, reference or import source; tests assert this.
- Unlinking sets `endedAt` on the couple space: history stays readable to both, nothing new can be shared or settled.

## Friends & Family account linking (added)
Design: `docs/FRIENDS_FAMILY_LINKING.md`.
- **Only a verified email ever matches.** The account side uses the session's `email_verified` claim; the contact side asks Firebase Auth (`getUserByEmail`) and ignores unverified accounts. Confirm re-checks verification and that the contact still holds that email, so a stale proposal cannot link the wrong person.
- **Never silent.** Matching only stores a proposal (`contactLinks/{pairKey}`, server only). The contact owner must confirm; a conflict (two contacts, one email) needs them to choose, and the chosen id must be one the server stored. Decline is remembered. Only the owner of a side can confirm or decline it; either person can unlink.
- **What the linked person can read:** a link space (`households/{id}`, `kind: "link"`) holding only pair-scoped copies: payer, date, merchant, category name, and the two people's shares; plus settlements between exactly the two (no note). Never: other people in a split, the full bill when others share it, bank text, account/card, notes, import data, or any other transaction. Records paid by a third person are not mirrored. Tests assert none of the private strings leak.
- **Rules:** `contactLinks` closed to all clients; in link spaces members may read, nobody may write (`isLink` guard on every write rule); outsiders read nothing; a linked person cannot read the owner's personal space. 5 emulator tests added; the Firestore adapters are exercised against the emulator.
- **The owner's ledger is never changed by linking**: only a `linkId` is set on the contact. Records and settlements are read and mirrored, with the record's id so retries cannot duplicate.
- **Contact identity is not login identity.** The link is keyed by uid, never by email; editing the saved email or the account's login email does not change who is linked. A linked contact cannot be deleted until unlinked.
- **Unlink / deletion:** unlinking ends every side, stops sync and keeps the copies as history for both. `removeAccountLinks(uid)` deletes the link spaces (copies only) and the pair records, clears `linkId` on the other person's contact, and touches no ledger. No delete-account screen exists yet, so nothing calls it today.
- **Known residual risks:** (1) email enumeration: someone who types an arbitrary email as a contact learns, via a proposal, that a verified account exists for it. Mitigations: only verified accounts, the app is allow-listed, no profile data is shown before confirm. (2) Link-space copies of the owner's expenses are visible to the linked person even if the owner later edits or removes the contact; the owner's remedy is unlink (withdrawn copies are voided and hidden). (3) The collection-group lookup needs the `participants.email` field override deployed (`firestore.indexes.json`); without it proposals from the sign-in path fail quietly (logged) and the contact-side path still works.

### Revision 2: shared expenses are two-way editable (changes to the privacy model)
Design: `docs/FRIENDS_FAMILY_LINKING.md` section 8.
- **What the linked person now sees:** the full expense (merchant, date, total, category, payer, the full split with the other participants' names and shares, the note only if `shareNote`), only for expenses both linked people take part in. Before: just the two shares. Still never: bank text, account or card, import details, receipts, vouchers, or any other transaction.
- **What they can now do:** edit merchant, date and amount (manual entries only), category (by name, only if the owner has it), payer, split among the people already in it, and the shared note; undo the newest change; record and void payments between the two. All through `POST /api/links`; Firestore rules still deny every client write in a link space. They cannot add or remove a third person, drop either linked person, delete the expense, or touch the bank-sourced fields of an imported row.
- **One transaction:** the owner's record stays the only ledger row. Edits are written through to it with the owner's own ids; the linked person has no ledger row, so nothing is counted twice in anyone's spending or reports.
- **No silent overwrite:** every shared expense has a `version`; the repository write is a compare-and-set (Firestore transaction), so of two simultaneous saves exactly one wins and the other gets a clear message. The owner's normal edit dialog carries `ifRev` (a counter that goes up only on the other person's edits).
- **Log:** every create, edit, undo, withdrawal, payment and void is an audit event in the link space (actor, time, before/after), readable by both; the owner's own audit gets an event for edits written to their record.
- **Withdrawal:** only the owner removes an expense (a logged void; kept as history). Either person may void a payment (final, logged).
- **Unlink:** editing and payments stop at once; history stays; each ledger keeps the expense as it was.
- **Residual risks / limits:** (1) write-through is two writes (shared terms, then the owner's record); a failure between them reverts the shared terms and reports an error, but a crash at exactly that moment could leave them differing until the owner's next edit rebuilds them. (2) A linked person can change an owner's category, payer and split on a shared expense (that is the feature); the owner sees each change in their own history and can undo it. (3) Link-space data written before this revision is upgraded on the owner's next sign-in. (4) Rules and indexes: no change in this revision, nothing to deploy for it.
