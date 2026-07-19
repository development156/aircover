# packages/sites

Pure library: prompt → normalized draft → escaped static bundle → deploy port. No Supabase client,
no `next/*`, no env reads. Persistence + routing are **Task 17 (SiteStore port + wt-web mount),
DEFERRED post-Alpha** — the rules below are that task's contract and have no other home. Read them
before writing the mount.

Schema: `packages/db/supabase/migrations/20260718000007_sites.sql`. Row/insert zod:
`@sahoda/shared/db/sites`. Every interpolation into markup goes through `src/render/escape.ts`.

## 1. The public lead route derives the tenant — never reads it from the body

Resolve host/slug → `sites` row (`slug` is globally `unique`, so it resolves to exactly one), then
take **both `workspace_id` and `site_id` from that row**. Ignore whatever the payload says.

`leads.site_id` is `references sites (id) on delete set null` — the one **single-column** FK in the
family. `site_pages` and `site_sections` use composite `(parent_id, workspace_id)` FKs against
`sites (id, workspace_id)`, so the database itself refuses a cross-tenant attach. `leads` has no
such guard: a `site_id` belonging to another workspace inserts cleanly. The DB will not catch this
for you, which is exactly why the route must.

`LeadInsertSchema` is a **row shape, not a request shape** — it requires `workspace_id` and accepts
an optional `site_id`. Parsing the request body with it hands the caller both tenant fields.
Parse the body with a separate public-form schema carrying no tenant fields (`name`, `email`,
`phone`, `message`, and free-form `payload` / `source` only), then construct the insert with the
resolved ids. Adjacent fields checked: `payload` and `source` are jsonb and not tenant-bearing;
everything else on `LeadInsert` is content.

## 2. `leads` has no INSERT policy — the route is the entire perimeter

The migration enables RLS and creates `leads_select` + `leads_update` for `authenticated`. There is
**no insert policy at all**, so the only write path is the service role, which bypasses RLS. Nothing
below the route validates anything.

Verify Turnstile and apply the rate limit **before** the insert, never after. `TURNSTILE_*` is not
provisioned (see the sites-v0 plan, open issue #2) — while it is missing the route **fails closed**
and rejects the submission. An unprovisioned captcha that degrades to accepting everything is an
open public insert endpoint on a service-role connection.

## 3. `createSite` is one transaction

Insert site → pages → sections atomically. A partial site is not a site: a `sites` row with no
`site_pages` renders a blank host on a live slug, and a page with no `site_sections` is the same
failure one level down. Roll back the whole thing and report the failure.

## 4. `recordDeploy` carries `.eq('workspace_id', …)`

**CORRECTED:** there is no deploy table. Deploy state is `sites.deploy` (jsonb, shape =
`SiteDeployState` in `src/deploy/port.ts`) plus `sites.status` and `sites.last_deployed_at`, so
`recordDeploy` is an `UPDATE` on `sites`, not an insert. Under the service role a bare
`.eq('id', siteId)` writes any tenant's row; the `workspace_id` predicate is the only scope on that
statement. (Docs referring to `site_deployments` rows describe a table that does not exist —
history lives in `deploy.history`, capped by `DEPLOY_HISTORY_LIMIT`.)

Two different status vocabularies — do not cross them. `sites.status` CHECK is
`draft | deploying | published | failed | unpublished`. `SiteDeployState.status` is
`pending | live | failed`. `'live'` is **not** a legal `sites.status` value.

## 5. Deploy-status UI branches on `preview` BEFORE `status`

The fixture deployer returns `status: 'live'` with `preview: true` and a `file://` url. That pair is
honest only **conjunctively**. A consumer reading `status` alone renders "Live" for a path on one
machine's disk that nobody else can open — the fake-link failure the flag exists to prevent.

    preview === true  → "Preview only — not a public URL"   (whatever status says)
    preview === false → branch on status

`SiteDeployStateSchema` enforces `url !== null ⟺ status === 'live'` and forbids a `file://` url with
`preview: false`, so the schema cannot save you here: `{status:'live', preview:true}` is a valid,
intended state. Only the consumer can read it correctly.

## 6. Surface `dropped` to the founder

`normalizeDraft` returns `{ draft, dropped }`. Every discarded, truncated or coerced value is named
in `dropped` (`invalid-path:`, `duplicate-path:`, `dropped-section:`, `empty-page:`,
`home-not-hero:`, …). Callers **must render it**. Swallowing the array is how "the AI ate my page"
becomes unfalsifiable — producing that list honestly is the entire reason the normalize layer
exists. A caller that ignores it converts silent data loss into a mystery.

## Brand Skin (`src/theme/`)

`themeCss(tokens: ThemeTokens | null)` is landed (Tasks 7/8/9). `null` — the common path, since
`workspace_themes` is never seeded — yields `''` and the site keeps the inlined `tokens.css`
defaults. A populated theme emits **exactly** the seven themeable vars (`--p --pfg --pstrong --acc
--t50 --t100 --t300`) as a `:root{}` override; neutrals and semantics are fixed and never appear.

Two properties are load-bearing, do not regress them:

- **CSS-injection defense.** `ColorToken` is a bare `z.string()`, so a stored token can legally be
  `oklch(0.5 0.1 20); }</style>…`. Every emitted colour is `parseOklch → (Guard) → formatOklch` —
  machine-built numeric `oklch(L C H)`, structurally incapable of carrying `;`, `}`, `<` or `url(`.
  An unparseable **required** token (the primary) omits the WHOLE block (`''`), never a partial or
  raw one. `isEmittable` re-validates every value at the output boundary, so a weakened input guard
  still cannot ship `NaN`/`{` into a live stylesheet.
- **The Readability Guard adjusts the PRIMARY, not the stored foreground.** `tokens.primaryFg` is
  **deliberately not consumed** — a bare-string foreground can't be trusted. The Guard darkens the
  primary's lightness (hue/chroma fixed) until either `white` or `var(--ink)` clears WCAG AA 4.5:1,
  then emits that literal as `--pfg`. So a workspace brands its primary + tints; the text colour on
  the primary is auto-selected from two safe literals, never a chosen colour. This diverges from the
  skill's "adjust foreground lightness only" wording and is the plan's deliberate safety trade.

## Source bytes

Never type a control, bidi, zero-width or NUL character as a raw byte — always the `\uXXXX` escape.
Editing tools collapse escapes into raw bytes and git marks the file binary. `src/source-bytes.test.ts`
gates the package; after editing verify `git diff --no-index --numstat /dev/null <file>` (`-  -`
means corrupted — rewrite via python3).
