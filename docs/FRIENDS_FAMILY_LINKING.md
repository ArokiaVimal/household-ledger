# Design: linking a Friends & Family contact to a real account

Status: written before the code (2026-10-19). **Revision 2 (2026-10-19, owner's follow-up) supersedes sections 4 and 7 where they say the copy is read-only and pair-scoped: see section 8.** Builds on `docs/PRIVACY_AND_COUPLE_PLAN.md`. Owner decisions that shaped it: privacy is strict; an account is never linked from an unverified email; linking is never silent; the owner's ledger is never changed by linking.

## 1. Words (kept distinct)
- **Friends & Family contact**: a `Participant` in *your* personal space with a name, relationship and optional email. A label you keep. Not a login.
- **Account**: a signed-in person (`uid`). Identity comes only from the verified session.
- **Link**: a confirmed, revocable connection between a contact owner and one account. It lets that account see *only the expenses you split with that contact*. It is not Split With, Split Groups, Payment Groups or Categories.

## 2. Decision: generalise the shared space, not the couple
The partner flow (couple space + `sharedExpenses` + redacted copy + the old Mine/Together views (removed, see note below) + per-couple ratio) is built around exactly one partner and a "Together" scope. Friends and family are many per person, with no ratio and no merged view. So:

- The **couple space stays as it is** (one per person, partner only). Nothing about it changes.
- The *mechanism* is reused for friends and family: a **link space** is a `households/{id}` doc with `kind: "link"`, two members, and only `sharedExpenses` + `settlements` (+ audit) under it. Same `SharedExpense` type, same "server writes, members read" rules, same redaction idea. A person can have many link spaces (one per linked pair) next to at most one couple space.
- Why a separate space per pair and not "one link space per owner": membership is the read permission in Firestore rules. One space per pair means the pair can read exactly what is in it and nothing about anyone else, even if the app has a bug.

A contact that is already your active-couple partner is never linked this way (they are already linked); matching skips them.

## 3. Data model
`contactLinks/{pairKey}` (server only; rules deny every client). `pairKey = sort(uidA, uidB).join("__")`, so a pair can never have two links (duplicates impossible by construction).

```
{ uids: [a, b], spaceId?: string, createdAt, updatedAt,
  sides: { [ownerUid]: { householdId,          // the owner's personal space
                         contactIds: string[],  // candidate contacts (more than one = conflict, owner chooses)
                         contactId?: string,    // the chosen contact (set on confirm)
                         email: string,         // the verified email that matched (lower-case)
                         status: "proposed" | "active" | "declined" | "ended",
                         proposedAt, confirmedAt?, endedAt?, endedBy? } } }
```
`sides[A]` means "A's contact matched B's account". Each *owner* confirms their own side; A confirming exposes only A's expenses. If B also has a contact holding A's email, B confirms B's side separately.

- `Participant.linkId?: string` (the pairKey) marks a linked contact. It is separate from `userId` (which means household member). Login identity (uid, email) is never stored as the contact's identity: the link is keyed by uid, the contact keeps its own name, email and relationship.
- `households/{spaceId}`: `kind: "link"`, `ownerUid` = the first confirmer, `endedAt` unused (sync is controlled per side). Members: both uids. Collections: `sharedExpenses` (SharedExpense), `settlements`, `auditEvents`.
- Link-space participant ids are `u_<uid>` (same convention as the couple space).

## 4. What the other person sees (redaction)
A record is mirrored for a link only when ALL hold: reviewed, not excluded, kind purchase/refund/fee, split is not "personal", the contact is in the split, and the payer is the owner or the contact (a debt to some third person is not this pair's business).

The copy is **pair-scoped**: payer, date, merchant, category name, and a `custom` split of just the two people's shares (`amountPaise` = the two shares added). Other people in the split (names, shares) are never copied; the bank text, account, card, notes, import info and the rest of the ledger never leave the owner's space. The owner's note is never copied for links. Consequence to state in the UI: the other person sees "your share" and "who paid", not the full bill.

Settlements between exactly the owner and the contact are mirrored (amount, date, direction, voided flag; no note). `recordIds` are not copied.

## 5. Flows
1. **Match (account side)**. After sign-in the server asks: which contacts, in other people's personal spaces, hold this account's email? Only if the session's `email_verified` is true. Results go through `matchAccount` per owner: exactly one contact → *proposal*; several → *conflict proposal* (owner chooses); none → nothing; already linked / owner is the account itself / active couple partners → skipped. Nothing is linked: a `proposed` side is only stored.
2. **Match (contact side)**. When an owner saves a contact email (add or edit, including adding it after the person already signed up), the server asks Firebase Auth for an account with that email and proceeds only if Auth says it is verified. Same proposal, same rules. This is the "email added later" path.
3. **Confirm**. The owner sees "Someone with the email you saved for *Priya* has an account. Link them?" and says what will be shared. Confirm: the contact's `linkId` is set, the link space is created (or reused), then the owner's existing qualifying records and settlements are mirrored (backfill). **No record is edited.** Decline keeps the contact as is and does not ask again for that pair.
4. **Sync**. Every record and settlement write the owner makes (create, edit, approve, delete, void) re-evaluates each active link and creates, updates or withdraws (voids) that copy. The copy has the record's id, so retries are safe. Writes happen in the same server action; if the mirror fails the action fails and can be retried.
5. **Unlink** (either person, with a confirm dialog). All sides end; sync stops; the link space and its copies stay readable to both as history; the owner's ledger is untouched and the contact stays (with `linkId` cleared). Linking again later needs a fresh confirm.
6. **Email changes**. The link is keyed by uid, so changing the account's login email or the contact's saved email does not change who is linked. New emails can produce new proposals; a second contact of the same owner matching an already-linked account is a duplicate and is ignored.
7. **Account deletion**. `removeAccountLinks(uid)` deletes every link space the person is in (they only hold copies; originals stay in each owner's own space), clears `linkId` from the other owner's contact (the contact and all history stay), and removes the pair docs. There is no delete-account screen yet, so this is a tested function waiting to be called.

## 6. Authorisation
- `contactLinks` and all link-space writes are server only (Admin SDK). Rules: closed for `contactLinks`; link-space collections are member-read, no client write (a `isLink` guard blocks the generic member-write rules there).
- The server derives the actor from the verified session; the uid in the pair doc must match; `contactId` on confirm must be one of the stored candidates; only the owner of a side can confirm/decline it; either member can unlink.
- Enumeration: a contact owner learns that "an account exists for an email I typed" only after the matched person is verified. To limit abuse a person can only hold as many contacts as they add (cap is the existing size), and the proposal never reveals profile details before the owner confirms; after confirming, the other person's display name comes from their own space member doc. Accepted residual risk, recorded in SECURITY.md.

## 7. Not in this change
- The linked person recording a settlement themselves (the owner records it; it is mirrored).
- Comments or disputes on a mirrored expense.
- Merging two accounts of one human.
- A hard-coded index backfill: lookups use a Firestore collection-group query on `participants.email` (needs the field override in `firestore.indexes.json`, deployed with the rules).

## 8. Revision 2: shared expenses are two-way editable, fully visible and logged
Owner's words: "Shared expense should be editable but it should be logged. They should be able to see that full transaction as it's a group or couple expense."

### 8.1 One source of truth (one transaction, no duplicates, no double counting)
- The **origin owner's record** (the ledger row in their personal space, with bank data) stays the only transaction. Linking never creates a second one and never edits it.
- The link space holds the **shared terms** of that record, one `sharedExpenses/{recordId}` document per record (the id is the record's id, so retries cannot duplicate). While a link is active this document is the single source of truth for the **shared fields**: merchant, date, amount, category, payer, split and (opt-in) note. Every change, from either person, goes through one server function that (1) checks a version, (2) writes the shared terms, (3) writes the same change through to the origin owner's record, (4) logs it. So the two can only differ in a short failure window, which is repaired by reverting the shared terms (and the next owner edit rebuilds them from the record).
- The linked person has **no ledger row for it**: they see and edit it on the People page ("Shared through linked accounts"). Their own spending and reports therefore never count it twice. (Folding a linked expense into *their* Mine view the way the partner flow does is a possible follow-up; it is deliberately not done here.)
- Bank-sourced fields stay immutable: **amount and date can be edited only when the origin record is a manual entry.** For an imported row the shared amount and date are the bank's; the editor says so.
- Participants inside a shared expense are the origin owner's own ids, except the two linked people, who are always `u_<uid>`. Other people are shown by **name only** (a name map stored on the shared terms); they cannot be added or removed by the other person, only re-weighted within the split. Both linked people must stay in the expense (to remove it, the owner withdraws it).
- The category is edited by name. It is applied to the owner's record only if the owner has a category with that name; otherwise the edit is refused with a plain message (nobody learns the owner's category list).

### 8.2 What the linked person sees
Full transaction as a group or couple expense: merchant, date, total amount, category, payer, the **full split including the other participants' names and shares**, and the activity log. A record is shared when **both** linked people are in it (as payer or in the split), it is reviewed, not excluded, and a purchase, refund or fee (income, transfers, card-bill payments stay private). Never copied: bank text, payment account or card, import details, receipts, voucher data, anything outside expenses that involve both of them. The note travels only if the owner ticked "show note" (`shareNote`, unchanged). Adding a contact still grants nothing until the owner confirms, and then only these expenses.

### 8.3 Conflicts
Each shared expense has a `version`. An edit must say which version it saw (`ifVersion`); if someone saved in between, the second save is **refused** with "X changed this expense since you opened it. Reload; nothing was overwritten". The write is a compare-and-set inside the repository (Firestore transaction), not a read-then-write. The owner's own edits through the normal edit dialog carry `ifRev`: a counter on the record that goes up only when the *other* person edits, so a stale owner screen is refused too, but the owner's own successive edits never conflict with themselves. Undo uses the same checks.

### 8.4 The log
Every create, edit, withdrawal, undo, payment and void is an `AuditEvent` in the link space (`auditEvents`), with who (`actorId`), when, a summary and for edits `change {before, after}` of the shared fields. Both people read it (members read; nobody writes from a client). The owner's own ledger also gets an event (actor = whoever edited) when a change is written through to their record, so their history is complete. Undo reuses `undoableIds` and the "newest step only, nothing changed since" rule from `src/domain/audit.ts`; either person can undo the latest change on an expense, and the undo is itself logged.

### 8.5 Delete and withdraw (agreed rules)
- **Only the origin owner can remove a shared expense** (delete, exclude, make it private, or take the contact out of the split). That is a **logged withdrawal**: the shared terms are marked void (kept, never deleted), the expense disappears from totals and balances for both, and stays visible in the activity log. The linked person cannot delete it; they can edit their own share, or ask the owner.
- Voided settlements follow the existing rule: a void is final and logged.

### 8.6 Settlements
Either person may record a payment between the two of them, or void one, from People. It is stored in the link space, **written through to each active owner's own settlements** (so every balance is right) and logged. A settlement never creates an expense. Where both people hold a contact for each other, the other owner's ledger gets it too.

### 8.7 Unlinking
Either person can unlink. Sync and editing stop (every side ends). The shared terms, settlements and log stay readable to both as history. Each owner's ledger keeps the expense exactly as it was at that moment, including any edits the other person made while linked. Linking again needs a fresh confirmation and re-syncs from the owners' records.

### 8.8 Privacy model changes since revision 1
The linked person now sees the **total amount and the other participants' names and shares** of each shared expense (before: only the two shares). They can now **write** (edit, undo, payments) through the server; clients still cannot write to any space. Link-space copies written before this revision are upgraded in place the next time the owner signs in (`schema` 2), logged as "now shows the full expense".


> **Note (Oct 2026):** the Mine/Together (household) view switch and the Profile "default view" setting were removed. Payment groups are the only lens on spending and the app always opens on Mine. A linked partner's shared expenses still appear in your lists. "Shared" means only expenses split with other people.

> **Note (Oct 2026):** the partner (couple space) path now follows the same rule as link spaces (section 8.2): when a shared expense also has other people in the split, the whole split is shared and the other people travel by **name only** (`people`). A split with the partner and a friend is no longer refused. See `buildShared` in `src/domain/sharing.ts`.
