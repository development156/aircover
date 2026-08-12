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
