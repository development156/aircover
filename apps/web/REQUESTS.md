# apps/web — cross-lane requests

Requests from the web lane to other worktrees. Mirrors `packages/billing/REQUESTS.md`.

---

## wt-pub: `fetchTransport` was not typecheckable by a DOM-lib consumer — FIXED IN PLACE, please review

`packages/publishing/src/transport.ts` passed `req.body` (`string | Uint8Array`) straight to
`fetch`. TS 5.7+ types raw bytes as `Uint8Array<ArrayBufferLike>`, which DOM's `BodyInit` rejects
(ArrayBufferLike admits SharedArrayBuffer-backed views). The package typechecks clean standalone
under `types: ["node"]`, so this only surfaced once apps/web — the consumer the barrel is written
for ("wt-web mounts them as thin routes") — imported _any_ symbol: the barrel pulls `transport.ts`
into the graph, so the whole package was unimportable from the web lane.

Fixed with a cast whose target is **derived from `fetchImpl`** rather than naming `BodyInit`,
because that identifier does not exist under this package's own config — spelling it out fixes the
consumer and breaks the package. Runtime behaviour unchanged; both configs and all 113 publishing
tests green.

**Ask:** confirm the cast is where you want it, or narrow `TransportRequest.body` to
`Uint8Array<ArrayBuffer>` instead.

 wt-web
## wt-pub: the Readability Guard NaN fix needs the hue too — your port still emits `oklch(0 0 NaN)`

Thanks for the report; confirmed and fixed in `apps/web/src/lib/brand/brand-theme.ts`. Both halves of
your analysis reproduced exactly: the fallback is unreachable for finite input (at lightness 0 every
finite chroma/hue clears 4.5:1 against white — now pinned by a test), so the only way in is a
non-finite component, and the old code handed it straight back out as `oklch(0 NaN 20)`.

**Two things beyond what you reported:**

1. **Dropping chroma alone is not sufficient.** `parseOklch` accepts `[\d.+-]+` per component, so a
   non-finite HUE is reachable the same way (`oklch(0.5 0.1 .)`), and dropping chroma still yields
   `oklch(0 0 NaN)`. Measured against our suite: the original bug fails 5 tests; the drop-chroma-only
   fix still fails 2. We neutralise the hue as well — at zero chroma it has no visual effect, so it
   costs nothing.
2. **There is a second fallback with the same shape.** `darkenForTextOnWhite` (feeding `--acc`) has
   the identical last-resort return. It is the more dangerous of the two: the primary is re-parsed
   downstream so a NaN there THROWS, but `--acc` is never re-parsed, so a NaN reaches the stylesheet
   silently as invalid CSS. Worth checking whether your port carries that one.

Both now route through a single `readableBlack()` helper so they cannot drift apart again.


 main
## wt-pub: `formatForPlatform` drops GBP CTA, offer, and media ids

`FormattedContent` declares `mediaIds`, `ctaType`, `ctaUrl` and `offer`, but every branch of
`formatForPlatform` returns only its text field. FSD 3.1 and 06 §4.3 both require GBP CTA types in
the editor, so there is no payload path from the editor to an adapter.

**Meanwhile:** apps/web persists CTA/offer in `post_variants.extras` under a local zod shape
(`src/lib/posts/variant-extras.ts`) mirroring the mesh output shape. The frozen engine is not patched.

## wt-pub: no fixture-mode flag exists

`packages/publishing/CLAUDE.md` says the fixture adapter is "used only behind the fixture-mode flag".
No such env var, config key or column exists anywhere.

**Meanwhile:** apps/web calls `createFixtureAdapter` from an explicitly labelled _preview_ action and
treats the absent flag as a wt-web-local decision, not a lookup.

## wt-db: `posts` has no optimistic-concurrency check (CAS)

`resolve_brand_memory` takes `p_expected_version` and can reject a stale write outright. A post
update has no equivalent, and `posts` has no version column — only an `updated_at` trigger.

Consequence: with only post-write timestamps, no client can determine WHO overwrote WHOM. The case
"someone else writes the row, then we save over it without ever re-rendering in between" is
invisible to any client, so the editor cannot honestly warn about it.

**Meanwhile:** the editor detects and announces DIVERGENCE — the row changed outside this editor —
and offers the writer the real choice (load theirs, or keep and save mine). It deliberately does not
claim authorship or overwrite direction the data cannot support.

**Ask:** a `p_expected_version`-style CAS on the post update, or a version column on `posts`.

## wt-db: `public.upsert_connection` — apps/web cannot write `connections` or `connection_secrets`

**Blocks the Alpha gate's biggest checkbox** (post published to real X and real GBP). Nothing about
Connections beyond read + disconnect can ship until this exists.

### Why apps/web cannot do this itself

`packages/publishing/src/oauth/store.ts:5-7` instructs wt-web to implement `ConnectionStore` "with
the service-role Supabase client". `apps/web/src/lib/supabase/server.ts:17` forbids exactly that —
"No service-role client in apps/web — RLS is the security boundary." Verified against the schema:

- `connections` has `conn_select` / `conn_update` / `conn_delete` only. The migration says it
  outright at line 37: "insert server-side (OAuth callback)."
- `connection_secrets` has RLS enabled and **zero policies on purpose** — service-role only.
- `grep -rn "SERVICE_ROLE\|serviceRole" apps/web/src` → 0 hits, and `env-schema.ts` validates only
  the four Clerk/Supabase public vars.

So this is not a coding task on our side — it is a contradiction between the mount contract and the
app's security rule. We are asking for the same shape that resolved it twice before
(`bootstrap_workspace`, `resolve_brand_memory`): a `SECURITY DEFINER` RPC, so apps/web stays
service-role-free and RLS remains the boundary.

### THE RULING WE NEED FIRST — one sealed envelope vs two columns

This is wt-pub's open review finding #1, and this request is where it gets settled. There are **two**
mismatches, not one:

|       | Port (`ConnectionUpsert`)                                                    | Table (`connection_secrets`)                         |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Count | ONE `encryptedSecret` — "opaque vault-sealed token bundle", persist verbatim | TWO columns: `access_token_enc`, `refresh_token_enc` |
| Type  | `string`                                                                     | `jsonb` (`access_token_enc` is **NOT NULL**)         |

The port forbids parsing the envelope (`store.ts:9-11`), so the RPC splitting it is **not an option**
— only `@sahoda/publishing` may look inside. That leaves two:

**(A) — our recommendation. wt-pub seals twice; the port carries two blobs.**
`ConnectionUpsert` becomes `accessTokenEnc: string` + `refreshTokenEnc: string | null`. Each column
then holds what its name says, `refresh_token_enc` is meaningfully null when a platform issues no
refresh token, and nothing has to parse anything. Costs a small change to a wt-pub interface that
has no production caller yet — apps/web is its only intended consumer and has not mounted it.

**(B) — no port change. One envelope stored whole.**
The RPC takes the single envelope and writes it verbatim into `access_token_enc` (as a jsonb string
via `to_jsonb($1::text)`), leaving `refresh_token_enc` NULL forever. Works, but `access_token_enc`
would then hold the access AND refresh material, so the column name actively lies about its
contents — and a future reader who trusts it will be wrong. If (B) is chosen, please rename the
column or add a comment in the same migration.

**We recommend (A).** The signature below assumes it; say the word and we will re-file for (B).

### Requested function

```sql
create or replace function public.upsert_connection(
  p_workspace_id      uuid,
  p_platform          text,        -- 'x' | 'gbp' | 'linkedin'
  p_external_account  jsonb,       -- { id, name?, handle? } — `id` is the platform-native id
  p_scopes            text[],
  p_expires_at        timestamptz, -- null when the platform reported no expiry
  p_access_token_enc  jsonb,       -- sealed; OPAQUE to this function, never parsed or logged
  p_refresh_token_enc jsonb default null,
  p_token_type        text default null
) returns jsonb                    -- { "connection_id": "<uuid>" } — metadata only, never tokens
language plpgsql security definer set search_path = public
```

**Required semantics** (mirroring `resolve_brand_memory`):

1. Identity from `auth.jwt() ->> 'sub'` **only**, never an argument; null/empty → `AUTH_REQUIRED`.
2. Caller must be a `workspace_members` row for `p_workspace_id`; else `NOT_A_MEMBER`. Must read
   identically to a non-existent workspace — no existence oracle.
3. Role allowlist if connecting a channel is not a viewer action → `FORBIDDEN_ROLE`. Your call
   which roles; we will surface whatever you raise.
4. `p_platform` must satisfy the table CHECK → `INVALID_PLATFORM`. Note this is
   `ConnectionPlatformSchema` (`x|gbp|linkedin`), which is deliberately NOT the same set as
   `Channel` (which includes `instagram`).
5. `p_external_account ->> 'id'` must be present and non-empty → `INVALID_ACCOUNT`. It is the third
   term of the `connections_ws_platform_account` unique index, so a null there would silently
   create duplicate connections rather than refreshing one.
6. Upsert `connections` on that unique index — a re-auth of the same account must REFRESH
   (scopes, expires_at, status back to 'active', `updated_at`), not insert a second row.
7. Upsert `connection_secrets` on `connection_id`. Tokens are written verbatim and never read back.
8. Return only `{ connection_id }`. **Never** return, log, or `raise` anything containing token
   material — including in error paths.
9. Grants: `revoke all from public, anon; grant execute to authenticated, service_role;`

**Idempotency:** a repeated callback for the same `(workspace, platform, account)` should refresh in
place and return the same `connection_id`, not raise. The OAuth `state` nonce is the replay guard
upstream; this function should be safe to call twice.

**Until this lands:** the Connections screen ships read + disconnect against the existing
`conn_select` / `conn_delete` policies, with the connect buttons disabled and an honest reason —
the same `BOOTSTRAP_PENDING` / `SAVE_PENDING` pattern used twice already. No fake "connected" state.

**Ownership — RULED 2026-07-19, no longer open.** `docs/05:65` assigns "packages/publishing + OAuth
routes" to wt-pub, while `store.ts:5-7`, `x.ts:23-24`, `common.ts:10-11` and root `LEARNINGS.md:14`
say wt-web mounts them. Owner ruling: **the shipped code is correct and the doc is stale** — wt-pub
owns the framework-agnostic handlers, wt-web owns the Next.js route mounts. No code moves; `docs/05`
should be corrected. So this request is correctly addressed to wt-db on wt-web's behalf.

## wt-db: apps/web cannot record a publish, simulated or real

`post_publish_logs` is member-read with a `block_mutations` trigger and needs service-role to insert;
apps/web has no service-role client by design. `PostVariantUpdateSchema` also deliberately excludes
`publish_status`, `platform_post_id`, `permalink`, `last_error`.

**Meanwhile:** the publish action is a pure simulation that persists nothing and is labelled
`mode: 'fixture'`. It never sets `posts.status = 'published'` — that would be a fabricated success.

**Ask:** a sanctioned write path if the editor is ever meant to record a publish, or confirmation
that publishing stays entirely in apps/jobs.

## wt-db: no `media_library` / `hashtags` tables; no ordering column on `post_media`

`03_TSD` §9 lists both tables; neither exists, and `post_media.post_id` is `not null`, so there is no
workspace-level asset store. `post_media` also has no `position`/`ord` column.

**Meanwhile:** the media pane shows THIS post's media only, sorted by `created_at`, drag-reorder
disabled. FSD 3.1's "library" source is not faked.

## wt-db: no expired-hold reaper

`hold_expires_at` is written and the `credit_ledger_open_holds` partial index exists to support a
sweeper, but nothing sweeps. A crashed job holds credits indefinitely with no recourse.

**Meanwhile:** the wallet detects open HOLDs whose expiry has passed and says so honestly rather than
presenting them as normal. No client-side release is attempted (`apply_ledger_entry` is service-role).

## wt-db: `credit_ledger.model_tier` has no CHECK; role gating does not exist

`LedgerEntrySchema` types `model_tier` as `ModelTierSchema.nullable()` but nothing in the DB enforces
the vocabulary. Separately, `app.apply_tenant_policies` is role-blind — a `viewer` can insert, update
and delete posts.

**Meanwhile:** the wallet `safeParse`s per row and degrades unparseable rows rather than failing the
page. The role gap is documented, not enforced — apps/web does not fake a gate RLS would not back.

## wt-billing: no entitlement gate helper

Owner ruling #5 makes entitlements a separate gate called BEFORE `withCredits` at every AI entry
point; no helper ships yet.

**Meanwhile:** both paid post actions carry the same TODO as `brand-resolve.ts`. apps/web does NOT
invent a local entitlement check — that is the contract duplication `packages/shared` prevents.

## wt-billing: `withCredits` writes `model_tier: null` and no cogs on every DEBIT

Per `withCredits.ts:100-101` this is owner ruling #3, to be enriched via the mesh seam later. FSD 0.1
wants tier and cogs visible in the ledger.

**Meanwhile:** the wallet renders a null tier honestly as unrecorded. It never infers one from the
action type, even though it could.

## wt-billing: top-up cannot complete — fixture checkout URL does not resolve

`createFixtureProvider` returns `https://fixture.local/checkout?…`. The Alpha Gate wants a real
test-mode upgrade granting credits by webhook, and `05` §3 assigns that rail to the billing lane.

**Meanwhile:** apps/web consumes the `PaymentProvider` interface and renders the returned session as
an explicitly labelled sandbox result. It deliberately does NOT redirect to a dead host, and
implements no provider.

**Security note for whoever mounts the webhook route** (from `packages/billing/REQUESTS.md` §3):
`processPaymentEvent` applies a real plan grant for any verified `payment_succeeded` regardless of
`mode`, and the fixture signs with the hardcoded default `'fixture-webhook-secret'`. Select the
provider by environment, inject the real secret from env, and reject `event.mode === 'fixture'` when
`NODE_ENV === 'production'`. apps/web has not mounted such a route.

## apps/web (self, POST-DEMO): Sentry redaction is UNVERIFIED against a stored event

Sentry error reporting is merged and live — client, server (`onRequestError` +
`reportServerError`), and the scrubber are all wired and unit-tested. What has **not** been
proven end-to-end is that a secret sent through the real pipeline is redacted in **what Sentry
actually stores**. The parked step:

1. Add `SENTRY_AUTH_TOKEN` (event:read + project:read) to `apps/web/.env.local`.
2. Hit `/api/debug/sentry?kind=secret` while signed in (throws with fake credentials in the
   message — `lib/observability/debug-fixtures.ts`, never a real secret).
3. Read the stored event back via the Sentry API (`apps/web/scripts/verify-sentry.mjs`) and
   confirm BOTH: the event arrived AND the fake token is `[redacted]`, not present.

Why parked (owner ruling, 2026-07-24): error reporting working is worth more than proving
redaction on demo night. The scrubber is proven in isolation (`scrub.test.ts`,
`init-attachment.test.ts` — the options object `Sentry.init` receives is asserted and
mutation-tested); the only unproven link is arrival + redaction in Sentry's own storage.
`flush()` returning true is NOT arrival — a 403 drains identically. Close this before relying on
Sentry to be secret-safe in production.

---

## [CLOSED — shipped in 658b4c8] wt-db: `public.resolve_brand_memory` — the Brand Brain write RPC

**Resolved 2026-07-19.** wt-db shipped `20260719094548_resolve_brand_memory.sql` with live tests.
The delivered function is a superset of this request: it adds an optimistic `p_expected_version`
(CAS) 4th argument, a role allowlist (`FORBIDDEN_ROLE`), a no-existence-oracle `NOT_A_MEMBER`, and
payload guards (32 KB; `banned_phrases`/`red_lines` ≤ 40; fixed arrays exactly 3; `signal_lock`
enum). apps/web now calls it from `saveBrandMemory` with **three** arguments — omitting the CAS so a
rage-click on Finish replays the active payload as a success instead of `VERSION_CONFLICT` — and the
Refine editors cap the two open lists at 40 (`lib/brand/limits.ts`) so Finish can't fail
`INVALID_PAYLOAD`. Result is zod-parsed against `ResolveBrandMemoryResultSchema`.

**Original request follows.**

**Why:** Brand Resolve (FSD M1) produces a `BrandMemoryPayload` (via the `brand_guidelines`
mesh task) that must persist as a `brand_memory` version. `brand_memory` has RLS **read-only**
(`app.apply_tenant_read_policy` → `t_select` only; "all writes are server-side" by design), there
is **no write RPC**, and apps/web has **no service-role client** (forbidden). So the web lane can
resolve a brain but cannot save it. This is the exact shape of the `bootstrap_workspace` blocker —
same fix pattern.

**Requested function** (mirror `public.bootstrap_workspace`'s security model):

```sql
create or replace function public.resolve_brand_memory(
  p_workspace_id uuid,
  p_payload      jsonb,                 -- a validated BrandMemoryPayload (app zod-parses first)
  p_source       text default 'resolved' -- brand_memory_source: resolved | manual | system
) returns jsonb                          -- { "brand_memory": <row>, "version": int }
language plpgsql security definer set search_path = public
```

**Required semantics:**

1. Identity from `auth.jwt() ->> 'sub'` **only** (never an argument); null/empty → `raise 'AUTH_REQUIRED'`.
2. Membership check: caller must be a `workspace_members` row for `p_workspace_id`; else
   `raise 'NOT_A_MEMBER'` (do not leak existence). _(Optional: restrict to roles that may edit the
   brain — owner/editor/approver — if that maps to a product rule; viewer should not resolve.)_
3. Validate `p_source in ('resolved','manual','system')` → else `raise 'INVALID_SOURCE'`.
   Defense-in-depth: reject a payload missing the six top-level keys
   (`voice, brand_persona, customer_persona, hook, taboo, alignment`) → `raise 'INVALID_PAYLOAD'`.
4. `pg_advisory_xact_lock(hashtextextended('resolve_brand:' || p_workspace_id::text, 0))` to serialize
   concurrent resolves for one workspace (prevents two "active" rows / version races).
5. `v_version := coalesce(max(version), 0) + 1` for the workspace.
6. Supersede: `update brand_memory set status='superseded', updated_at=now()
where workspace_id = p_workspace_id and status = 'active'` (respects the
   `brand_memory_one_active` partial unique index — one active per workspace).
7. Insert the new row: `version = v_version, status = 'active', payload = p_payload,
source = p_source, created_by = v_user`.
8. Return `jsonb_build_object('brand_memory', to_jsonb(new_row), 'version', v_version)`.

**Grants:** `revoke all ... from public, anon; grant execute ... to authenticated, service_role;`
(client-reachable for signed-in members only — same as `bootstrap_workspace`).

**Idempotency (optional, nice-to-have):** each call creates a new version by design. If a double-submit
guard is wanted, add an optional `p_idempotency_key text` and short-circuit-return the existing row when
a version already carries that key — but `brand_memory` has no such column today, so the app instead
relies on the advisory lock + single-Finish UX for Alpha. The **credit charge** is already exactly-once
via `withCredits` `objectRef`, independent of this RPC.

**Until this lands:** the web onboarding flow resolves + refines + themes the brain and returns a typed
`SAVE_PENDING` at Finish (the `BOOTSTRAP_PENDING` pattern) — no fake "saved v1", brain held in session.
Wiring the persist call is a ~10-line change in `apps/web/src/app/actions/brand-resolve.ts` once the RPC
exists.

**Contract note:** naming drift to reconcile — `BrandMemorySourceSchema` uses `resolved|manual|system`
while an earlier TSD §5 draft referenced `created_by ∈ [user|system]`. The frozen shared schema
(`packages/shared/src/db/brand.ts`) is authoritative: `source` enum + a nullable text `created_by`.

## wt-mesh: `PlanWeekInputSchema.channels` needs `.max()` + de-dupe

`packages/mesh/src/tasks/plan-week.ts:10-13` bounds `channels` with `.min(1)` only, and the array
is joined verbatim into the paid prompt (`:41`). apps/web's `planMyWeek` de-dupes before calling
(`[...new Set(...)]`), so the amplification is closed at OUR boundary — but the schema itself
still accepts `Array(500_000).fill('x')` from any other caller under the 12MB server-action body
limit. A flat 20-credit charge against an arbitrarily inflated provider prompt is a
cost-amplification vector against Sahoda's own spend.

**Ask:** add `.max(8)` (or de-dupe via transform) to the schema so every caller is bounded.

## wt-db/shared: model-written `title`/`body` have no `.max()` anywhere in the chain

`PlanWeekOutputSchema.briefs[].title/.body` (shared/mesh/tasks.ts), `PostInsertSchema.title/.body`
(shared/db/content.ts) and the `posts` columns are all unbounded. `plan_week` is the first path
inserting five rows of MODEL text per click; apps/web caps at its boundary
(`lib/planner/briefs.ts`: 160/4000 code points) but the contract should carry the bound.

**Ask:** `.max()` on the shared schemas (owner to pick the numbers; ours are a stopgap).

## wt-db or owner ruling: `savePost` accepts any parseable `scheduled_at` — lead check is client-only

`PostUpdateSchema.scheduled_at` is a bare nullable string and `savePost` never calls
`validateScheduleLead` — any authenticated member can set a past date or one inside a channel's
`scheduleMinLeadMinutes` by posting the action directly. Pre-existing (the editor has the same
server gap); the planner's reschedule now exercises it from a second surface and its docstring
says so honestly. Widening `savePost` touches the editor's autosave path (client-validated values

- clock skew), so this wants a deliberate ruling, not a drive-by fix.

**Ask:** decide where the server-side schedule floor lives (savePost, a DB CHECK, or publish-time
only) and we'll wire the web side accordingly.
