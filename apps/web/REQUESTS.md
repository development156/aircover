# apps/web — cross-lane requests

Requests from this lane to the owners of shared code. Mirrors `packages/billing/REQUESTS.md`.

---

## wt-web: `<Button asChild>` throws on any child with more than one node — NOT fixed here

`src/components/ui/button.tsx` renders `{loading ? <Loader2/> : null}{children}` inside `Comp`.
With `asChild`, `Comp` is Radix `Slot`, which requires exactly one element child — so it receives
two nodes and throws _"Slot failed to slot onto its children"_ at render, not at typecheck. Note
this happens whether or not `loading` is set: `null` is still a second child node.

The inbox lane was the first caller to try it
(`<Button asChild><Link><Icon/>Open connections</Link></Button>`), so the path has never run in
this codebase. A production build would have shipped it.

Two defects in one, both on the `asChild` path only — the plain `<button>` path is fine:

1. **Slot arity.** Fix by wrapping: `<Comp>{asChild ? <Slottable>{children}</Slottable> : <>…</>}</Comp>`,
   or by refusing `loading` when `asChild` is set. The second is arguably more honest — a link has
   no pending state to show.
2. **`disabled` on an anchor.** `disabled={disabled || loading}` is forwarded to whatever element
   the child renders. On an `<a>` that attribute is not valid and does not disable anything, so a
   "disabled" link stays clickable.

**Worked around, not fixed:** `buttonVariants` is now exported (one-line, standard shadcn shape) and
`components/inbox/surface-notice.tsx` applies it to a plain `<Link>`. A shared control's `asChild`
path deserves its own review and test rather than a drive-by from a feature lane.

---

## wt-pub: `ZernioPlatformFilter` cannot express the conversations surface

`packages/publishing/src/zernio/reads.ts:190` types the `platform` filter on `listConversations`
as `facebook | instagram | twitter | bluesky | reddit | telegram`. It has **no `whatsapp` member**,
and no `googlebusiness` either.

WhatsApp is one of the three platforms with a modelled reply window
(`@sahoda/shared` `SEND_WINDOWS`), so a per-platform tab built on this filter would silently drop
WhatsApp conversations from a list the user reads as complete.

**Meanwhile:** the inbox reads every conversation unfiltered and labels each row's platform. No tab
filter ships. The lane did **not** cast past the type — a cast here would produce exactly the silent
omission the filter's narrowness is warning about.

**Ask:** confirm whether the omission reflects Zernio's actual accepted values (in which case the
conversations list can never be filtered to WhatsApp server-side and paging must account for it), or
whether the union is simply incomplete.

---

## ~~wt-pub: `ZernioMessage.direction` is `[DOC]`-tier and load-bearing~~ — CORRECTED `[LIVE 2026-08-10]`

The documented value was **wrong**, not merely unconfirmed. Zernio sends **`"incoming"` /
`"outgoing"`**; `'inbound'` appears in no real payload.

Both predicted consequences had already shipped, and a second one had not been predicted:

1. `newestInboundAt` returned null for every thread, so **every reply affordance rendered
   `unknown` permanently** — the honest degradation that looks exactly like a working feature.
2. **Not foreseen:** `components/inbox/message-list.tsx` compared the same literal to choose
   which side a bubble renders on. Every message in every thread — including the customer's —
   rendered on the right, in the owner's colour, labelled **"You"**. Sahoda put the customer's
   words in the shop owner's mouth, in the thread they were reading to decide how to reply.

**Fixed** by `messageDirection()` in `packages/publishing/src/zernio/reads.ts` — one place, both
callers, and an unrecognised value now logs and resolves to `unknown` rather than defaulting to
ours. `direction` stays typed `string`: Instagram is the only platform whose thread has been read,
and Facebook/WhatsApp may yet speak differently.

**No ask outstanding.** Captures under `packages/publishing/fixtures/zernio-inbox/`.

---

## ~~wt-pub: is `ZernioConversation.accountId` the same id as `ZernioAccount._id`?~~ — RESOLVED `[LIVE 2026-08-10]`

**Yes.** Against profile `6a75cae32853ee463c6419d6`, all four report
`6a75caf7d0fe733d1afcc1f4`: `ZernioAccount._id`, `ZernioConversation.accountId`,
`ZernioCommentedPost.accountId` and `ZernioMessage.accountId`. `external_account->>'id'` was
already verified to hold the same value, so the join is correct and no thread or comments row
404s on an id-space mismatch.

The sibling row type (`ZernioCommentedPost`, which feeds the identical join through
`/inbox/comments/[accountId]/[platformPostId]`) was checked in the same pass and is pinned
alongside it in `packages/publishing/src/zernio/inbox-live.test.ts`.

**No ask outstanding.** `lib/zernio/scope.ts` re-tiered.

---

## wt-pub: `meta.accountsQueried` counts something we cannot name

`[LIVE 2026-08-10]` `/inbox/conversations?profileId=6a75cae32853ee463c6419d6` returned
`meta.accountsQueried: 2`. That profile has **one** account, and `GET /accounts` **unscoped**
returns exactly **one** account on the entire API key — so 2 is not a count of accounts in any
sense we share, scoped or not. The unscoped conversations call reports the same 2.

**Impact, already fixed here:** `emptiness.ts` rendered it verbatim as *"All 2 connected accounts
answered"* to a customer with one Instagram account. The `ok` and `empty` branches no longer print
a count; the `partial` branch keeps Zernio's own `N of M` ratio intact, since cross-sourcing it
against our `connections` count would produce the worse lie *"2 of 1 did not answer"*.

The `accountsQueried === 0` comparison is untouched and is confirmed correct — the live reviews
payload reports 0 with no GBP ever connected, and resolves to "connect an account".

**Ask:** what does `accountsQueried` count — accounts, per-account sub-queries (DM + story replies?),
or something else? It is the only signal distinguishing "asked nobody" from "asked and got nothing",
so its unit matters even though we no longer print it.

---

## wt-pub: `/inbox/comments` returns every post, not posts with comments

`[LIVE 2026-08-10]` it returned **six** posts for `@testingg53`, of which **one** carried comments
(`commentCount: 2`); the other five were `0`. The endpoint name, `reads.ts` and
`commented-post-row.tsx` all described it as "the posts that have comments".

**Impact, already fixed here:** `rows > 0` was permanently true, so the surface rendered *"Showing
your comments"* for a workspace with no comments anywhere and the *"No comments yet"* state was
unreachable. `lib/inbox/commented-posts.ts` now filters before classification, and `hasMore` is
threaded through so a page that filters down to empty with more behind it says "could not confirm"
rather than "none yet".

**Ask:** is there a server-side filter (a `hasComments` or `minComments` parameter) so paging does
not have to over-fetch? Filtering client-side means a page of 50 posts can yield 0 rows while the
comments sit on page 2.

---

## wt-pub: `/inbox/comments/{postId}` omits `nextCursor` entirely

`[LIVE 2026-08-10]` its `pagination` is `{"hasMore": false}` — the object is present and the field
is absent, so `data.pagination ?? EMPTY_CURSOR` never fired and `undefined` flowed out through a
field typed `string | null`. Fixed with a per-field `cursor()` normaliser in `reads.ts`; no UI
consumed it yet, so this was type-honesty ahead of paging rather than a live symptom.

Same call's `meta` is a different shape again — `{platform, postId, accountId, lastUpdated}`, with
no `accountsQueried` — and `/inbox/conversations/{id}/messages` sends no `meta` at all. `reads.ts`
had claimed `ZernioInboxMeta` rode on every `/inbox/*` response; corrected.

**Ask:** confirm whether the omitted `nextCursor` means "no more" or "cursors unsupported on this
endpoint". They page differently and only one of them is safe to build a "load more" on.

## wt-db: `NOT_RESCHEDULABLE` is restated in apps/web

`savePost` (`app/actions/posts.ts`) refuses a `scheduled_at` change on a post whose status
is `published`, `failed`, `expired` or `publishing`. That list is a hand copy of
`reschedule_post`'s own guard, which is the authority.

Two copies of one rule is the drift hazard this repo keeps getting bitten by. apps/web
cannot call `reschedule_post` from `savePost` — the RPC also sets `status`, and `savePost`
is deliberately forbidden from touching status (a hand-rolled call could otherwise write
`published`).

Asked for: either a `posts_reschedulable(status)` SQL helper apps/web can query, or a test
in packages/db that fails when the two lists diverge. Until one exists, a change to
`reschedule_post`'s guard must be mirrored here by hand.

Context: 2026-08-10. Two posts carried a fresh `scheduled_at` while still `expired`; the
only symptom was a cron sweep that never found them.
