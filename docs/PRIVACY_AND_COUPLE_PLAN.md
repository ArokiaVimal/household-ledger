# Plan: private by default, optional couple space

Status: proposed (not started). Written 2026-10-19. Owner decisions are in section 1.

## 1. What the owner decided
1. Every transaction is **private to its owner** until they share it. Sharing = choosing a split that includes the partner.
2. Imported rows are private; the review step is where the owner chooses to share (split with partner).
3. The partner sees only: merchant, amount, date, category, split, who paid. Never: the bank's original text, which card/account, import history, notes (unless the owner ticks "show note").
4. Only the payer edits a shared expense. The partner can read it (flagging a problem is a later feature).
5. Solo use is the default and must feel complete. Partner features appear only after a partner is linked.
6. **Split ratio is a per-couple setting.** 64/36 applies only to Vimal and Varru; new couples start at 50/50 and set their own in Settings. No names or ratios are hard-coded.
7. Unlinking: shared history stays for both; each keeps their own private data.

## 2. Chosen design: privacy by space, not by flag
Two kinds of space (the app already calls households "spaces"):

| Space | Members | Holds |
|---|---|---|
| **Personal** (every user, auto-created today) | only the owner, always | records, review queue, raw rows, import batches, audit, accounts, merchant memory, personal recurring items |
| **Couple** (optional, created when a partner links) | the two partners | `sharedExpenses`, settlements, shared recurring items (rent), shared categories, split ratio |

Sharing an expense writes a **redacted copy** into the couple space. The private record never leaves the personal space, so there is nothing to hide with filters: Varru's account cannot read it, even if the app has a bug. The Firestore rules (`isMember`) stay as they are; they already enforce this.

Why not an `ownerId`/`visibility` flag inside one shared space: rules cannot hide individual fields, so original text and card names would need server-side stripping and every collection needs owner rules. Unlinking would also mean moving the leaver's private data out. Separate spaces avoid both.

### SharedExpense (couple space, `sharedExpenses/{id}`)
`id` (= source record id, so retries are idempotent), `ownerUid`, `payerId`, `date`, `merchant`, `amountPaise`, `categoryId`, `split`, `note?` (only if "show note"), `voided?`, `createdAt`, `updatedAt`. Rules: members read, nobody writes from the client (server only).

## 3. Build in slices (each ends green: lint, typecheck, tests, build)

**Slice A – data model, no visible change**
- `users/{uid}`: `personalSpaceId`, `coupleSpaceId?`. Backfill = existing household becomes `personalSpaceId` (script, idempotent, dry-run first).
- Space doc: `kind: "personal" | "couple"`; couple doc: `splitRatio { leaderUid, leaderBps }` (default 5000).
- `SharedExpense` type + zod schema + repository collection (memory + Firestore + contract tests).
- Rules: add `sharedExpenses` (member read, no client write). Emulator tests: partner cannot read the owner's personal space; both read `sharedExpenses`; outsiders read nothing.
- Household service: a user can have a personal space and one couple space (`getSpaces(uid)`); personal spaces never accept extra members.

**Slice B – sharing**
- Server action `share`: when a reviewed record's split includes the partner, upsert the `SharedExpense` (idempotent), set `sharedExpenseId` on the private record. `unshare`/delete = mark `voided`. Edits to a shared record re-sync the copy.
- Audit event in the couple space for share/unshare (no private details).
- Store: `view "personal"` = my personal records (my share where split) + partner-paid shared expenses where I hold a share; `"household"` (rename label to "Together" once linked) = shared expenses only. Avoid double counting: my shared records appear once, from the personal side.
- Balances and settle-up compute from `sharedExpenses` + settlements only.

**Slice C – Settings → Partner**
- States: *Solo* → "Add a partner (optional)" → *Invited* → *Linked*.
- Invite flow reuses the existing email invites; accepting now creates the couple space (and keeps both personal spaces). Remove the "drop empty personal space" behaviour for this path.
- Linked options: partner name, **split ratio** (presets 50/50, 60/40, 64/36 plus custom; who carries the larger share), default for new expenses (private, recommended / shared), "show notes on shared expenses" default off.
- After linking, ask once: "How do you usually split?" so nobody lands on a wrong default.
- Replace `OWNER_SHARE_BPS` (src/domain/defaults.ts) and the `ratioSplit(..., OWNER_SHARE_BPS)` calls in `src/components/split-editor.tsx` with the couple's setting. Vimal sets 64/36 for himself and Varru after linking; no migration needed for that.

**Slice D – progressive disclosure**
- Solo: hide Everything/Together toggle, balances, settle-up; split editor shows "Just me" with a hint "Add a partner in Settings to split".
- Linked: show them. Dashboard onboarding/empty states follow the "onboarding only until the first transaction" rule from the dashboard request.
- Review queue: split chips include the partner; picking one is the share action; add a small "Shared with Varru" badge. Phone layout stays uncrowded.

**Slice E – unlink**
- Either partner can unlink (confirm dialog, explains what stays). The couple space is frozen read-only for both (shared history kept, balances shown as final), personal spaces untouched. Offer a CSV export of shared history.
- Tests: after unlink, neither can create shared expenses; both can still read history.

**Slice F – docs**: `docs/DATA_MODEL.md`, `SECURITY.md` (what a partner can and cannot see), `DECISIONS.md` (space-based privacy), `DEVELOPMENT_STATUS.md`.

## 4. Tests that must exist
- Rules: partner cannot read private records, raw rows, import batches, audit, accounts, memory; can read shared expenses; outsider reads nothing; solo works with no couple space.
- Actions: share creates exactly one copy (retry safe); unshare voids it; non-payer cannot edit; amounts stay integer paise; sums of shares equal totals.
- Store: Mine vs Together never double count a shared expense; balances use shared only.
- Unlink and re-link behaviour; export contents.

## 5. Risks and notes
- Load now reads two spaces: do it in parallel in `src/lib/data/load.ts`; the layout already runs inside Suspense.
- Two writes (private record + shared copy) are not one transaction across spaces; the copy uses the source record id so a retry fixes any half-finished share.
- The Import redesign (branch `feat/ai-import`) is unaffected: it writes to the personal space. Land it first or independently.
- Out of scope here: friends without accounts (their splits stay in the owner's personal records), disputes/comments on shared expenses, more than two partners.
