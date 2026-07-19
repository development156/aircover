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
