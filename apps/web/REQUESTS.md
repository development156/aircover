# apps/web — cross-lane requests

Requests from this lane to the owners of shared code. Mirrors `packages/billing/REQUESTS.md`.

---

## wt-db: `posts` and `post_variants` are not in the `supabase_realtime` publication

`packages/db/supabase/migrations/20260725102928_ops_platform_tables.sql:314-320` is the only
`alter publication supabase_realtime` in the repo, and it adds exactly four tables:
`ops_tasks, ops_changelog, ops_qa_runs, ops_sessions` — the admin dashboard's own live board.
Nothing has ever published `posts` or `post_variants`.

**Consequence:** the posts and planner surfaces cannot subscribe to publish state. A scheduled
post moves `draft → scheduled → publishing → published` entirely server-side (the sweep runs on
a five-minute cron, `apps/web/vercel.json`), and until this lane's change the UI learned about
none of it without a manual reload.

**Shipped instead:** a bounded poll of our own Postgres (`readPublishState`), off entirely when
nothing is in flight and when the tab is hidden. It costs Zernio nothing, so it is safe against
the 60/min ceiling shared with analytics and the inbox — but it is a fallback, not the design.

**Ask:** add both tables to the publication.

```sql
alter publication supabase_realtime add table posts, post_variants;
```

**Answered, not applied — read this before writing it again (added 2026-08-11).** The
migration exists: `packages/db/supabase/migrations/20260811000000_realtime_publish_state.sql`,
written on the `wt-db2` lane and merged to mainline in the same sequence that landed this
file. It does more than the one line above — it guards the publication AND each table
independently, because `alter publication ... add table` raises `duplicate_object` if
membership was ever set from the dashboard's Publications toggle, which leaves no trace in
this directory.

It is **written and NOT APPLIED.** Nothing has run it against any database, so the two
questions below are still open and still belong with the apply, not after it. The migration's
own header says this request is "NOT yet on wt-web, so a reader of the mainline file will not
find it" — that sentence was true when it was written and is now out of date, since both are
here. It is left uncorrected deliberately: this lane does not edit that directory.

Default replica identity is sufficient — this lane needs only the NEW row state (status,
scheduled_at, publish_status, permalink, platform_post_id), never the old values, so
`replica identity full` is not requested and would only widen the WAL.

**Two things worth deciding with it, not after it:**

1. **RLS on the subscription.** `postgres_changes` filters per subscriber against the row's
   policies, so the existing member policies should scope it correctly — but nothing here has
   been exercised against a second workspace. That test belongs with the migration, not with
   the client: an over-broad publication is a tenancy leak, not a UI bug.
2. **The client has no authenticated browser Supabase client yet.** `lib/supabase/server.ts` is
   `server-only` and `lib/ops/service-rpc.ts` is service-role. A browser client would need the
   Clerk token wired through `accessToken`, the same way the server one is. That is this lane's
   work once the publication exists, not wt-db's.

**Not blocking.** The polled path is shipped, tested and honest about its own limits. Everything
in `lib/posts/live-state.ts` is fed by a single `PublishSnapshot`, so replacing the timer with a
subscription changes `publish-state-provider.tsx` and nothing else — no card, no payload, no test.

**Unverified, and cheaply checkable:** the publication contents were inferred from the migrations,
not read. The Supabase MCP is unauthorized in this session and `.env` is permission-blocked, so
nobody has run this against the live database:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

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

**Impact, already fixed here:** `emptiness.ts` rendered it verbatim as _"All 2 connected accounts
answered"_ to a customer with one Instagram account. The `ok` and `empty` branches no longer print
a count; the `partial` branch keeps Zernio's own `N of M` ratio intact, since cross-sourcing it
against our `connections` count would produce the worse lie _"2 of 1 did not answer"_.

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

**Impact, already fixed here:** `rows > 0` was permanently true, so the surface rendered _"Showing
your comments"_ for a workspace with no comments anywhere and the _"No comments yet"_ state was
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

## ~~wt-db: `NOT_RESCHEDULABLE` is restated in apps/web~~ — CLOSED 2026-08-10

**Resolved by the second of the two options asked for: a divergence test.**

The hand copy is gone. `NOT_RESCHEDULABLE_STATUSES` now lives in
`@sahoda/shared` (`publishing/schedule.ts`, beside `DISPATCHABLE_STATUSES`), `savePost`
imports it, and `packages/db/tests/schedule_guard_parity.test.ts` parses the guard back out
of the migrations and fails if either SQL list stops matching. It needs no database, so it
runs in the credential-free sandbox and on every `turbo test` — verified red in both
directions before being declared done.

**The request understated the problem: there were THREE copies, not two.**
`release_post_for_publish` (`20260804000000_publish_claim.sql:231`) carries the same four
statuses under a different error name — POST_NOT_RELEASABLE rather than
POST_NOT_RESCHEDULABLE — and was never mentioned. The test binds both. A fourth copy was
hardcoded in `posts-save.test.ts`'s `test.each`, which is the worst place for one: it would
have kept passing against its own list while the product used a different one.

**Still open, and still wt-db's to give if it wants it:** a `posts_reschedulable(status)`
SQL helper would let both functions and apps/web read one definition instead of three
agreeing ones. The test makes drift _loud_; only the helper makes it impossible.

Context: 2026-08-10. Two posts carried a fresh `scheduled_at` while still `expired`; the
only symptom was a cron sweep that never found them.

## wt-db: per-field provenance now rides in the payload — RESOLVED here, one thing left to note

**This entry replaces an ask, and the ask is withdrawn.** wt-brainui originally requested a
`brand_field_state` table because `brand_memory.payload` was a strict `BrandMemoryPayloadSchema`
with nowhere to put a per-field flag. It turned out there was somewhere.

`public.resolve_brand_memory` validates that the six top-level sections are objects and pins the
three fixed array lengths. It does not reject ADDITIONAL keys, and the 32 KB payload ceiling has
~30 KB of headroom against a ~2 KB brain. So provenance is stored as a `field_meta` key on the
payload itself: one `FieldMeta` per dotted leaf path, using `FieldMetaSchema` from
`packages/shared/src/brand/audiences.ts` — wt-brain's contract, adopted at the granularity v1
actually has. **No migration, no change to any applied migration, nothing owed to wt-db.**

**Why it does not bloat the model prompt.** `packages/mesh/src/brand-context.ts` re-parses the
stored row with `BrandMemoryPayloadSchema` before prepending the brain to every model call, and zod
strips unknown keys — so `field_meta` is dropped there without anyone having to remember to drop it.
`brand_guidelines` still declares the unextended schema as its output, so the model has no channel
to write provenance at all. That is the same property `ExtractedFieldSchema` gets from pinning
`confirmed: z.literal(false)`.

**Both original costs are gone.** "That guess is right" — the interaction the entry called the most
valuable on the page and unrepresentable — now costs one tap: `field_meta` carries the confirmation
independently of the text, so agreeing no longer requires retyping a sentence verbatim. And Finish
writes ONE version instead of two, because the model/user pair existed only to make a diff work.

**The one thing still owed, and it is a product decision rather than a schema one.** wt-brain's v2
taxonomy classes `brand_persona.*` and `hook.primary_emotion` / `hook.sample_hooks` as `derived` —
unconfirmable by definition, since confirming a diagnosis is not a thing an owner is asked to do.
/brain offers an editor for all five and counts them in the ring. Honouring v2 would drop the
denominator from 15 to 10 and remove three cards from the page. That was not a merge decision to
take, so `lib/brand/fields.ts` stamps them `asked` and says so in a comment at the definition.

Context: 2026-08-12, wt-web reconciling wt-brain and wt-brainui. `lib/brand/field-meta.ts` is the
whole contract now; `provenance.ts` only reads what it writes.

## owner: wt-onboard and wt-brain shipped two onboarding stacks — NOT merged, needs a decision

Added 2026-08-12 by wt-web. The merge of `wt-onboard` into wt-web was **aborted**, deliberately
and cleanly. `wt-brain` and `wt-brainui` are merged and green; wt-onboard is untouched on its own
branch. This is not a textual conflict anyone can resolve by picking hunks — both lanes answer the
same product question and the answers are incompatible.

**The four conflicts** were `apps/web/REQUESTS.md`, `apps/web/src/app/actions/brand-resolve.ts`,
`apps/web/src/components/onboarding/onboarding-flow.tsx`, and a modify/delete on
`apps/web/src/components/onboarding/spark-step.tsx`. The first two are mechanical. The last two are
the collision.

**What each lane owns.**

|                | wt-brain (merged)                                                                                                              | wt-onboard (not merged)                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| screens        | Spark → Refine → Theme                                                                                                         | intake → door → question → reveal                                                                     |
| URL door       | `packages/research` (SSRF-guarded fetch, tier-1 no-vendor HTML reader, Firecrawl vendor, quarantine) + `lib/brand/url-door.ts` | `lib/onboarding/fetch-site.ts` + `site-text.ts`                                                       |
| PDF door       | `openUploadDoor` — the file goes to the model as a data URL                                                                    | `lib/onboarding/pdf-text.ts` — hand-rolled `node:zlib` FlateDecode + `Tj`/`TJ` scanner, no dependency |
| refusal        | `quarantine.ts`, failure taxonomy per arm                                                                                      | `refusal.ts`, `classify.ts`, `lexicon.ts`                                                             |
| charged action | `resolveBrand`                                                                                                                 | `resolveOnboarding` (+ `onboarding-door.ts`)                                                          |

**wt-onboard DELETES six components wt-brain extends**: `spark-step.tsx`, `refine-step.tsx`
(+ test), `theme-step.tsx`, `theme-preview.tsx`, `logo-drop.tsx`. So merging is not additive in
either direction — taking wt-onboard discards the Spark screen and the brand-book upload wt-brain
just built on it; taking wt-brain discards the rebuilt flow, the PDF extractor and the refusal
vocabulary. Both lanes are independently gate-green.

**Ask:** which onboarding ships. Then a follow-up lane cut off wt-web HEAD can port the losing
lane's genuinely additive parts — `packages/research`'s SSRF guard and quarantine are worth keeping
whichever flow wins, and so is `pdf-text.ts`'s `gateText`/`measureText` pair, which is independent
of who extracts the text.

**Also blocked on this:** deleting `resolveBrand`. It is dead only once `resolveOnboarding` exists;
today `onboarding-flow.tsx` still calls it, so removing it would take onboarding down. See the
entry below.

## owner: `resolveBrand` is a live 50-credit endpoint that should be deleted — after wt-onboard lands

Added 2026-08-12 by wt-web. `apps/web/src/app/actions/brand-resolve.ts#resolveBrand` is a
`'use server'` export, which makes it a callable RPC whether or not any UI references it — the
reason its removal matters is that it charges 50 credits (`brand_research`) and runs a model call.

It is **not** dead yet. wt-onboard replaces it with `resolveOnboarding` and repoints
`onboarding-flow.tsx`; without that merge, `resolveBrand` is the only resolve path onboarding has.
Deleting it now breaks signup.

**Do not delete `saveBrandMemory` with it** — that is a different export in the same file, still
used by `brand-field.ts` and `persist-brain.ts`.

**When it goes**, check these for orphaning rather than sweeping them: `lib/brand/resolve-result.ts`,
`spark-to-resolve-input.ts`, `resolve-object-ref.ts`, and `url-door.ts`'s two door entry points —
wt-onboard's `onboarding-resolve.ts` may or may not reuse them, and that is the merge's call.

---

## owner: a PDF text-extraction dependency for the onboarding door

Added 2026-08-12 by `wt-onboard`. UI_RULES_v3 §"Stop and ask" requires asking before adding
any dependency, so this ships without one and asks here.

Screen 2 of the rebuilt onboarding lets someone hand over a PDF — a deck, a menu, a
one-pager. Nothing in the repo could read one, and `apps/web` has no image or document
library at all (`sharp` is a transitive dep of something else, not ours).

**Shipped instead:** `src/lib/onboarding/pdf-text.ts` — `node:zlib` over FlateDecode content
streams plus a `Tj`/`TJ`/`'`/`"` operator scanner. No dependency. It handles the ordinary
case; verified against a Ghostscript-produced PDF whose ground truth came from `pdftotext`.

**What it cannot do:** scanned pages, CID-keyed fonts, object streams (`/ObjStm`), LZW.
Those are not rare. It is safe anyway because the extractor is gated — output that does not
read like prose is REFUSED with a reason, never passed to `brand_guidelines` — but a refusal
is still a door closing on a user who had a perfectly good PDF.

**Ask:** approval to add `unpdf` (ESM, no native build, bundles a pdf.js core) or
`pdf-parse`. Roughly: delete `inflateStreams`/`showText`/`readEscape`/`readHexString`, keep
`gateText` and `measureText` exactly as they are — the gate is the valuable half and is
independent of who extracts.

## wt-shared: onboarding has three enums and no home for them

Added 2026-08-12 by `wt-onboard`.

`src/lib/onboarding/intake.ts` defines `BusinessModel`, `Regime` and `Locale` with zod
schemas. CLAUDE.md says types and schemas import from `packages/shared` only — these break
no such rule (shared defines none of them, and this lane may not edit shared), but they are
product vocabulary and they will be wanted outside onboarding the moment anything else wants
to know what sector a workspace is in.

**Ask:** lift the file into `packages/shared/src/brand/intake.ts` verbatim and re-export.
Nothing else has to change; `apps/web` swaps one import path.

## wt-shared: `ResolveInput` has nowhere to put the door text

Added 2026-08-12 by `wt-onboard`.

Onboarding now reads a whole website or PDF — typically 1,000 to 20,000 words the business
wrote about itself. That is by far the richest signal the resolve has ever had, and
`ResolveInputSchema` has no field that can hold prose.

Following `spark-to-resolve-input.ts`'s precedent, nothing was smuggled. Exactly two
sentences survive into the contract, both VERBATIM and both into fields that mean what they
are (`src/lib/onboarding/to-resolve-input.ts`):

- `source.one_liner` — the first sentence long enough not to be a nav item.
- `brand.proof_point` — the first sentence carrying a year or a counted quantity.

Everything else is dropped on the floor. Paraphrasing an About page into `source.mission`
would have been the easy move and would have put words in the user's mouth.

**Ask:** a field that can carry the raw signal — `source.evidence: z.string().max(N)` or
similar — so the resolve can read what the business actually says rather than two sentences
of it. If it lands, `toResolveInput` fills it and drops nothing.

**Related, smaller:** `ResolveInput` has no jurisdiction field either. Locale currently rides
inside `source.category` as prose ("local presence in food, in India"), which works because
`category` is free text, but it is a phrase doing a field's job.

## wt-db: nothing durable counts a FREE resolve

Added 2026-08-12 by `wt-onboard`. Recorded as an accepted cost, not a surprise.

The first resolve is free, and "first" is decided server-side by
`isFirstResolve()` — true when the workspace has no active `brand_memory` row.
That follows the rule as stated (we charge for output; a user who resolved,
disliked it and left without approving took none) and it cannot be forged from
the client, because `brand_memory` is only writable through
`resolve_brand_memory`.

**The consequence:** free resolves are not counted, so re-resolving without ever
approving stays free indefinitely. Each one is a real model call. Nothing in
`apps/web` can bound it — a free resolve writes no ledger entry to count, and
`memory_events` is read-only to members, so this lane has no durable place to
record "this workspace has had its free resolve".

Mitigated in the UI as far as the UI can: Regenerate is disabled entirely on a
reveal that was LOADED rather than answered for, so the loop needs a deliberate
walk back through all three screens each time. It is not a rate limit.

**Ask:** either a `workspaces.free_resolve_used_at timestamptz` column (the
smaller change — `isFirstResolve` reads that instead, and the resolve stamps it),
or a decision that unlimited pre-approval resolves are intended, in which case
this entry closes and the behaviour is simply documented.

## owner: two things this lane found next door and did not finish

Added 2026-08-12 by `wt-onboard`. Neither is onboarding's, both were found from it.

**1. `activeThemeTokens()` is not workspace-scoped.** `src/lib/brand/read-theme.ts`
reads `workspace_themes` filtered only on `status = 'active'`, with a comment
saying RLS makes a workspace filter unnecessary. RLS scopes to the caller's
MEMBERSHIPS, which is not the same as the workspace they are currently in — so a
user in two workspaces can have the app shell painted in the other one's brand,
depending on which row sorts first. The same defect existed in this lane's
`brand_memory` reader and was fixed there by filtering explicitly.

An optional `workspaceId` parameter was added and onboarding passes it. **The app
shell's own call still does not**, because changing what colour the shell paints
for existing users is a visible behaviour change that belongs with whoever owns
the theming surface, not in an onboarding PR.

**Ask:** pass the active workspace id at the shell's call site and drop the
optional-ness.

**2. No server action in this app is rate-limited, and one of them now makes
outbound HTTP.** `readDoor` fetches a user-supplied URL. It is SSRF-guarded at
the socket (`fetch-site.ts`), capped, deadlined and redirect-checked, and it is
behind Clerk auth — but a signed-in user can point it at an arbitrary host as
often as they like, which is the shape of a traffic-amplification complaint even
though nothing is charged.

security.md asks for "rate limiting on all endpoints" and Upstash is in the
stack. Nothing in `apps/web/src/app/actions/` uses it today, so adding a limiter
to this one action alone would be both inconsistent and out of this lane's scope.

**Ask:** a decision on where the limiter lives — a shared wrapper every action
opts into, or middleware — and then `readDoor` is a first customer for it.
