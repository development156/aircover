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

## ~~owner: two onboarding stacks~~ — RESOLVED 2026-08-12, flow from one, plumbing from the other

Both lanes are merged. The decision taken, on the owner's instruction: **the FLOW is
wt-onboard's** (intake → door → question → reveal; Spark, Refine and Theme deleted; the 17
question variants and free-until-first-Approve stand) and **the PLUMBING is wt-brain's**
(`@sahoda/research` for URLs, `openUploadDoor` for PDFs). `fetch-site.ts`, `site-text.ts` and
`pdf-text.ts` are deleted.

One piece of the losing side was kept because the winning side has no answer for it —
`declaredColors`, now `lib/brand/declared-colors.ts`. See the note below on what else the
replaced door did.

## ~~owner: `resolveBrand` is a live 50-credit endpoint~~ — DELETED 2026-08-12

`resolveOnboarding` is now the only charged resolve, so the second endpoint is gone along with
its test. `saveBrandMemory` stayed — different export, same file, still the Brand Brain write
path for `brand-field.ts` and the reveal's Approve.

The money-path guard in `lib/brand/resolve-object-ref.test.ts` was REPOINTED at
`onboarding-resolve.ts` rather than deleted. A guard left reading a file that no longer charges
keeps passing while the thing it protects moves out from under it, which is worse than no guard.
It also now asserts `brand-resolve.ts` contains no `withCredits`/`runTask`, so the endpoint
cannot quietly come back.

**Orphaned by the rewire, reported rather than swept** — none is referenced outside its own
tests, and whether they are deleted or kept for a future screen is a call for their owner:
`openUrlDoor` and `applyExtractedFields` (in `lib/brand/url-door.ts`, which still houses the
live `openUploadDoor`), `lib/brand/spark-to-resolve-input.ts`, `lib/onboarding/address-guard.ts`,
and `DoorProvenance` in `lib/brand/resolve-result.ts`.

## ~~owner: a PDF text-extraction dependency~~ — WITHDRAWN 2026-08-12, no dependency needed

The ask was to add `unpdf` or `pdf-parse` so the hand-rolled `node:zlib` extractor could stop
failing on scans, CID fonts and object streams. It is withdrawn: `pdf-text.ts` is deleted and
PDFs go to `openUploadDoor`, which hands the file to the model as a data URL. The model reads
the formats the hand-rolled parser could not, so the gap the dependency was for is closed
without one.

**`gateText`/`measureText` went with it, and that was the argument worth stating.** The entry
called the gate "the valuable half", and it was — against an extractor that could emit mojibake
that LOOKS like prose. That failure mode is gone with the extractor: the model either reads the
document or returns nothing, and `openUploadDoor` already fails `unreadable` on zero fields
rather than serving an empty brand as a success. Keeping a legibility gate for output that can
no longer be illegible would be keeping the answer to a question nobody asks any more.

**The cost line this creates.** URL = one model call (`brand_guidelines`). PDF = two
(`brand_extract`, then `brand_guidelines`). On the free first resolve that is doubled unpaid
provider cost on the PDF path — deliberate, and noted here because nothing on screen shows it.
`openUploadDoor` returns `annotations` so a re-parse of the same file is free, but screen 2 reads
the door and screen 4 resolves, and they are not carried across that hop; its own comment says
the saving is per-session only, so this drops a saving rather than a correctness property.

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

## note: what the replaced onboarding door did that `@sahoda/research` did not

Added 2026-08-12 by wt-web, when `fetch-site.ts` / `site-text.ts` / `pdf-text.ts` were replaced.
Four differences, and only one of them favoured the package that won.

**1. DNS rebinding — the deleted door was STRICTER, and this is now fixed in research.**
`safe-fetch.ts` carried a comment reading _"KNOWN RESIDUAL: DNS rebinding. We resolve, check,
then fetch, and a hostile resolver can answer differently between those two steps."_ The door it
replaced had already closed that: `node:http` accepts a `lookup` function which is called BY THE
SOCKET at connect time, so the address approved is the address used, with no second resolution
left to disagree. Swapping the fetchers as-is would have been a security REGRESSION on the one
surface where a customer types a URL our server then fetches. Ported as
`packages/research/src/pinned-fetch.ts`, wired in under the existing `fetchImpl` seam so none of
`safeFetch`'s redirect, cap or content-type logic changed. Its blind spot is carried over too:
Node never calls `lookup` for an IP LITERAL, so `http://127.0.0.1/` is checked explicitly — the
original found that by executing it against a live loopback server, and the test does the same.

**2. The address blocklist was more complete.** research covered every range that leads to a real
bypass (loopback, link-local/metadata, private, CGNAT, multicast). The deleted `address-guard.ts`
also listed the reserved ones — `192.0.0.0/24`, TEST-NET-1/2/3, `198.18.0.0/15`. None is
routable, so none can be a customer, and they are now refused rather than timed out on.

**3. Theme colour from a server-fetched page — KEPT, because research has no answer.**
`lib/brand/color-extract.ts#extractPalette` takes an `HTMLImageElement` and reads pixels through
a canvas: browser-only by construction. It can run on a logo a founder drops into the page and
never on markup we fetched server-side, and decoding the logo in Node instead would mean a new
image dependency for one meta tag's worth of signal. So `declaredColors` reads what the page
SAYS rather than what it looks like — `<meta name="theme-color">` outranks everything (it is a
deliberate declaration), otherwise the most-repeated non-neutral hex or `rgb()` in the markup,
with near-white / near-black / near-grey rejected as the page furniture every site has. Kept
verbatim as `lib/brand/declared-colors.ts`. Research converts HTML to markdown and discards the
markup, so it is reached by a new `onLandingHtml` hook on the direct source, called from `map()`
ONLY — one page's HTML, by construction rather than by discipline. Tiers 2 and 3 return text and
markdown and never call it, so a site read by either yields no colours, which `declaredColors`
already treats as a first-class answer.

**4. Everything else was subsumed, and research is better at all of it.** `htmlToText` →
`htmlToMarkdown`; `pageTitle` → the crawl's own `title`; one page → up to five, because one page
yields the CATEGORY's voice and not the company's; a single failure string → six named reasons
each of which is a different sentence to the founder; and, the one with no counterpart at all,
`quarantineCorpus` — the replaced path sent raw page text into a model prompt with nothing
saying it was evidence rather than instructions.

## wt-db: `ops_workspace_reset(p_workspace_id uuid)` — the console's reset has no write path

Added 2026-08-12 by wt-web. The `/admin/dev` Danger Zone is built, gated, tested and shipped;
pressing it today returns _"Reset is not available yet — the ops_workspace_reset function has not
been applied to this database."_ That sentence is the whole of what is missing.

**Why it cannot be done from `apps/web`, and each reason is decisive on its own.**

1. **One transaction.** Thirteen sequential `.delete()` calls have none. A failure on the fifth
   leaves a half-reset workspace with no resume path and no record of where it stopped.
2. **`brand_memory` and `memory_events` carry `app.apply_tenant_read_policy`** — SELECT only. No
   client can delete them, and the Brand Brain is the headline item of a reset.
   `inbox_threads`, `inbox_messages` and `leads` likewise have select/update/insert policies but
   **no delete policy**.
3. **Two different identities.** `/admin` authorises against `ops_admins`; an RLS delete is scoped
   by `app.member_workspace_ids()`. An ops owner need not be a member of the workspace being
   reset, so a client-side delete would affect nothing — or the wrong tenant.

**Signature and guard** — mirror `ops_admin_upsert` exactly:

```sql
create or replace function public.ops_workspace_reset(p_workspace_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare caller text := app.ops_owner();   -- raises 42501 for anyone else
```

Raise `OPS_RESET_UNKNOWN_WORKSPACE` when the id matches no row (the action already maps it), and
write one `ops_audit_log` row with `action = 'workspace.reset'` and the per-table counts.

**CLEAR these thirteen** (the app reads the same list from `apps/web/src/lib/ops/reset-scope.ts` —
`RESET_CLEARS` — so please keep the two in step):

`brand_memory`, `memory_events`, `posts`, `post_variants`, `post_media`, `planner_events`,
`sites`, `site_pages`, `site_sections`, `inbox_threads`, `inbox_messages`, `leads`, `tour_progress`

**KEEP, each for its own reason** (`RESET_KEEPS`): `credit_ledger`, `credit_balances`,
`subscriptions` (money — the ledger is append-only and is the financial record), `connections` and
`connection_secrets` (no re-authorising), `workspace_themes` (Brand Skin), `workspace_members`,
`post_publish_logs` and `audit_logs` (append-only evidence).

**NEVER NAME THESE, and this is the trap worth stating.** `plans` and `guide_tours` carry
`using (true)` policies — they are GLOBAL catalogues every tenant reads, not rows belonging to
anyone. A per-workspace reset that named them would delete the product's own configuration for
every customer at once. `RESET_NEVER_GLOBAL` holds them with a test asserting they are in neither
list.

**One behaviour to confirm rather than assume.** `post_publish_logs` carries
`app.block_mutations()`, which returns instead of raising when `pg_trigger_depth() > 1` — so a
CASCADE from `posts` passes through, but a direct delete raises `restrict_violation`. If those
rows cascade from `posts`, the append-only guarantee is being satisfied by the escape hatch rather
than by the reset avoiding them; worth deciding deliberately, because "publish history survived a
reset" is a promise the Danger Zone copy makes to the operator on screen.

## owner: the mesh tier guide and the routing table now disagree on brand_guidelines

Added 2026-08-12 by wt-web. `TASK_TIER.brand_guidelines` moved from `standard` to `economy`
(claude-haiku-4.5) on a measured bake-off — n=3, one intake, strict schema, all five candidates
passing schema 3/3, so the decision turned on the RED LINES:

| model               | red lines                      | cost        | latency  |
| ------------------- | ------------------------------ | ----------- | -------- |
| sonnet-5 (was)      | 4, specific                    | $0.0227     | 24.6s    |
| **haiku-4.5 (now)** | **4, specific**                | **$0.0040** | **9.3s** |
| gpt-5-mini          | 3, specific                    | $0.0040     | 27.2s    |
| gemini-2.5-pro      | 2, thin                        | $0.0225     | 21.0s    |
| gemini-2.5-flash    | 2, verbatim echo of the intake | $0.0015     | 4.0s     |

`gemini-flash` is the cheapest and fastest and was disqualified on the text, not the price: it
returned "health benefit claims" — the input, handed back. haiku wrote "Never use 'artisanal' or
'craft' as a marketing crutch", a rule nobody supplied.

**The sahoda-mesh skill still documents `brand_guidelines = standard`.** Either the guide is
updated or this is reverted; a doc and a routing table that disagree is how the next person makes
the wrong call confidently.

**Also fixed in passing, and worth knowing:** `TIER_ROUTES` pointed `nano` and `economy` at
`anthropic/claude-haiku-4-5`, which is **not in OpenRouter's model list** — the alias it used to
resolve through is gone. Production logs show recent calls normalising to `claude-haiku-4.5`, so it
was working on borrowed time. Corrected to the canonical slug.

**One thing to re-measure before trusting the new route:** haiku returned `signal_lock: 'strong'` on
all three runs where sonnet said `'moderate'`. On this intake either is arguable, but signal_lock is
a claim about certainty, and a model that always says strong is worthless. Re-run against a
deliberately THIN intake.

## wt-db: nothing bounds a per-workspace resource count, so the entitlements gate cannot be atomic

`checkEntitlement` is now mounted (wt-limits) at the two live call sites: `generateSite`
and the Zernio OAuth return route. It is a stateless calculator over a `currentUsage`
the caller supplies — it counts nothing and takes no lock, which its own doc is explicit
about. Two concurrent `generateSite` calls on a Starter plan can both count 0, both pass,
and both insert: 2 sites on a plan that allows 1.

The gate's doc names the only two remedies. Neither is reachable from apps/web:

1. **Count inside the inserting transaction.** `generateSite` writes across `sites`,
   `site_pages` and `site_sections` as three separate PostgREST calls. There is no
   transaction to join.
2. **A DB constraint bounding the resource per workspace.** None exists.
   `subscriptions_one_live` bounds subscriptions, not resource counts.

A plain unique index or `check` cannot express this: the bound depends on the
workspace's current plan, which lives in `subscriptions` → `plans.limits`.

**Request:** a `SECURITY DEFINER` insert function for `sites` that re-counts and compares
against the plan's limit in the same statement — the shape `apply_ledger_entry` already
uses, and for the same reason (the check and the mutation being one statement is what
makes a guarantee possible). Same shape would serve `connections` if the channel count
ever needs to be hard rather than best-effort.

Until then the window is open, documented at both call sites, and recorded as F4 in
`docs/ux-findings.md`. The failure direction is over-provisioning a paid resource under a
race — never a charge for nothing, since the gate runs before any credit hold.

---

## For wt-onboard — persist the intake, or the mandated tier is the floor and nothing else

**Filed by wt-gate, 2026-08-12.** The refusal gate (doc 18 §8) now runs as a condition of
publishing. Layer 1 resolves the rule set from `regime x locale`, and it cannot: onboarding
parses `IntakeSchema` in `actions/onboarding-resolve.ts`, hands it to `toResolveInput`, and that
function folds it into prose (`REGIME_NOUN` inside a sentence). Nothing stores the three picks and
nothing can read them back.

The measurable consequence, pinned by
`packages/shared/src/gate/resolve-ruleset.test.ts` ("gives a clinic the floor, not the healthcare
pack"): **every existing workspace resolves to `consumer` with basis `default`, so the mandated
tier is the floor pack alone.** A clinic that picked "Health & care" gets the general
advertising floor, not `regime-healthcare`. The OWNER tier — their own `taboo.red_lines` and
`voice.banned_phrases` — works fully today and is the half that protects people on day one.

**The ask, and it needs no migration.** Write the intake into `brand_memory.payload` as
`intake: { model, regime, locale }`. `public.resolve_brand_memory` validates the six sections and
ignores anything else, which is the same seam `field_meta` already rides on. The gate reads it
through `intakeFrom()` in `packages/shared/src/gate/brain-rules.ts` — already written, already
tested against a payload that carries one, and returning `basis: 'default'` until it does.

Please do NOT stamp `basis: 'declared'` for a value the user did not pick. The gate's refusal copy
branches on it: `declared` may say "this comes with the trade you told us you are in", and
anything else must say "this applies to every business". Attributing a floor rule to a regulator
nobody consulted is the failure this whole surface exists to prevent.

---

## For wt-db — nothing records who approved a post

**Filed by wt-gate, 2026-08-12.** Doc 18 §8 requires the audit trail to answer "who approved,
when" and requires escalation "to a named human". Neither is answerable from stored data:
`approvePost` (`actions/planner.ts`) writes exactly `{ status: 'approved' }` and records no
approver, and `posts` has no column for one. `posts.created_by` is the AUTHOR, which is a
different person and a different claim.

So `audit_logs.meta.approver` is written as an explicit `null` on every gate row today — an
honest gap rather than a placeholder, and deliberately not filled with `actor` (the job run
identity, `web:<uuid>` or `cron:<postId>`), which identifies whoever triggered the publish and not
whoever reviewed it. Filling it with "whoever happened to be logged in" is the thing doc 18 §8
names outright.

**The ask:** an approver identity recorded at the moment of approval — `posts.approved_by` +
`posts.approved_at`, or an `approvals` row if the history matters. Until then the gate can prove
which rule set was in force and that a check ran, but not who stood behind it, and the product
must not claim otherwise.

---

## For whoever owns the composer — Preview still promises green on a post the gate refuses

**Filed by wt-gate, 2026-08-12.** `simulatePublish` (`actions/posts-publish.ts`) runs
`validateVariant` plus the fixture adapter and reports per-channel "would have been accepted".
It does NOT run the refusal gate, so a post carrying a red line previews clean and is then
refused at publish. That is the same shape as the promise this lane exists to keep — a screen
saying a check passed when the check never ran.

It was left out deliberately rather than overlooked. The gate needs the Brand Brain (readable by
the RLS anon client) and a mesh call (available server-side), so a preview-mode gate IS buildable
in apps/web — but it must NOT write an `audit_logs` row (a preview is not a publish, and the
table is server-only insert anyway), which means a second binding with the audit write omitted
and the decision rendered as advice rather than as a refusal. That is its own piece of work and
its own set of copy decisions.

Until it exists, do not describe Preview as a compliance check anywhere in the UI. It checks the
channel's limits, and that is all it has ever checked.

---

## Also open: the gate holds, but nothing ASKS

Doc 18 §8's rule is "stop and ask", and escalation "to a named human". The gate stops. Nothing
asks: a held post lands `failed` with `GATE_HELD` and its reason on the variant, and somebody has
to go and look. There is no notification, no review queue, and no owner assignment — and the
approver gap above is the same hole from the other side. A held post inside a scheduled window
therefore expires quietly once the dispatch grace passes unless a person happens to notice.

## For wt-db: `posts.channels` is the only channel column with no vocabulary constraint

`20260718000004_content.sql:12` is `channels text[] not null default '{}'` — no CHECK — while
`packages/shared` parses the column against a strict four-member enum. Every other channel column
in the schema is constrained (`connections.platform`, `post_variants.channel`).

MEASURED 2026-08-22, read-only against production: the column currently holds only `gbp`,
`instagram`, `linkedin` and `x`, so no drift has occurred. A fifth value would be storable, and
would then be dropped SILENTLY on read — `listPosts` does `flatMap` over `safeParse`, so the post
would vanish from the list rather than raise.

Asked for rather than written here because only wt-db edits migrations. The parity test that would
catch a future divergence between the enum and the CHECKs is worth adding at the same time; the
pattern is `apps/web/src/lib/connections/status-vocabulary.test.ts`, which parses the CHECK out of
the migration and scans the source for literals compared against it.

## Radar (wt-radar-ui, 2026-08-22)

Three things this lane needed and could not do itself.

### 1 · `posts.origin` cannot say `'radar'` — owed to whoever owns packages/db

Migration `20260718000004_content.sql` declares
`origin text not null default 'manual' check (origin in ('manual', 'plan_week'))`.
A draft written from a Radar observation is therefore stored as `'manual'`, which is
wrong in one specific way: a future query asking "which posts did a person write by
hand" will count them. `app/actions/radar.ts` carries the same note at the constant.

Widening the CHECK is a schema change and applied migrations are immutable, so this
lane did not touch it. The value wanted is `'radar'`, and `PostOriginSchema` in
`packages/shared/src/db/content.ts` moves with it.

### 2 · The change records — owed to the wt-radar lane

`lib/radar/port.ts` is the interface this screen reads through, and its header lists
the shape wt-radar owes it. The Supabase binding (`lib/radar/store.ts`) reads
`competitors` today and reports `collector: 'watch-list-only'`, which the screen
renders as "the readings are not wired in yet" rather than as an empty feed — an empty
feed would be the claim "nothing changed", which that binding has not earned.

Flipping it to `'reading'` is one change query plus one line. The one requirement that
is easy to miss: **scan attempts must be stored on FAILURE too.** A scan row written
only on success makes "we could not check today" unrenderable, and that state is the
point of the screen.

### 3 · Is there a competitor slot cap, and what is it? — owner ruling

`PlanLimits` (packages/shared) has `channels`, `sites`, `seats`, `loopLevel`,
`twinSize` — no competitor dimension. The docs disagree with each other:

- PRD §7.1 plan table: "Growth: **Radar (3 comps)**"
- PRD M9 and FSD M9: "Track **1–5** competitors"

The watch list ships uncapped and states the per-scan price instead. When this is
ruled on it belongs in `PlanLimits` as a dimension, and
`cheapestPlanWithAtLeast('competitors', n)` will then derive the upgrade sentence the
way every other limit's is derived.

### 4 · Does the fourth certainty rung mean NOT REAL, or NOT OBSERVED? — owner ruling

`components/radar/marks.tsx` renders an inference with `.is-simulated` (hatch), per
this lane's brief. docs/26 §3.1 words that rung "Not real. A fixture.", and three
files — `brain/certainty-mark.tsx`, `audience/inferred.tsx`, `connections/catalogue.ts`
— deliberately refuse it to protect that meaning, choosing `.is-proposed` for
inference instead.

Both readings are defensible and they cannot both be house style. Under "not real"
Radar should move to `.is-proposed`; under "not observed" the rung's description in
docs/26 §3.1 needs rewording. One decision, one class name in each place.

### 5 · The Loop queries a connection status that cannot exist — owed to the Loop's lane

`connections.status` is `check (status in ('active', 'expired', 'revoked', 'error'))`
(migration `20260718000005_connections.sql:9`), and `upsert_connection` writes
`'active'` on every successful OAuth return (`20260719160916:184`). No migration adds
`'connected'`.

Two places filter on it anyway:

- `apps/web/src/lib/loop/read.ts:97` — the connected-channel list behind the Autonomy Dial
- `apps/web/src/app/actions/loop-cycle.ts:82` — the cycle's connected-channel check

Both match nothing, always. The Autonomy Dial therefore renders its "Connect a channel
and its dial appears here" branch for every workspace including fully connected ones,
and the cycle takes its zero-channels path unconditionally.

MEASURED, not read: `e2e/radar-to-draft.spec.ts` staged a connection with
`status: 'connected'` and Postgres rejected the row with
`violates check constraint "connections_status_check"`.

`lib/connections/read.ts:100` and `lib/audience/page-data.ts:148` already use `'active'`
and are correct. Not changed from this lane: flipping the two lines turns a
permanently-empty list into a populated one, which is a behaviour change in the Loop's
feature and wants that lane's own tests run against it.

### 6 · `motion.spec.ts`'s scrim check is wrong under a production build — owed to whoever owns the design system

The test reads `--scrim` off `documentElement` and takes its alpha with
`/[\d.]+\s*\)$/`, defaulting to `'1'` when that finds nothing.

Next's CSS minifier rewrites the authored `rgb(0 0 0 / .4)` into `#0006` (light) and
`#0000009e` (dark) — the same 0.4 alpha, hex-encoded, with no parenthesis for the
regex to find. So `alphaOf(token)` silently returns 1 and the assertion compares the
correctly-measured backdrop (0.4) against a fabricated 1.

**The app is right in both modes.** The backdrop is 0.4 in dev and in production. It is
the test that is wrong, and only against a minified stylesheet.

`pnpm gate` runs `test:smoke` against `pnpm dev`, which does not minify, so this can
never fail in the gate. It fails every time under
`E2E_SERVER_CMD='pnpm --filter @sahoda/web start -p <port>'`, which
`playwright.config.ts` documents as the faster and more production-like way to run.

The fix is a parser that understands both forms — or better, comparing the composited
`::backdrop` colour against the composited value of the token rather than parsing
either as a string. The `?? '1'` fallback should also go: a parse failure must fail
loudly, not resolve to a plausible number.

### 7 · The dev server does not survive the smoke suite on this machine

Two runs of `turbo run test:smoke` against `pnpm dev` both died at
`concurrent-edit.spec.ts` ("against the real database"), producing 78
`ERR_CONNECTION_REFUSED` and ~70 cascade failures that are one event and its echoes.
One death had a kernel OOM kill of `next-server` (2.3 GB RSS, 02:28:46); the other had
none in `journalctl -k` at all.

The same tree, same commit, against `next start`: **88 passed, 1 failed, 0 refusals.**

Worth knowing before reading any smoke failure list: count the `ERR_CONNECTION_REFUSED`
lines first. If it is non-zero, the run says nothing about the branch.

## Written at integration, 2026-08-22 (wt-integrate2)

### 8 · Playbooks: an approved-but-unexecuted run HOLDS its slot, and that is correct

Logged because it will be reported as a bug, and "fixing" it would break one of two
rules that are each right on their own.

`playbook-run.ts:312-321` writes each approved item as a post. At autonomy **level 2**
the row is created `status: 'approved'` with `scheduled_at: item.suggested_slot`;
below level 2 it is a `draft` with `scheduled_at: null`.

So the moment a person approves a level-2 run, the slot that run proposed is
**occupied on the planner by a post that has not gone out yet**. Someone looking at
the week sees the time taken and nothing published, which reads as "it says it ran and
nothing happened".

The two rules producing it:

- **A slot a run has claimed must not be double-booked.** Reserving it at approval is
  what stops the Loop, the planner and a second playbook run all writing into the same
  time.
- **Approval is not publication.** The post correctly stays `approved` until the
  dispatcher sends it, and the dispatcher's gate is `status` plus `scheduled_at` — the
  same pair the Loop's kill switch unsets.

Remove either and something worse appears: drop the reservation and two runs can land
on one slot; publish at approval and the halt that exists so nobody is surprised by a
bill stops meaning anything.

**What would actually help is a SENTENCE, not a code change.** The planner has no way
of saying "held for a playbook run, not yet sent". Until it does, the honest options
are a label on the reserved slot or a line on the run history. Whoever picks that up:
the state is `posts.status = 'approved' and scheduled_at is not null and origin =
'playbook'`, which is queryable exactly as written.

### 9 · `ledger-invariants.mjs` still sets the SESSION characteristic its sibling warns about

`packages/db/scripts/prod-probe.mjs` already documents this at the top of the file:
`set session characteristics as transaction read only` sets state on the CONNECTION,
and through a transaction-mode pooler that connection is handed to the next client
with the state still on it, so a later writer is refused for a reason it cannot see.
That file uses `begin read only` alone for exactly this reason.

`ledger-invariants.mjs:279-280` runs BOTH. The second line is the one doing the work;
the first is the one that escapes. Deleting line 279 changes nothing about what the
script can do.

**Not observed, and this note should not be read as a sighting.** The `.env` in this
worktree names the DIRECT host (`db.<ref>.supabase.co:5432`), where the session dies
with the process and nothing is inherited. It matters wherever the pooler is used,
which is what Vercel had to switch to.

### 10 · ~~Three migrations share the version `20260821000000`~~ — DONE 2026-08-23 (wt-infra)

`asset_derivatives` (wt-media), `remix` (wt-remix) and `zernio_webhook_events`
(wt-webhooks) each carry that timestamp. Git merged all three without a conflict —
different filenames — and all three are genuinely applied: every table exists in
production.

`supabase_migrations.schema_migrations` is keyed by `version`, so the record can hold
exactly one of them, and it holds `zernio_webhook_events`. The other two are applied
and unrecordable. This is a **wt-db decision**, because the only repair is renaming an
applied migration file, and no other lane may touch that directory.

For whoever picks it up: the DDL must NOT be re-run — the tables are there. Renaming
two files to unique versions and INSERTing those two rows is a record-only change.
`packages/db/scripts/prod-record.mjs` does the INSERT half and refuses any version
whose objects it cannot see first.

Separately and correctly, `20260805000000_clerk_id_remap` is NOT recorded and must
stay that way: `remap_clerk_user_ids` and `verify_clerk_remap` do not exist in
production, so it has genuinely never been applied.

**Resolved 2026-08-23 by wt-infra**, exactly as described above: `asset_derivatives`
renamed to `20260821000001`, `remix` to `20260821000002` (both versions were free —
`000100` is `lead_doors`), then recorded with `prod-record.mjs`. No DDL re-run.
`schema_migrations` 66 → 68. `20260805000000_clerk_id_remap` remains unrecorded, and
that was re-verified rather than taken on trust: neither function exists in `pg_proc`.

---

## 11 · Radar can be subscribed to now — /radar's shape, for wt-page-rest

**wt-infra opened the write path. It did NOT touch `/radar` or any component.**

### What changed underneath

`app.radar_subscribe` was granted to `service_role` only, and `app` is not an exposed
schema, so `supabaseRadarStore.add()` threw "Radar is not collecting yet" and all five
tables were empty. Migration `20260823030000_radar_subscribe_reachable` adds
`public.radar_subscribe(p_workspace_id, p_display_name, p_sources, p_label)` — applied
to production 2026-08-23 — and `lib/radar/store.ts` is now bound to it.

The inner function was NOT granted to `authenticated`, deliberately: it takes
`p_workspace_id` and `p_created_by` and checks no membership, so exposing it would have
been a cross-tenant write. The wrapper takes identity from `auth.jwt()`, checks
membership before anything, and **has no actor argument at all**.

### The shape the screen gets

`store.read(workspaceId)` now returns `collector: 'watch-list-only'` with a real
`competitors[]`, instead of `'absent'`. Draw the difference:

| state             | means                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `absent`          | the tables are not there — only if the migration is missing             |
| `watch-list-only` | **the list is real; an empty `days[]` does NOT mean "nothing changed"** |
| `reading`         | fully bound; silence genuinely means nothing changed                    |

Nothing returns `'reading'` yet. The change feed is unbound, so a "nothing happened this
week" empty state would be a lie.

Per competitor, what is real and what is not:

| field            | value                                                       | why                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | the competitor's real id                                    |                                                                                                                                                                                            |
| `name`           | the workspace's own `label`, falling back to `display_name` | the label is private to the workspace; one customer's name for a rival is never shown to another                                                                                           |
| `url`            | **always `''`**                                             | there is no `url` on a competitor. Addresses are normalised locators on `competitor_sources`, one row per source. That read is not bound yet — do not render an empty string as an address |
| `kind`           | always `'website'`                                          | see the vocabulary mismatch below                                                                                                                                                          |
| `lastObservedAt` | **always `null`**                                           | `competitor_snapshots` is empty for everyone. Never draw a "last checked" time                                                                                                             |

### THREE DECISIONS THAT ARE YOURS, NOT MINE

1. **The kind vocabularies do not match.** The screen's `CompetitorKind` is
   `website | instagram | google_business`. The registry's CHECK admits
   `website | instagram | x | linkedin | facebook`. So **`google_business` can never be
   stored** — `add()` refuses it by name rather than coercing it to `website` — and
   `x`, `linkedin` and `facebook` cannot be asked for. Widening the union changes what
   your components render, so it is your call.

2. **Only owners and editors may subscribe.** A `viewer` gets `FORBIDDEN_ROLE`.
   Subscribing is a spending decision — every source is fetched nightly, on our card —
   so it uses the same allowlist as `upsert_connection`. The screen should not offer the
   control to a viewer rather than letting them press it and be refused.

3. **The nightly collector is armed and OFF.** `radar-nightly.yml` runs only when
   `vars.RADAR_NIGHTLY` is exactly `on`. So a customer can subscribe today and nothing
   will be collected until the founder arms it. Whatever the screen says after a
   successful add must not promise a reading that is not coming.

### Where the proof is, if you need to check a claim

- `packages/db/tests/radar_subscribe_door.pglite.test.ts` — real Postgres, RLS enforced.
- `packages/db/scripts/radar-rls-live-proof.mjs` — production, anon key, minted member
  JWTs. 29 PASS / 0 FAIL on 2026-08-23, 0 rows left behind.

The two disclosure rules are proven separately and still hold after writing through the
door: a workspace sees only competitors it subscribes to, and a `COUNT` of a shared
competitor's subscribers answers **1** when the truth is **2**.

---

## 12 · Every authenticated navigation pays FIVE sequential reads before a page renders

**For wt-page-dash / wt-page-flow / wt-page-rest. wt-infra found it and did NOT fix it —
the fix is in `(app)/layout.tsx` and `components/shell/*`, which are yours.**

`read-waterfall.test.ts` read `page.tsx` files only, so it could not see anything a layout
or a shell component does. It now walks the render tree — every layout above a page plus
the server components they import — and the first thing it found is that **all 44 routes
under `(app)` carry the same five sequential awaits before their own work starts**:

```
activeWorkspaceRead → getOpsAdmin → read → soft → read
```

Five round trips, one after another, on every navigation in the product. That is the most
expensive place in the app to have a waterfall, because every route pays it, and it was
invisible to a per-page scan.

They are recorded in `read-waterfall.baseline.json` as today's truth, so the ratchet works
from here — the guard will now go red if a sixth is added. Removing them is free and
needs no baseline permission: the ratchet only refuses growth.

Worth checking first whether any pair can be a `Promise.all`. The analyser already treats
`Promise.all` and `Promise.allSettled` as parallel and will drop the count when you do.

### 11a · `/radar` has left `roadmap-honesty`'s ALLOWED list — read this before you touch the screen

Opening the subscribe path changed what `/radar` renders, and that broke a guard. The
repair is done and the suite is green again, but wt-page-rest should know why.

`lib/radar/store.ts` `read()` used to return `collector: 'absent'`, which the screen draws
as **"The weekly scan is not built yet"**. `roadmap-honesty.spec.ts` requires exactly that
sentence on every route in its `ALLOWED` list, and `/radar` was on it _because_ of that
sentence — the entry said so in its own comment.

It now returns `collector: 'watch-list-only'`, so the screen takes your other branch:

> Your watch list is stored, and the weekly readings are not wired into this screen yet.
> This is not "nothing changed" — it is Radar not being able to tell you either way.

That is the honest state and your existing copy for it is right. So `/radar` was removed
from `ALLOWED`, the same move `/playbooks`, `/brain/audience`, `/remix`, `/leads` and
`/brain/knowledge` each made when they stopped being drawings.

**The cost, stated rather than absorbed:** the per-scan price `/radar` quotes is no longer
checked by that guard. It invents no figure today and nothing there will notice if it
starts. If you would rather it stayed covered, the entry to restore is
`['/radar', [price('radar_scan')]]` — but it will fail until the screen says "coming soon"
again, which would now be untrue.

---

## 13 · The format gate is red on an untouched tree, and the fix is an ignore, not a reformat

**Lane:** research (Jiban), 2026-08-24. **Scope declared:** `.prettierignore`, one
block. Nothing under `apps/web/src`, nothing in `components/`, no token. Under an
hour.

`pnpm format:check` fails on `bc9b97b` with **nothing edited**:

```
[warn] .agents/skills/humanizer/README.md
[warn] .agents/skills/humanizer/SKILL.md
[warn] Code style issues found in 2 files.
```

That leg sits OUTSIDE turbo, so no turbo count can see it, and CLAUDE.md already
records that this exact leg "was silently red for months". It is red again, from
the moment `8077df3` tracked the skill.

**Why the fix is `.prettierignore` and not `prettier --write`.**
`.agents/skills/humanizer/` is vendored upstream content, not ours. It ships its
own `LICENSE`, its own `.github/workflows/validate.yml`, and its own
`scripts/validate-package.py`. Reformatting it diverges it from upstream and puts
our copy under a validator we did not write and do not run.

`.prettierignore` already protects exactly this class, and says so in its own
comment: `docs/` is excluded to keep "the numbered spec pack from prettier
drift". A vendored skill is the same argument.

**One thing I checked rather than assumed.** Prettier's SKILL.md edit looked at
first like a content change: it rewrites `**After:**` to `> **After:**`. It is
not. `**After:**` follows a `>` line with no blank between, so CommonMark **lazy
continuation** already pulls it into the blockquote. Prettier is making the
existing render explicit. The label reads as part of the quote today, which the
author plainly did not intend, but that is upstream's bug to fix and not ours to
bake in.

## 14 · `export-drift.test.ts` is protected by turbo's env allowlist, not by what its header claims

**Owed to:** whoever owns `apps/web/src/lib/privacy/`, and the advisor. **I have
not changed this file.** Reporting only, because the repair is a judgement call
about who is allowed to dial production and that is not mine to make alone.

That file's header says it skips safely because **"the sandbox has no `.env`"**.
CLAUDE.md withdrew that premise **today**: "The cloud sandbox now GETS a `.env`
... Changed 2026-08-24; this line previously said the sandbox has none by
design."

Its only condition is `DB_URL === ''`. In this cloud session `SUPABASE_DB_URL`
**is set**, and points at `db.rloztdhzfliyvpvxsgjl.supabase.co` — production, the
one project, 26 real workspaces.

**MEASURED, both halves:**

```
apps/web $ pnpm run test          # turbo bypassed
  × knows about every workspace-owned table, and invents none
  Error: getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co

$ pnpm turbo run test --filter=@sahoda/web --force
  ↓ src/lib/privacy/export-drift.test.ts (2 tests | 2 skipped)
```

So the gate is fine. What makes it fine is **`turbo.json`'s `test` task declaring
`env: ["SAHODA_ALLOW_LIVE_TESTS"]` under turbo 2.x strict mode**, which strips
`SUPABASE_DB_URL` before vitest starts. Proven directly with a throwaway task:
inside a turbo task the variable reads `NO(stripped)`; under `pnpm exec` in the
same shell it reads `YES`.

**Why this is worth writing down.** Two artifacts hold half a fact each and
nothing tests the seam. The test believes credentials are absent. They are
present, and an allowlist nobody wrote for this purpose is the only thing
standing between a plain `pnpm test` and a live connection to production. Add
`SUPABASE_DB_URL` to that `env` list for any reason — and something already wants
it, `@sahoda/billing: missing required env — SUPABASE_DB_URL` appears in the web
test output today — and this file starts dialling production on every gate run,
green, with nobody told.

It is read-only (`begin read only`, one `information_schema` query, rollback), so
this is not a data-loss report. It is a trust-boundary report. Note that
`packages/db` refuses this destination by identity —
`FORBIDDEN_PROJECT_REFS = ['rloztdhzfliyvpvxsgjl']`, "even with the flag set,
even with valid credentials, even if someone typed it deliberately" — and this
file calls neither that check nor the `SAHODA_ALLOW_LIVE_TESTS` flag.

**Why I did not simply add the flag.** The header is explicit that this file
exists to be pointed AT production and "run by hand when somebody has the
credential" — it is the only thing that can say what production holds. Banning
the ref would make it useless. Its real defect is that it carries a _script's_
trust model (deliberate by invocation) while living in vitest (runs whenever the
suite runs). The sanctioned prod readers next door — `prod-probe.mjs`,
`ledger-invariants.mjs` — are scripts for exactly that reason. **THE DECISION IS
YOURS:** give it its own explicit opt-in (`SAHODA_EXPORT_DRIFT_LIVE=1`, declared
in `turbo.json` or it can never be switched on), or move it out of vitest into
`packages/db/scripts/` where its trust model already holds.

**And one caveat on my own detector.** I checked the `describe.skip`/`skipIf`
suites and the DB-URL-gated files by grep. A suite that reaches a database
through a helper I did not name, or through raw `fetch` to PostgREST rather than
`pg`, is not covered by what I looked at.

## 15 · Nothing in CI runs the gate, so a green PR says only that Vercel built

**Found while checking my own PR's checks, 2026-08-24.**

**RESOLVED 2026-08-25** — the founder asked for it, so `.github/workflows/gate.yml`
now runs three of the gate's five stages on every pull request: turbo
typecheck + lint + test, root vitest, and prettier. No secrets required, because
none of those three touches the network.

The two it does NOT run are named in the workflow with their reasons, and pinned
by `scripts/lib/ci-gate-coverage.test.mjs` so a sixth stage cannot be added
without somebody deciding whether CI covers it:

- `turbo test:smoke` — it drives a browser through the real app, and the app has
  one database, which is production. On every pull request that would write test
  workspaces into the customer database automatically. It is a `workflow_dispatch`
  job instead, gated on typing the project ref into `SAHODA_E2E_ACK_TARGET`.
- `turbo build` — Vercel already builds every pull request, `js-budget.mjs`
  included.

Six mutations were run against the coverage guard and all six went red: a sixth
gate stage CI ignores, the workflow dropping prettier, a stage renamed while this
file still claims it, the smoke suite wired into the pull-request job, the
acknowledgement given a default so a click would do, and turbo declaring an env
var the workflow never supplies.

`.github/workflows/` holds five files. **Not one triggers on `pull_request` or
`push`:**

| workflow            | trigger                                   |
| ------------------- | ----------------------------------------- |
| `audience-nightly`  | `schedule` + `workflow_dispatch`          |
| `metrics-nightly`   | `schedule` + `workflow_dispatch`          |
| `radar-nightly`     | `schedule` + `workflow_dispatch`          |
| `status-page`       | `schedule` + `workflow_dispatch`          |
| `post-deploy-smoke` | `deployment_status` + `workflow_dispatch` |

PR #4 reports two checks: `Vercel Preview Comments` (success) and `probe`
(skipped). `probe` is `post-deploy-smoke`, and its skip is **correct and
deliberate** — its own `if:` is Production-only, because previews sit behind
Vercel deployment protection and probing one measures a login page. That comment
is already in the file.

So a PR here can be green with `pnpm gate` never having run against it. **The
gate exists only on somebody's machine.** That is the mechanism behind the defect
in §13 above: `pnpm format:check` sits outside turbo AND outside CI, which is how
CLAUDE.md's "silently red for months" happened and how it happened again the
moment `8077df3` landed. The two facts compound — a leg no turbo count can see,
on a repository where no automation runs any leg at all.

Worth stating plainly because the reverse is easy to assume: **a green check mark
on a pull request in this repository is not evidence that the tests pass.** It is
evidence that Vercel finished a build.

If a gate workflow is wanted, note the constraint before costing it: per
CLAUDE.md the e2e half needs `apps/web/.env.local` with Clerk keys, so a CI gate
is either unit-only or needs secrets. And per `docs/workflow/01_CONTEXT.md`
GitHub schedules only from the DEFAULT branch, which is `main` — 692 commits
behind — so anything added on a lane will not fire on a timer until that is
resolved.

## 16 · `turbo-env-wiring` scans gitignored scratch, so a local file can fail the gate

Small, self-inflicted, and worth one paragraph because the next person will lose
the same twenty minutes. Found 2026-08-24 (research lane).

`src/lib/turbo-env-wiring.test.ts` walks `apps/web` for `process.env.X` reads and
requires each to be declared in `turbo.json`. Its walker skips exactly three
names: `node_modules`, `.next`, `.turbo` (line 110). It does **not** consult
`.gitignore`.

I put a throwaway Playwright capture script in `apps/web/.ui-port-shots/` — a
gitignored directory — and it read `process.env.FULLPAGE`. The gate went red
with `FULLPAGE (read in .ui-port-shots/shoot.mjs)`. **That red cannot be fixed by
any commit**, because the offending file is not in the repository; you fix it by
editing or deleting an untracked local file, which is a confusing place to end up
when the failure names `turbo.json`.

The guard itself is good and should not be loosened casually — it is the thing
standing between a stripped variable and a silently broken production build, and
it even self-tests (`the scanner sees both process.env forms and ignores
lookalikes`). Two honest options if it is ever worth touching: skip dot-directories
in the walker, or read `.gitignore`. Neither is urgent, and the second is the one
that keeps a real `src/.something` covered.

Workaround meanwhile: take scratch configuration from `process.argv`, not the
environment.

## 17 · The UX detectors run on every screen and nothing can fail

**Research lane, 2026-08-24. Scope declaration and a measured defect list.** I am
about to work in `apps/web/src/components/` and page-level UI. Girija: read this
before starting a design session, per `08_ROLES.md`.

### What I ran

`e2e/ux-j3-sweep.spec.ts`, all six combos, against a production `next start`:
**240 frames, 40 routes, 390/1024/1440, light and dark**, one fresh Clerk account
per combo. 229 distinct by SHA. The 11 identical-frame groups are two redirects,
confirmed from the manifest's final URLs: `/create/post` to `/posts/new` and
`/brain/competitors` to `/radar`. So **38 real screens from 40 routes**, nothing
silently skipped: the spec asserts one frame per route, which is the only thing
between "forty screens audited" and "forty screens listed".

### The finding that outranks the defects

**`deadEnds`, `invisibleText`, `invisibleFill`, `touch`, `headings` and `motion`
are computed for all 240 frames, written to `.ux/manifest.jsonl`, and no
assertion anywhere reads them.**

- `deadEnds` appears exactly once outside its own definition:
  `ux-detector-selftest.spec.ts`, which tests the DETECTOR against a synthetic
  fixture. Good practice, and not a check on the product.
- `scripts/ux-report.mjs` does rank them, under the heading "DISABLED CONTROLS (a
  dead end wearing an action's clothes)". It contains no `throw` and no
  `process.exit`, and it is referenced by no `package.json` script, no
  `turbo.json` task and no workflow. **Nothing runs it and it cannot fail.**

This is `shell-probe.spec.ts` again, one layer further out: there, the 44px floor
was measured and asserted nothing. Here a whole apparatus measures nine things
well, self-tests its own instruments, writes a ranked report, and stops one step
short of anything that goes red.

Its default view is `summary`; the defects are behind `--view=defects`, which is
a flag, not a positional. `node scripts/ux-report.mjs defects` silently prints
the summary, which is how you can run this tool and see none of its findings.

### The ranked list, all measured, phone first

Discount `/design-system` throughout: it is a reference page that renders swatches
and demo controls on purpose, and it dominates several rankings as a result. Every
count below is at **390px**, which `01_CONTEXT.md` says is the product's primary
viewport.

1. **Brand-orange fills, 52 frames over the one-primary rule (docs §1.5).**
   `/brain/knowledge` and `/connections` paint **3** at 390; `/home` and `/posts`
   paint 2. `01_CONTEXT.md` names "four orange buttons shouting at each other" as
   a defect a human found in a browser in the first minute. **Caveat before
   anyone acts on this: `accent-budget.spec.ts` and `accent-area-budget.spec.ts`
   already exist.** I have not read them, so I do not know whether they measure
   count or area, or what threshold they allow. Read them first; this may be a
   threshold disagreement rather than an unguarded defect.
2. **Elements painted past the viewport, 22 frames, every one at 390.**
   `/wallet` 11, `/ads/performance` 8, `/ads` and `/ads/budget` 7, and all six
   `/brain/*` pages 2 each. **Stated precisely, because the two are different
   numbers:** these are elements whose box extends past 390, which is not the
   same as the page scrolling sideways. By `docWidth > viewport`, only
   `/design-system` actually scrolls. The rest are painted out of view or
   clipped, and each needs a frame opened to say which.
3. **Three disabled controls on customer screens** — `/loop` "Plan my week · 20
   credits", `/sites` "Generate site · 100 credits", `/settings` "Save". All six
   combos. `docs/26 §10.3` bans `<button disabled>` for this: unfocusable,
   unhoverable, unexplained.

### What is clean, so nobody re-checks it

Zero across all 240 frames: interactive elements with no accessible name, text
under 1.25:1 against its own ground, clickable things wearing an arrow cursor,
theme mismatches, frames under 6KB.

### On the three disabled controls, corrected by looking

The detector reads only `aria-describedby` and `title`, and by those it reports
all three as unexplained. **Opening the frames says otherwise**, and the detector
cannot see it: `/loop` prints "Connect a channel first. Sahoda has nowhere to plan
for." directly beneath the button. That is precise copy naming a remedy that
works, which is the product's doctrine done right.

So the defect is narrower than the detector implies, and it is real:
`generate-site-panel.tsx:162` is `disabled={blocked || name.trim() === ''}`, a
true `disabled`, so the control leaves the tab order entirely. A keyboard or
screen-reader user never reaches it and never hears the sentence that would tell
them what to do, because the sentence is a sibling paragraph with nothing tying
it to the button. The repair is `aria-disabled` plus `aria-describedby` pointing
at the copy that already exists, and a click handler that no-ops.

**What I cannot see:** I read `e2e/**` and grepped the repo for consumers of
`manifest.jsonl`. A check living somewhere I did not look, or one reaching these
measurements by another route, is not covered by that.

## 18 · The QA capture hook attributes every gate run to whatever card is in progress

**Small, and it writes false audit records, which is why it is here rather than
in a shrug. Found 2026-08-24 (research lane).**

Running `pnpm turbo run typecheck test` appends two entries to
`ops/state/qa.pending.json`, one per suite, each stamped
`"task_code": "SL-054"`, `"actor": "claude"`, `"status": "pass"`.

**SL-054 is "Production was down for 22 hours 40 minutes"** — an incident card in
the in-progress column of `ops/state/board.json`. My gate runs have nothing to do
with it. The hook appears to tag whatever card is currently in progress, not the
work that actually ran, so any session running the gate deposits pass evidence on
a stranger's card.

Committing those rows would put QA evidence on an incident nobody QA'd, so this
lane reverted the file each time instead (four times over this session). Stating
that plainly because a discarded artifact leaves no trace, and the next person
will see the same dirty file and reasonably assume it is theirs to commit.

**What is right about it, so nobody breaks it while fixing this:** the summary is
honest where it counts. It says "this run was filtered and does not cover the
workspace" rather than claiming a full pass, which is exactly the distinction
this project cares about.

The narrow defect is attribution alone. A run with no identifiable card is better
recorded with a null `task_code`, or not recorded, than recorded against a card
that happens to be open.

**IT ALSO WRITES `fail` ROWS, AND THAT IS WORSE THAN THE PASS ROWS ABOVE.**
Observed 2026-08-26 (`wt-divas2`, advisor). A deliberate `pnpm exec vitest run`,
run to reproduce a CI failure, deposited a row stamped `"task_code": "SL-054"`,
`"status": "fail"`, `"summary_plain": "The unit checks ran and something failed
(229 passed, 2 failed)."`

The two failures were REQUESTS §26's `mutation-harness` tests, which assert a
`0500` directory is unwritable and **cannot** fail on an unprivileged runner.
They are an artefact of this sandbox running as uid 0, they pass on CI, and they
have nothing to do with SL-054 — which is the card recording that **production
was down for 22 hours 40 minutes.**

So the hook stands ready to file a fabricated QA FAILURE against a production
incident. A false pass inflates confidence; a false fail on an incident card
corrupts the record of the incident itself, and an incident review is exactly
where somebody reads these rows as evidence. Reverted here too, which makes at
least five reverts across three sessions.

**A NINTH revert, 2026-08-26, wt-divas2, and this one names a new cause.** Four
more rows queued against SL-054, all `"status": "pass"`, all `"actor": "claude"`.
None came from a gate run: they are a SUBAGENT's throwaway probe files, run and
deleted inside one audit. The tests they record **no longer exist**.

So the hook does not merely misattribute a real run. It will file pass evidence
for a suite that has been deleted, onto a production-incident card, from a
process the person at the keyboard never started. Anything that shells out to
vitest deposits a row, including an agent measuring something for thirty seconds.

Two things follow for whoever fixes this. The `task_code` should come from the
work, not from whatever sits in the board's in-progress column. And a run whose
test files are gone by the time the row is written is not evidence of anything
and should not be queued at all.

## 19 · For the advisor — refining what a person types in onboarding

**Owner ruling wanted, plus two things this lane may not write.** Asked for by
the founder on 2026-08-24 against screen 03 (Audience): _"the user might write 2
words but the meaning is not derived properly, or the grammar might be
incorrect. its an important input for brand brain."_ The founder chose
**suggest-and-accept** over silent rewriting when the options were put.

### Why it cannot be built in this lane

Three of the four pieces are outside it:

| piece                                    | where it lives             | this lane        |
| ---------------------------------------- | -------------------------- | ---------------- |
| the task and its prompt                  | `packages/mesh/src/tasks/` | writable         |
| input and output schemas                 | `packages/shared`          | **frozen**       |
| a price                                  | `pricing.config.json`      | **do not touch** |
| the screen and the accept/reject control | `apps/web`                 | writable         |

`caption-rewrite` is the nearest existing task and its price is
`caption_rewrite: 1`. A refine task would be a sibling of it, not a reuse: the
caption prompt rewrites marketing copy for a channel, and this one must not
market anything. It is closer to a transcription clean-up.

### The product rule that shapes it, not a preference

The Brand Brain's whole architecture separates CONFIRMED (a person wrote this)
from INFERRED (a model guessed). Screen 03 already reads the answer back
verbatim: _"Everything I write will be aimed at GenZ, College students who wants
to learn a new skill…"_. If a model rewrites that sentence and the field keeps
its confirmed standing, the product is quoting **our** words back as **theirs**,
on the one surface built to keep those apart.

So the shape has to be:

1. the person's text is what is stored until they say otherwise,
2. the suggestion is shown BESIDE it, never in place of it,
3. accepting is an explicit press, and the accepted text is then theirs —
   the same act `confirmBrainField` performs on `/brain`,
4. declining costs nothing and leaves the field exactly as typed.

An auto-correct on blur fails 1, 2 and 3 at once, which is why it was rejected.

### Questions only the owner can settle

1. **Does it cost a credit, and is it free during onboarding?** The first resolve
   is free and onboarding is where trust is won. A refine that quietly spends
   from 100 credits before the brain exists is a bad first transaction, and
   "costs shown before spend" means the screen would have to carry a price on
   four or five fields.
2. **Which fields?** Only the audience sentence, or every free-text answer
   (name, positioning, audience, the typed trade from screen 02)? Each one is a
   call.
3. **What is it allowed to change?** Grammar and clarity only, or may it expand
   two words into a sentence? Expansion is the ask that helps most and invents
   most: "students" to "college students in tier-two cities" is a claim about
   their business that nobody made.

### What this lane can do once those are answered

The screen half: the field, the suggestion beside it, accept and decline, the
states, and the guards. Roughly a day. It needs the task and the schema to exist
first, and a price if the answer to question 1 is that it costs one.

---

## 20 · The library search that reaches a model is unranked

`packages/mesh/src/knowledge-context.ts` retrieves five library passages for
`caption_rewrite` and `content_variants`. It is honest about being
**filter-then-truncate**, not rank-then-take, and this is the note that asks for
the missing half.

**Why it cannot rank today.** PostgREST can filter on the generated `tsv`
column, and it cannot order by `ts_rank(tsv, query)` — a computed expression is
not a sortable column. So the five passages are five of the matches in whatever
order the database returns them, and a passage that mentions the tasting menu
nine times sorts no higher than one that mentions it once.

**Why the obvious alternative is worse.** `searchLibrary` uses
`plainto_tsquery`, which ANDs every lexeme. That is right for a search box.
Handed a whole caption it matches nothing at all — no passage contains all
twenty words of a post — so an AND query would have shipped a feature that
returned zero passages forever and looked exactly like an empty library. The OR
buys recall at the cost of precision, and the ranking is the precision.

**What would fix it.** A `search_knowledge_ranked(p_workspace_id uuid, p_query
text, p_limit int)` function in `packages/db`, `security definer` with its own
membership check (or `security invoker` if the mesh is given a scoped key),
ordering by `ts_rank_cd`. `packages/mesh` would call it as an RPC and the
`workspace_id` filter would move inside the function, where it stops being one
URL edit away from a cross-tenant read.

Until it exists the constant `KNOWLEDGE_PASSAGE_LIMIT = 5` is the whole cost
control, and `knowledge-context.test.ts` holds it there.

**SUPERSEDED, 25 August 2026.** The founder's ruling on `wt-core`
(`docs/workflow/08_ROLES.md`) makes every lane autonomous: writing a migration
file is free in any lane, and only APPLYING one to production is gated, from
`wt-core`. So this is no longer an ask parked with somebody else — this lane can
write it. Left here as the specification; the reason it is still unwritten is
sequencing, not permission.

---

## 21 · Four of the five reflect reasons are computed and thrown away

`lib/loop/reflect.ts` returns a `NoLearningReason` whenever a week produced no
learning, and there are five of them: `no_history`, `too_few_posts`,
`single_group`, `difference_too_small`, `numbers_too_small`. They are five
different sentences to a reader, and the file is careful about that.

`loop_cycles` can store exactly one: `reflect_skipped_no_history boolean`.
`run-loop.ts` passes `reflection.skippedNoHistory` and drops
`reflection.reason` on the floor. So every Sunday the product works out why it
had nothing to say about a business and then forgets it, and the owner is shown
a silence with no account of itself.

This matters more than a missing column usually would, because it is the exact
question `docs/49` had to answer by hand: **why has the Brand Brain never
learned anything?** The code computes that answer weekly and keeps none of it.

It is also the discipline this codebase already enforces elsewhere.
`lib/inbox/emptiness.ts` exists to keep eight kinds of nothing apart, and
`no-impossible-remedy.spec.ts` fails a screen that offers a remedy for the wrong
one. Five kinds collapsing into one boolean is the same defect those two files
were written to prevent.

**What it needs:** a nullable `reflect_no_learning_reason text` on
`loop_cycles`, checked against the five literals, written by
`setCycleStatus` alongside the boolean that already goes there. The boolean
stays — it is read by `/loop` today and removing it is a separate change with
its own blast radius.

**SUPERSEDED, 25 August 2026.** The founder's ruling on `wt-core`
(`docs/workflow/08_ROLES.md`) makes every lane autonomous: writing a migration
file is free in any lane, and only APPLYING one to production is gated, from
`wt-core`. So this is no longer an ask parked with somebody else — this lane can
write it. Left here as the specification; the reason it is still unwritten is
sequencing, not permission.

---

## 22 · Losing data every day — the model's draft is overwritten by the edit

**The founder's ruling on the Brand Brain moat, 25 August: store CORRECTIONS,
not conclusions.** The visible Brain already holds conclusions, and a hidden
layer holding more of them is a second copy of something a competitor
reproduces the moment a customer re-types it somewhere else. What cannot be
reproduced is the record of how a business fixes what Sahoda wrote, because that
only exists if Sahoda wrote the draft.

**The schema destroys it.** `posts.body` and `post_variants.body` are single
mutable columns (`20260718000004_content.sql`), and there is no revision table
anywhere in the migrations — checked by name and by grep; `audit_logs` and
`ops_audit_log` are ops tables and hold no post text. So every save overwrites
what the model produced, and the difference between the generated caption and
the published one has never been recorded for any customer.

Every day this stands, another day of the best signal in the product is thrown
away. It is also the only item on the moat list that gets HARDER to fix later:
the other two streams can be started whenever, and this one silently loses its
history until it is stopped.

**The smallest thing that stops the bleeding**, and the db lane's call between
them:

- a `generated_body text` beside `body`, written once when a model produces it
  and never updated, or
- a `post_revisions` row per save, which also answers "what did this look like
  last Tuesday" and costs a table.

The first is smaller and enough for the delta. The second is the one that does
not need revisiting.

**Two things to decide with it, and neither is mine.** Retention: these are
customer drafts, so how long they are kept belongs in the same conversation as
the rest of the data policy. And whether `caption_rewrite` counts — the rewrite
task takes existing text and returns new text, so it produces a
before-and-after even when nothing is published.

**What it unlocks.** Rewrite deltas per workspace: what was cut, what was added,
whether the opening line survived, length change, emoji added or stripped, CTA
changed. That is a model of one business's taste that no brand description
captures, it accumulates from day one with no evidence floor to clear, and it is
invisible to anyone outside the product.

**The measure that keeps it honest:** average edit distance per post should FALL
over months, per workspace. If it does not, the learning is decorative and the
screen must not claim otherwise. That number is also the customer-facing version
of the moat — outputs needing less fixing is a thing a person feels.

**SUPERSEDED, 25 August 2026.** The founder's ruling on `wt-core`
(`docs/workflow/08_ROLES.md`) makes every lane autonomous: writing a migration
file is free in any lane, and only APPLYING one to production is gated, from
`wt-core`. So this is no longer an ask parked with somebody else — this lane can
write it. Left here as the specification; the reason it is still unwritten is
sequencing, not permission.

---

## 23 · PGlite-backed suites fail under parallel `turbo run test`, and report their tests as SKIPPED

**MEASURED 25 August 2026, on this cloud container.** Not a flake, and it was
dismissed as one twice before it was diagnosed, which is the reason this entry
exists.

**It is not one package.** Any suite that boots PGlite in a `beforeAll` can lose
the race, and which one loses depends on scheduling:

- `packages/billing` — `entitlements.integration.test.ts`,
  `applyPlanGrant.integration.test.ts`, `webhooks.integration.test.ts`
- `apps/jobs` — `backfill/store.pglite.test.ts`

Both were seen failing on separate runs of the same command, and both pass alone.
Each boots a PGlite instance from `packages/db`'s real migration files, and on a
container this size, with every other package's vitest running beside it, that
boot does not finish inside the **60-second hook timeout** — the failure reads
`Hook timed out in 60000ms`.

**The dangerous part is not the failure. It is the reporting.** The run prints:

```
Test Files  3 failed | 27 passed | 1 skipped (31)
     Tests  379 passed | 35 skipped (414)
```

Three files failed and **not one test is listed as failed**. The 22 tests inside
them are counted as SKIPPED, so a reader comparing "379 passed" against a
remembered "401 passed" sees a smaller number with no failure beside it. That is
precisely the failure mode `entitlements.integration.test.ts`'s own header was
written about: it records that these suites sat behind `describe.skipIf` and had
**never executed**, while vitest reported the package as 270 passed / 26 skipped,
because "vitest reports a suite that ran nothing exactly as it reports one that
passed".

The skip was removed in August. The timeout has quietly reinstated it.

### What was measured, so nobody re-diagnoses it

- The three billing files **pass in isolation**: 3 files, 23 tests, green.
- `apps/jobs`' `backfill/store.pglite.test.ts` **passes in isolation**: 14 tests,
  green — after failing inside a parallel run of the same command.
- `pnpm --filter @sahoda/billing test` **passes**: 401 passed, 13 skipped.
- Under `turbo run test`, the same package is 379 passed, **35** skipped.
  The 22-test difference is the three suites.
- First guess was wrong and is recorded so it is not repeated: this is **not**
  the missing DNS route to production. `export-drift.test.ts` fails that way
  (`ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co`) and these do not touch the
  network at all — `openDbUnderTest()` uses PGlite unless
  `SAHODA_ALLOW_LIVE_TESTS=1`.

### It makes `pnpm gate` itself unreliable here, which is the real cost

The gate is `turbo run typecheck lint test && turbo run test:smoke && prettier
--check .`, and its first leg is the parallel run described above. So on a
container this size the gate can come back with a smaller passing count, no
failing test named, and a reader with no reason to look twice. CLAUDE.md already
carries the sentence this repeats: "a suite that ran nothing reports as passing,
which is how twenty-six billing tests never executed for months."

Until the timeout is fixed, `turbo run test --concurrency=1` is the run to trust
on this hardware. It is slower and it is honest.

### Why this is not the research lane's to fix

(Still true after the 25 August autonomy ruling: that ruling frees a lane to
write anything in ITS OWN branch. `packages/billing`'s test configuration is
another lane's work in flight, and two lanes editing the same concept is the
silent failure `08_ROLES.md` warns about.)

`git diff origin/wt-core...HEAD -- packages/billing packages/db turbo.json` is
**empty** on this branch. Nothing here touches billing, the migrations, or the
turbo configuration.

### What would fix it, for whoever owns it

- Raise the hook timeout for the PGlite suites specifically. A cold PGlite boot
  is not a 60-second operation because something is wrong; it is a database
  starting up, and it is competing for one container's CPU.
- Or make a shared PGlite instance boot once for the package instead of once per
  suite, which also cuts the wall clock.
- Raise it wherever PGlite is booted, not only in billing — `apps/jobs` has the
  same shape and the same failure.
- **And separately, make a file-level failure impossible to read as a skip.**
  That is the part that matters beyond this bug: a count of skipped tests that
  silently includes tests which were supposed to run is the same defect twice in
  one file's history.

---

## 24. `20260825000000_marketing_observations.sql` is written and NOT applied

The Marketing Brain's one table. Everything above it in the stack is built, gated
and merged-ready: the computer, the store, the weekly cron, the read, the report
block, the admin page and the mesh provider. None of it has a table to talk to.

Applying a migration to the one live database is a founder action and there is no
staging, so this lane stopped at the file. Until it is applied:

- `/api/cron/brain` returns `{ ok: false, error: 'BRAIN_CRON_FAILED' }` on every
  tick, and the heartbeat still records that the schedule fired — which is
  correct and is exactly why `recordCronRun` sits outside the try.
- `/report`'s "What Sahoda noticed" block renders the READ-FAILED sentence, not
  the empty one. That is the honest arm: nothing has established that this
  workspace has no observations.
- `/admin/brain` renders its read-failed arm for the same reason.
- `e2e/marketing-brain.spec.ts` skips, with the migration named in the skip
  reason. It probes the TABLE rather than a flag, so the day the migration lands
  it runs with no edit here and nobody having to remember it exists.

**The command is `supabase db push` against ref `rloztdhzfliyvpvxsgjl`, run by a
person.** The migration creates one table, one index and two SELECT policies. It
drops nothing, alters nothing and touches no existing row.

## 25. Playwright cannot run in the claude.ai/code remote sandbox

MEASURED 2026-08-25, and the second measurement corrected the first. What is
true: Playwright's bundled Chromium cannot complete any **HTTPS** request from a
cloud session. `https://example.com/` fails with `net::ERR_CONNECTION_RESET`,
identically to Clerk's host. Every `@smoke` spec signs in through Clerk, so the
whole smoke leg of `pnpm gate` is unrunnable here.

**It is NOT a certificate problem, and the first version of this entry said it
was.** The evidence against that reading, all from the same session:

- Chromium loads `http://127.0.0.1:45233/__agentproxy/status` — the agent proxy's
  own endpoint — with **200**. Loopback is fine.
- Chromium loads `http://example.com/` over plain HTTP with **200**. Outbound
  port 80 is fine.
- Chromium fails every `https://` URL with RESET, with no proxy flag, with
  `proxy: { server: 'http://127.0.0.1:45233' }`, and with
  `--proxy-server=… --proxy-bypass-list=<-loopback>`.
- **The proxy's `recentRelayFailures` stays empty across all of those.** It never
  saw the attempt.
- Playwright's Node-side `APIRequestContext` fetches `https://example.com/` with
  **200** from the same process, through the same proxy.

A CA-trust failure would surface as `ERR_CERT_AUTHORITY_INVALID` and would appear
in the proxy log, because the tunnel would have been established first. Neither
happens. Outbound TCP 443 from the Chromium process is being reset before it
reaches anything.

So `--ignore-certificate-errors` would **not** fix this. It is the wrong remedy
for the wrong diagnosis, and it is also the one thing nobody should reach for.
Same for importing the proxy CA into `~/.pki/nssdb`: there is no certificate to
distrust when there is no connection.

**What would actually fix it** is outside the repo: allow the Chromium process's
egress on 443, or run the smoke leg somewhere Chromium has ordinary network.

**PARTLY ADDRESSED 2026-08-25.** The `smoke` job on `.github/workflows/gate.yml`
is exactly that somewhere: a hosted runner with ordinary network, so the leg is
now runnable by anyone with the repository rather than only by whoever is at a
laptop. It is `workflow_dispatch` and requires the operator to type the Supabase
project ref, because the suite writes to production — that guard is not
loosened by moving the runner.

What is NOT fixed: a cloud session still cannot run the suite itself. It can
dispatch the job and read the result, which is the difference between "unrunnable"
and "not runnable here".

## 26. Two mutation-harness tests cannot pass as root, and this sandbox is root

MEASURED 2026-08-25. `scripts/lib/mutation-harness.test.mjs` fails two of its
twenty-three tests in a claude.ai/code session:

- `refuses the whole run when the scratch directory cannot be used`
- the sibling case that asserts the same refusal rejects

Both do `chmodSync(scratch, 0o500)` and then expect a write to be refused. The
session runs as **uid 0**, and root bypasses the permission bits: the write
succeeds, so the harness does not raise, so the assertion fails. Proven directly
— a `writeFileSync` into a fresh `0500` directory returns normally here and
reports `uid 0`.

It is **pre-existing and not caused by any lane**: the same two fail on a clean
tree at `cc2e5fb`. **CONFIRMED on the runner**, not predicted: `gate.yml` run 2 (commit `3394d38`)
reports root vitest as **14 files, 218 tests, 0 failed** in 3.72s. The same
command here reports 2 failed. GitHub's runner is an unprivileged user, so the
`0500` directory is genuinely unwritable and the harness raises as designed.
That makes the workflow cover this leg better than any cloud session can, which
is a second argument for it beyond the first.

**Consequence worth stating plainly:** `pnpm gate`'s stage 2 (root vitest) is red
in every cloud session, always, for a reason that has nothing to do with the code
under review. Anyone reporting the gate from a cloud session must say so rather
than reporting four green legs. I reported four green legs earlier in this lane
and it was wrong; corrected here and in `docs/54`.

**What would fix it:** make the two tests skip when `process.getuid?.() === 0`,
with the reason in the skip, so a root run reports "not applicable" instead of
"failing". That is a change to another lane's file, so it is recorded rather than
made.

## 27. The gate workflow fired on two pushes and then silently stopped

MEASURED 2026-08-26, within an hour of adding it. `.github/workflows/gate.yml`
produced runs for `98849d9` (cancelled by the next push) and `3394d38` (green,
11m31s), and then produced **nothing** for `eb227bb` or `2a5c9d4`. Both commits
reached the remote — Vercel built and deployed each — and `2a5c9d4`'s check list
on the pull request held only Vercel's own two entries.

Ruled out by checking rather than by reasoning:

- **Not a broken file.** The YAML parses; the only change between the last
  firing and the first miss is a comment.
- **Not disabled.** `GET /actions/workflows` reports `state: active`.
- **Not an account-wide Actions block.** `post-deploy smoke` ran at 04:35 and
  04:37, `status page` at 04:30.
- **Not unrunnable.** A manual `workflow_dispatch` on the same head started
  immediately and went green (run 3, 10m41s).

So the workflow is fine and the `pull_request` synchronize event did not arrive
twice in a row. **The cause is unknown.** The tempting story — that pushes made
with a session's proxy-injected GitHub credentials do not raise the event — does
not survive the first two runs, which came from the same credentials on the same
branch.

**What was done about it:** the trigger no longer depends on that event. `on:
push` now covers every branch, because a push is the thing that certainly
happened: the commit is on the remote. `pull_request` is kept for anything
arriving without a push here. VERIFIED: runs 4 and 5 both fired automatically on
`push`, seconds after their commits landed.

**And the concurrency group on that same line was wrong TWICE.** Recorded in
full, because the second version is the kind that reads correctly:

1. Keyed on the head COMMIT, to collapse the push/pull_request pair. It does
   that, and it also stops a newer push cancelling an older run, because two
   commits are two groups. MEASURED at once: amending a commit left run 4
   grinding twelve minutes for a SHA no longer on the branch.
2. Keyed on `github.head_ref || github.ref`. This looks right and is not. On a
   push `github.ref` is `refs/heads/<branch>`; on a pull request `head_ref` is
   the bare `<branch>`. Two strings, two groups, nothing collapses. MEASURED on
   the three-lane merge: SEVEN gate runs in flight, of which three were
   push/pull_request PAIRS for the same branch at the same SHA — lead-research,
   advisor and design each running the same eleven minutes twice.
3. `github.head_ref || github.ref_name` is correct. `ref_name` is the bare
   branch name, which is what `head_ref` already is.

`scripts/lib/ci-gate-coverage.test.mjs` now asserts the exact expression, and
names both wrong ones. Three mutations, all red: back to version 2, back to
version 1, and the block deleted.

**Why this is recorded rather than closed:** a check that silently does not run
is worse than no check, because the pull request looks covered. If a run goes
missing again after this change, the `push` event has failed too and the next
step is to stop trusting the Actions UI as evidence — a lane's own
`pnpm gate` output is then the only thing that says the gate ran.

## 28. The gate's concurrency group never collapses the push/pull_request pair, so every commit runs it twice

**Owed to:** whoever owns `.github/workflows/gate.yml` — §27's author, who is
actively iterating on it. **I have not changed the file.** Reporting only,
because editing another lane's live surface mid-iteration is how two designs of
one thing both survive, and this lane already lost a design that way today.

MEASURED 2026-08-26 on `claude/divas-kickoff-03y2g2`, head `2244c97`. Two gate
runs, both `in_progress`, same head, same workflow:

| run | event          | id          |
| --- | -------------- | ----------- |
| 106 | `pull_request` | 32950279065 |
| 107 | `push`         | 32950281597 |

§27 added `on: push` because the `pull_request` event went missing twice, kept
`pull_request` as well, and keyed concurrency on the branch specifically so the
pair would collapse into one run. The comment in the file states that outcome as
achieved. **It is not**, and the reason is one expression:

```yaml
concurrency:
  group: gate-${{ github.head_ref || github.ref }}
```

`github.head_ref` is the bare branch on a `pull_request` and **empty on a
push**, where the fallback `github.ref` is a **fully qualified ref**. So the two
events produce two different group names for the same branch:

```
pull_request -> gate-claude/divas-kickoff-03y2g2
push         -> gate-refs/heads/claude/divas-kickoff-03y2g2
```

Two groups never cancel each other. The half §27 did fix works: within the push
group, runs 93, 95 and 103 were each cancelled by the next push, exactly as
intended. Only the cross-event collapse fails.

**The cost is the shared quota.** `08_ROLES.md` records that all three people
draw on one usage pool. Every commit on every branch with an open pull request
currently runs the full gate twice, and the run is 10 to 12 minutes.

**The fix is one token:** `github.ref_name` is the branch name without the
`refs/heads/` prefix, so both events resolve to the same string.

```yaml
group: gate-${{ github.head_ref || github.ref_name }}
```

**How to prove it rather than assume it**, since the current comment is a claim
nobody watched fail: push a commit to a branch with an open pull request and
count the runs on that head. Two today, one after. That check is the whole test,
and it is the reason this entry exists rather than a silent patch.

## 28 · Draft capture is BUILT — what it covers, and the one path it does not

**Lane** `claude/lead-research-tz63ld` (owner girija, `sahoda.lane=wt-girija`),
2026-08-26. This closes the build half of §22. §22 stays as the specification.

**What is stored.** `posts.generated_body` and `post_variants.generated_body`,
both nullable, both write-once, enforced by a database trigger rather than by
TypeScript — four insert paths write these rows today and a fifth added next
month would silently opt out of a guarantee that lived in the application.

**NULL is a real answer and must stay one.** It means a person wrote this text.
Nothing backfills it from `body`, and nothing may: doing so would invent a model
draft for human writing and report an edit distance of zero for work the model
never touched.

### ⚠ THE COMPOSER PATH IS NOT CAPTURED, AND THAT IS A CORRECTNESS CALL

`posts-ai.ts` runs `content_variants` and `caption_rewrite` and **persists
nothing** — it returns text to the writing pane and the customer saves through
`saveVariant`, the same compare-and-set path a hand-typed variant uses. So a
variant generated in the composer stores `generated_body = null`.

**This was NOT left for effort.** Capturing at that save would record whatever
is in the pane at the moment the person clicks save, and by then they may
already have edited it. That text would be stored as "what the model wrote",
and every later comparison against it would report a smaller edit distance than
really happened. **A wrong draft is worse than no draft**: null declines
honestly, a wrong value produces a confident false figure, which is the
fabricated-number failure this project has hit before.

Capturing it properly needs the untouched model output carried from
`posts-ai.ts` through the pane to the save action as a separate field, and
`public.save_post_variant` gaining a parameter. That is a real change to a
function on the CAS path and it belongs in its own pass, with its own tests.
**Whoever picks it up: do not shortcut it by copying the pane's current text.**

### What the measure will actually say today: nothing, and honestly

No row in production carries a `generated_body` — the column is new and nothing
backfills. `editDistance` therefore declines with `no_captured_drafts` for every
workspace, and the pass counts it under that name. The measure becomes available
as customers generate, which is the earliest it could ever be true.

### `marketing_observations.kind` gained a value

`check (kind in ('tone_drift'))` became `check (kind in ('tone_drift',
'edit_distance'))`. The 2026-08-25 migration is applied to production and was
not edited; the constraint is replaced in the new migration.

### The decline keys changed shape — `<kind>:<reason>`

`BrainPassResult.declined` was keyed by a bare reason. Both computers decline
with `too_few_posts` and with `window_too_short`, meaning different things about
different populations, so a bare key adds two unrelated facts together. Anything
reading those keys needs the prefix.

---

## 29 · Scope claim — the composer's density, and why the wizard is NOT coming back

**Lane** `wt-divas2` (owner divas, branch `claude/divas-kickoff-03y2g2`),
2026-08-26, advisor. Declared BEFORE the first edit, per `08_ROLES.md`: two lanes
editing the same _file_ is a conflict git shows you; two lanes editing the same
_concept_ is two designs of one thing where only one survives.

**Claimed:** `apps/web/src/components/composer/*` and the screen at
`/posts/[id]` (`/posts/new`). Not `packages/publishing`, not `packages/shared`,
no migration, no price.

### The founder's brief, and the part of it that is already answered

The ask was "make this far easier to navigate, sequence flow or one page, your
call". **The call is one page, and it is not a preference — it is a decision this
repository already made, with reasons, and reversing it would re-break what it
fixed.** Recorded here so the next lane does not re-litigate it:

- `composer.tsx:47` — `/create/post` WAS a five-step wizard. It was deleted
  because it **could not generate variants**, and because a writer met one of two
  different editors depending on which link they clicked.
- `version-options.tsx:50` — the wizard collected **one** Format answer on a
  Format step and wrote it to **every** variant, so choosing a carousel for
  Instagram forced a carousel on X. Format is a per-channel column and the wizard
  flattened it.
- `version-card.tsx:65` — stacked cards over tabs is deliberate: "a control that
  shows one at a time hides exactly" the one thing no competitor does, which is a
  separate body, limit and publish state per channel.

A wizard is a tab strip over time. Both hide three of four versions, and the
non-negotiable in `/go` — _never collapse per-channel variants into one body_ —
is the same rule pointed at the same defect.

### So what IS wrong, stated as a count rather than a feeling

An untouched channel that merely follows the post still renders its heading,
state, editor, character meter, hashtag field with help text, inline-rewrite
affordance, a "Kind of post" select with its own help text, the channel's extras
(poll, first comment, co-author, or Google's button and topic), a relink control,
and a Save button with a "nothing to save" note beside it, for a channel nobody
has typed into.

**MEASURED** by rendering all four `VersionCard`s in jsdom at their default state
(no format chosen, no extras set) and counting what a writer actually meets:

| across all four cards                                   | count   |
| ------------------------------------------------------- | ------- |
| form controls (`input`, `select`, `textarea`, `button`) | **24**  |
| elements carrying their own text                        | **105** |

> **A CORRECTION, KEPT ON THE RECORD.** The first version of this section said
> "roughly forty controls". That was an eyeball estimate written from a
> screenshot, and the measurement above contradicts it: the real figure is 24.
> `docs/37` §17 forbids rendering a number the product cannot prove, and a
> planning document does not get an exemption from its own rule. The estimate was
> wrong in the direction that flattered the fix.

That is the defect. It is not that the screen is one page; it is that the page
has **no hierarchy and no progressive disclosure**, which `docs/37` §16 names as
the property that cannot be checked one element at a time. Every one of those ten
blocks is individually correct and well-argued in its own comment. That is
precisely the founder's v4 verdict repeating: _"every one an individually
defensible decision nobody weighed against its neighbours."_

### The second defect, which the screenshot shows and no code comment mentions

The captured session has **0 credits** and **four channels reading "not
connected"**. `docs/37` §16 rule 1 says a blocker leads and nothing competes with
it; `docs/37` §15 says one absence gets one statement. The screen currently
states the same absence four times in chips, offers an orange "Adapt for 4
channels · 3 credits" button to a wallet holding zero, and leads with none of it.

**What this lane is changing:** hierarchy and disclosure only. No per-channel
body is merged, no constraint is loosened, no engine verdict is moved out of
`meterFor`.

### What shipped, and how much it actually moved

`ChannelSettings` (`apps/web/src/components/composer/channel-settings.tsx`) folds
six per-channel settings behind one `<details>`: Google's button, Google's topic,
the poll, the first comment, the co-author and the AI label. The kind of post
stays out, because changing it changes that card's media rules and a control has
to be visible where its consequences are.

**MEASURED**, same method as above, before and after:

| across all four cards            | before | after  | change |
| -------------------------------- | ------ | ------ | ------ |
| form controls on screen          | 24     | **19** | −21%   |
| elements carrying their own text | 101    | **80** | −21%   |

> **CORRECTED, AND THIS IS THE SECOND FIGURE IN THIS SECTION TO HAVE FLATTERED
> THE FIX.** It first read 105 → 76 (−28%), with per-card rows claiming −45% on
> Google Business Profile. An adversarial audit refuted it and a re-measurement
> against the genuinely pre-fold component (`c68b491^`) agrees: "before" had been
> counted on the POST-fold tree, so it carried four "More settings" labels that
> did not exist before, and "after" excluded those same four labels although a
> reader plainly sees them. Both metrics are **−21%**.
>
> **The metric flatters itself a second way.** 26 of those 101 elements are
> `<option>`s inside collapsed `<select>`s, which nobody meets until a dropdown
> is opened, and roughly a third of the counted reduction is options moving into
> the fold. Honest headline: **about a fifth less on screen, and less than that
> in the things a writer actually reads.**

**This is a real improvement and a moderate one, and the difference matters.** It
is not the wholesale simplification the brief asked for. The remaining weight is
not in the settings; it is in the per-card help text, three separate "unsaved"
vocabularies that `composer.tsx` deliberately keeps apart, and the fact that four
cards each restate the same structure. Cutting further means changing what the
card SAYS, and every one of those sentences is pinned by a shape gate.

### The fold never swallows state

It opens itself whenever any of the six carries a value, and the summary names
what is set even when shut. Guarded by `channel-settings.test.tsx` (10 tests) and
proved by four mutations, each watched going red (a fifth, added after the audit, restores the naive comment-strip and turns two more red):

| mutation                                                     | test that caught it                                 |
| ------------------------------------------------------------ | --------------------------------------------------- |
| fold welded open                                             | `starts shut on a channel with nothing set` (2 red) |
| fold welded shut                                             | `opens itself when a setting carries a value`       |
| `collaborators` tested by key presence rather than emptiness | `an emptied box is not a setting`                   |
| summary stops naming what is set                             | `names what is set … once the writer shuts it`      |

### One thing the screenshot suggested that turned out NOT to be a defect

The captured session shows 0 credits and four channels reading "not connected",
so the obvious call was `docs/37` §16 rule 1: a blocker leads. **It is not a
blocker for this screen.** A writer with no connection can still write, save,
template and schedule; only publishing is blocked, and `publish-now.tsx:193`
already states it there, in two tested sentences that distinguish "some channels
can still receive this" from "nothing goes out at all". `schedule-field.tsx` says
it at the schedule, and `connection-gap.ts` keeps both honest when the read
failed. A third statement at the top would have broken the rule it invoked.

**So no connection banner was added.** Recorded because it looked correct from a
screenshot and was wrong against the code, which is the whole argument for
reading before designing.

---

## 30. The gate has not run on ANY branch since 11:08Z, and a red tick currently means nothing

**Lane** `wt-divas2` (owner divas), 2026-08-26, advisor. Found while driving PR
[#15](https://github.com/development156/sahodalabs/pull/15) to green.

**MEASURED over the 30 most recent `gate.yml` runs (254 → 283): every one
failed.** Five branches, all three trigger events, `workflow_dispatch` included.

|                      |                                        |
| -------------------- | -------------------------------------- |
| successes in 30 runs | **0**                                  |
| median run duration  | **4 seconds**                          |
| branches affected    | every branch that pushed in the window |

**The job never starts.** Job `98188669059`: `started_at` 13:06:56Z,
`completed_at` 13:06:58Z, `runner_id: 0`, `runner_name: ""`, and **no `steps`
array at all**. The check run's `output.title`, `output.summary` and
`output.text` are empty, and the logs endpoint 404s on every run including old
ones. `gate.yml`'s own header records a real run at **11m31s**.

One re-run was spent to rule out a transient: attempt 2 ran **7 seconds** and
failed identically.

**It is not the lockfile and it is not the code.** All four CI steps were run
locally, verbatim: `pnpm install --frozen-lockfile` exits 0 "Already up to
date"; `pnpm turbo run typecheck lint test --concurrency=1` is 27/27 exit 0;
`pnpm exec prettier --check .` is clean; root `vitest` is 229 passed with the
two §26 root-only failures that pass on an unprivileged runner.

**The remedy is on the GitHub account** — Actions billing, a spending limit, or
exhausted minutes — which no lane can push. Founder action.

### Why this is worse than an ordinary red

**A green tick is currently unobtainable and a red one carries no information
about the diff.** §15 exists because nothing in CI ran the gate for months, and
§27 records this workflow silently not firing twice. This is that same condition
arriving a third way, and every lane is reading its own red tick as if it were
about their own work. Anyone who "fixes" their diff to chase this will be
chasing a runner that was never allocated.

**Until it is resolved, a lane's only real evidence is `pnpm gate` run locally,
unpiped, and stated with its `Cached:` count.**

---

## 31 · The brand fill now marks what COMMITS — founder's ruling

**Ruled by the founder, 2026-08-27**, looking at the composer:

> "make clickable buttons like send and schedule orange with black text or more
> like save cancel things like that should be highlighted"

### What it replaces

`docs/37` §2.3 and §16: "exactly one solid-brand-fill element per view.
Everything else is a secondary or a link." That budget does not survive the
ruling, and leaving a permanently red guard in the tree to honour a rule the
owner has overruled would be worse than saying so plainly.

### The rule that replaces it, because a ruling with no shape is not enforceable

**Every button that COMMITS carries the fill. Nothing else does.**

Committing means it writes to the row or sends to a platform:

| carries the fill                                       | does not                                            |
| ------------------------------------------------------ | --------------------------------------------------- |
| Save (per channel)                                     | Undo, Redo, Clear, Emoji                            |
| Save all versions                                      | Polish / Professional / Friendly / Creative         |
| Adapt for N channels (spends credits, writes variants) | Schedule it / Post now (they open, they do not act) |
| Confirm schedule                                       | Save as draft, Cancel, Keep mine                    |
| Confirm and send to _channel_                          | Change the time, See the calendar                   |

The second column is the half that keeps the rule meaningful. A screen where
everything is loud tells the reader nothing about which thing is the point.

### No new colour was invented

`text-primary-foreground` is INK, not white. `button.tsx` measures the pair at
**7.15:1**, and the `primary` variant has always been orange with ink on it. The
ruling asked for a treatment the design system already had and was rationing.

### Where it is enforced

`one-fill.test.tsx`, retargeted rather than deleted. It now asserts the exact
list of fills at rest — Adapt, one Save per channel, Save all versions — and
asserts by name that the openers, the tone modes and the writing tools do not
carry it. Five mutations were watched going red, including promoting Emoji and
demoting Save.

`e2e/page-dash-hierarchy.spec.ts` still asserts the one-per-view budget on
`/home` and `/analytics`, and is untouched: the ruling was made about the
composer, and those two screens have no committing buttons on them.

---

## §32 — One Send now, and the argument it overturns

**Founder's ruling, 2026-08-27**, given with three screenshots of the live
preview:

> "the send and ..... bring it below preview publish and here also show
> connected platform where it is going just like schedule and also there should
> be two buttons save as draft ( which saves all the versions automatically ) and
> send now ( which also saves all the versions and sends it directly )"

### What it overturns, stated plainly

`finish-panel.tsx` carried a comment headed **"WHY THERE IS NO SINGLE POST NOW
BUTTON"**. Its argument: publishing is per channel, one post can be live on
Instagram and failed on X in the same second, and a single button would have to
report one verdict for four outcomes.

**That argument was right about the REPORT and wrong about the BUTTON.** One
press with N results says exactly the same true thing as N presses, and asks the
reader for one decision instead of four. The per-channel truth moved into
`send-outcomes.tsx`: one row per channel, each with its own verdict and its own
link, and `send-outcomes.test.tsx` asserts that no sentence anywhere adds them
up — including a guard against the banner returning as "1 of 2 published", which
is the same lie in a smaller font.

### The three moves

| Was                                                    | Is                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Save floating in a sticky bar, send four screens below | Both in `SendControls`, under the dry run                       |
| A chip rail: pick a channel, confirm, repeat           | Save as draft · Send now, with one confirm naming every channel |
| The channel list on the schedule route only            | `ChannelReadout` on both routes                                 |

**Both buttons save everything first.** The old bar asked for that separately
("Save all versions"), so a reader could press Save, believe their work was safe,
and lose four channel variants. `saveAllAndWait` ANDs every per-channel verdict,
attempts every channel even after one refuses, and both buttons act on the
answer: "Save as draft" prints a refusal rather than "Saved", and "Send now"
does not publish at all.

### What did NOT change

Every refusal in the publish path. `publishOne` still declines a `fixture`
response, still refuses to call a permalink-less 201 a publish, and still reads
the body rather than the HTTP status for the verdict. Those three branches lived
inside a React transition and had **no test of any kind**; they are now in
`lib/posts/publish-one.ts` with thirteen.

The confirm step also stays, and it names the channels rather than counting them.

---

## §33 — The Send button stays visible, and the bar saves again

**Founder's ruling, 2026-08-27**, with a screenshot of the live preview marking
two empty slots:

> "i want a SEND button in orange near save draft
>
> and i want a save as draft in downbar side with save and send ( rename this as
> save but the functionality remains same save and send )"

### A refused button beats an absent one

`SendControls` HID "Send now" when no channel could receive the post, on the
principle that a button which cannot work is worse than no button.

MEASURED on the preview with four unconnected channels: what the reader got was
a lone "Save as draft" and a gap where the point of the screen should be.
Nothing on screen said whether sending was missing, broken, or somewhere else.
**An absent control explains nothing.** It is now rendered and `disabled`, with
the warn block naming every unconnected channel and a link to connect one
directly above it. That is a refusal rather than a dead end, and it is why
`disabled` is honest here rather than the coming-soon pattern `design-lint`
rule 3 forbids: nothing is unfinished, the account is simply not connected.

### The bar saves again, and this time there is only one save

§32 took "Save all versions" off the sticky bar, arguing that a floating save
and a distant send put the two endings to one piece of work in two places. That
was my reading, not a ruling, and it was wrong about the cost: **a writer three
screens up a long composer should not have to travel to the end of the page to
make their work safe.**

The split was never the problem. TWO DIFFERENT SAVE FUNCTIONS were — the bar
wrote versions, the panel wrote the post, and neither said which. Both places
now call the same `saveAllAndWait`, so they cannot disagree about what "saved"
means.

| Bar control   | Fill      | What it does                                     |
| ------------- | --------- | ------------------------------------------------ |
| Save as draft | secondary | Writes the post and every version. Stays put.    |
| Save          | brand     | Writes the same, then goes to the Send it panel. |

### "Save" had to be made true

The second control was a bare `<a href="#finish">` labelled "Save and send". It
saved nothing; it scrolled. The founder asked for it to read "Save", and a
scroll link called Save is the vaguest possible label on the most important word
on the screen (CLAUDE.md rule 1). So it now saves and THEN goes: the label is
true, and the journey it existed for is unchanged.

**The order is guarded separately.** `void onSaveDraft(); jump()` looks identical
on screen and loses the work of anyone who closes the tab on arrival, so a test
holds the save open and asserts the page has not moved.

### The fill list grew by one, under the rule rather than around it

`one-fill.test.tsx` now expects five at rest: Adapt, three per-channel Saves, and
the bar's Save. §31 says the fill marks what COMMITS, and the bar's Save commits.
Its quieter sibling does not carry it, and that is asserted too — two identical
fills side by side in a floating strip would tell the reader nothing about which
one moves them on.

---

## §34 — Keywords, not hashtags: `[marketing]`

**Founder's brief**, asked for six times before this and built on the seventh:

> "In Caption Generation:
>
> 1. SEO Optimized keywords to be there
> 2. There are supposed to be keywords instead of hashtags in the following
>    format : [marketing]"

### The question that blocked it, and how it was settled

Whether `[marketing]` is an INTERNAL annotation stripped before publishing, or
literal text a follower sees. It was asked six times and never answered.

**Built literally: `[marketing]` reaches the platform exactly as written.** That
is the plain reading of "keywords instead of hashtags in the following format",
and it is the reading the product can most cheaply correct — `keywordTail` is
the only function that would change, and the composer shows the exact published
string before anybody presses Send.

### What moved

| Layer               | Before                    | After                         |
| ------------------- | ------------------------- | ----------------------------- |
| `formatForPlatform` | `\n\n#chai #pune`         | `\n\n[chai] [pune]`           |
| `charCountFor`      | counted the hash tail     | counts the bracket tail       |
| Composer field      | "Hashtags", `#chai #pune` | "Keywords", `chai in pune, …` |
| Input separator     | whitespace and commas     | commas, newlines, brackets    |
| Generation prompt   | "norms for hashtags"      | `KEYWORD_RULE`, no `#`        |

### The stored key did NOT change, deliberately

`post_variants.extras.hashtags` is untyped jsonb and production rows already
hold `#chai`. Renaming the KEY would orphan every one of them; renaming the
CONCEPT costs nothing. So `normalizeKeywords` strips a leading `#` on read —
**that function is the migration**, and no SQL runs.

### What the brackets actually buy

A keyword may contain a SPACE. `#chai pune` is two hashtags because a hashtag
cannot hold a space; `[chai in pune]` is one keyword, and it is what somebody
searching actually types. The old field split on whitespace and structurally
could not express it.

### What was NOT changed, and needs a decision

**Instagram's 30-hashtag cap is still applied to this list.**
`validateVariant` still emits `MAX_HASHTAGS`, and `violation-copy.ts` still
carries a shape gate on the exact sentence "Instagram allows 30 hashtags."
That rule is now about a list that contains no hashtags. It will not bite in
practice (nobody writes thirty keywords) and removing a Constraint Engine rule
is a larger act than a format change, so it stands. Say the word and it goes.

---

## §35 — The brackets are the writer's choice

**Founder's ruling, 2026-08-27**, answering the question §34 shipped under:

> "Give them a option to check mark if they want [] on their keywords or not ?
> if yes apply it and publish with it and if not publish the keywords normally"

A tick box per channel, beside the keywords. Ticked publishes `[chai] [pune]`;
unticked publishes `chai pune`. The line beneath the box always states the exact
string that will go out, whichever way the box is set.

### Absence means ticked, and that is load-bearing

`extras.keywordBrackets` is absent on every row written between §34 and this
ruling, and all of those publish WITH brackets. Reading absence as `false` would
silently strip the brackets from all of them, with nothing on any screen to show
it. So `keywordBracketsOn` reads `!== false`, and it is a named function in
`variant-extras.ts` rather than an inline expression **because a mutation proved
the inline version untestable** — flipping it to `=== true` left every suite in
the repository green.

### Two bugs the tests found in this change

- **The salvage path has its OWN schema map.** Declaring `keywordBrackets` in
  `VariantExtrasSchema` was not enough: `parseExtras` salvages through
  `FIELD_SCHEMAS`, so a stored `"false"` STRING survived unchecked and read as
  `!== false` — turning the brackets back on for a writer who had turned them
  off. Found by the test written to ask what the declaration actually buys.
- **The character meter had to learn the flag.** `[chai] [pune]` is four
  characters longer than `chai pune`. A meter that ignored the choice would read
  long on every post whose writer unticked the box, refusing captions that fit.

---

## §36 — Instagram's 30-hashtag cap, on a list with no hashtags

**Left to Sahoda by the founder** ("i leave it up to you"), so: **the cap stays,
its sentence changes.**

`spec.maxHashtags` is 30 because that is Instagram's HASHTAG limit. Publishing
`[a] … [31]` is not something Instagram refuses, so
`instagram allows 30 hashtags.` was attributing a Sahoda refusal to a platform
rule that does not cover this field.

Dropping the rule would leave `violation-copy.ts`'s MAX_HASHTAGS entry and its
fix-it button guarding nothing, and a thirty-item tail is a real thing to stop.
So Sahoda owns the limit and says so: **"Sahoda takes at most 30 keywords per
instagram post."** The fix-it reads "Remove extra keywords".

**The CODE stays `MAX_HASHTAGS`.** It is a stored, matched string across the copy
table, the fix-it map and the publish logs; renaming it is a data change, not a
copy change. `field` stays `hashtags` for the same reason — it addresses
`extras.hashtags`.

The shape gate in `violation-copy.ts` moved in the same commit, per CLAUDE.md
rule 5, and is still anchored at both ends.

---

## §36 — The box mirrors the post, and the template card holds two controls

**Founder's ruling, 2026-08-27**, with two screenshots.

### 1. The keyword box shows what will publish

> "when the box is tiked the square bracket is applies on the above bar also
> like for example in the box it is written cat it should change to [cat] on
> live"

§35 kept the input always bracketed whatever was published, on the reasoning
that the line beneath states the published form separately. That is two answers
to one question: a box reading `[cat]` over a post reading `cat` is lying about
the only thing the field exists to show.

**It settles on BLUR, and immediately when the tick box moves.** Rewriting on
every keystroke moves the caret out from under the writer — `cat` becomes
`[c]at` on the first character — and that wrong repair has its own guard.
Bracketed keywords settle space-separated (`[chai in pune] [monsoon]` shows its
own boundaries); unbracketed ones settle comma-separated, because
`chai in pune monsoon` is neither readable nor re-parseable.

### 2. "Helps in boosting the posts", written as the true version

> "below you should also mention helps in boosting the posts"

The line added is: _"Keywords give people another way to find this post. The
brackets only decide how they look."_

**Not "boosts your posts", and deliberately.** The BRACKETS boost nothing — they
are punctuation and no platform ranks on them, so a boost claim under that tick
box would be false about the thing it sits under. The KEYWORDS are the half that
works, because a caption carrying the words somebody searches for is a caption
search can match. No number and no promise of reach: Sahoda measures neither,
and "boosts your posts" is a figure no query produced. A test forbids `%`,
`boost` and `reach` in that sentence.

### 3. The template card is two controls

> "in use a template it should not show any thing except save it as a template
> and browse template — and in browse template they can choose the template"

The card printed the count, then every template name, then the save link — a
list nobody asked to see, in a sidebar, growing with every template saved.

At rest it is now **Browse templates** and **Save this post as a template**.
Browsing opens a panel with a name filter and the list; choosing one loads it
and closes the panel.

**The count moved rather than died.** "A count is a claim, and only one of three
reads earns it" still holds — the number now sits inside the browser, where it
answers a question somebody just asked.

**Browse is refused, never absent** (the §33 pattern). With nothing saved or a
broken read it is disabled and says which of the three nothings applies: a
failed read is not an empty library, and neither is a missing workspace. A
search that matches nothing says so in its own words and keeps `3 saved` on
screen to prove the library is not empty.
