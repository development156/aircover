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
